import "@/index.css"
import { afterEach, expect, it } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { page } from "vitest/browser"
import { App } from "@/app/App"
import { seedState } from "@/lib/vet/seed"

const STORAGE_KEY = "clinicbook:state:v1"
const seed = (state: object) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lastSyncedAt: undefined }))

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const openBillingAsAdmin = async () => {
  await page.viewport(1400, 1200)
  seed(seedState)
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
  await page.getByRole("button", { name: "Staff & Permissions" }).click()
  const row = [...document.querySelectorAll(".staff-table .table-row")].find((r) => (r.textContent ?? "").includes("Mai Rattana"))
  const button = row ? [...row.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Sign in as")) : undefined
  if (!button) throw new Error("sign-in button not found")
  await button.click()
  await page.getByRole("button", { name: "Billing & Payments" }).click()
  await expect.poll(() => document.body.innerText).toContain("Invoices")
}

it("takes an invoice from draft to paid", async () => {
  await openBillingAsAdmin()

  // Create a draft for 2 consultations.
  await page.getByRole("button", { name: "New invoice" }).click()
  await page.getByLabelText("Line item").selectOptions("svc-1")
  await page.getByLabelText("Quantity").fill("2")
  await page.getByRole("button", { name: "Create draft invoice" }).click()

  await expect.poll(() => document.body.innerText).toContain("INV-2026-0143")
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
  const draft = saved.invoices.find((i: { number: string }) => i.number === "INV-2026-0143")
  expect(draft.status).toBe("draft")
  expect(draft.items[0]).toMatchObject({ quantity: 2, unitPrice: 50000 })

  // A draft owes its full total: 2 × 500.00 + 7% VAT.
  await expect.poll(() => document.body.innerText).toContain("1,070.00")

  // Posting freezes the items and opens the payment path.
  const invoiceRow = [...document.querySelectorAll(".billing-table .table-row")].find((r) => r.textContent?.includes("INV-2026-0143"))!
  const post = [...invoiceRow.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Post invoice")!
  await post.click()

  await expect.poll(() => {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    return s.invoices.find((i: { number: string }) => i.number === "INV-2026-0143").status
  }).toBe("posted")

  // Settle it in full with cash.
  const postedRow = [...document.querySelectorAll(".billing-table .table-row")].find((r) => r.textContent?.includes("INV-2026-0143"))!
  const pay = [...postedRow.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Record payment")!
  await pay.click()

  const dialog = await expect.poll(() => document.querySelector('.modal[aria-label^="Record payment"]'))
  expect(dialog).toBeTruthy()
  expect((document.getElementById("pay-amount") as HTMLInputElement).value).toBe("1070.00")
  await page
    .getByRole("dialog", { name: /Record payment for INV-2026-0143/ })
    .getByRole("button", { name: "Record payment" })
    .click()

  await expect.poll(() => document.querySelector(".modal")).toBeNull()
  await expect.poll(() => {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    return s.invoices.find((i: { number: string }) => i.number === "INV-2026-0143").status
  }).toBe("paid")

  const settled = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
  const payment = settled.payments.find((p: { invoiceId: string }) => p.invoiceId === settled.invoices.find((i: { number: string }) => i.number === "INV-2026-0143").id)
  expect(payment.amount).toBe(107000)

  // The ledger lists it and the row no longer shows a balance.
  await expect.poll(() => document.body.innerText).toContain("1,070.00")
  const audit = settled.audit.map((a: { action: string }) => a.action).slice(0, 3)
  expect(audit).toEqual(expect.arrayContaining(["payment.record", "invoice.post", "invoice.create"]))
})
