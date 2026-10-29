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

/** inv-1 totals 984.40 THB (consult + meloxicam, 7% VAT). */
const paidState = () => ({
  ...seedState,
  payments: [
    {
      id: "pay-1",
      invoiceId: "inv-1",
      amount: 98440,
      method: "cash" as const,
      receivedAt: seedState.invoices[0].createdAt,
    },
  ],
  invoices: seedState.invoices.map((i) => (i.id === "inv-1" ? Object.assign({}, i, { status: "paid" as const }) : i)),
})

it("refunds part of a payment and reopens the invoice", async () => {
  await page.viewport(1280, 1000)
  seed(paidState())
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
  await signInAsAdmin()
  await page.getByRole("button", { name: "Billing & Payments" }).click()

  const refund = [...document.querySelectorAll(".activity-row button")].find((b) => (b.textContent ?? "").trim() === "Refund")
  if (!refund) throw new Error("refund button not found")
  await refund.click()

  await page.getByLabelText("Refund amount (THB)").fill("200.00")
  await page.getByLabelText(/Reason/).fill("Owner cancelled the follow-up")
  await page.getByRole("button", { name: "Record refund" }).click()

  await expect.poll(() => document.querySelector(".modal")).toBeNull()

  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
  const refundEntry = saved.payments.find((p: { kind?: string }) => p.kind === "refund")
  expect(refundEntry).toMatchObject({ amount: -20000, refundOf: "pay-1", note: "Owner cancelled the follow-up" })

  const invoice = saved.invoices.find((i: { id: string }) => i.id === "inv-1")
  expect(invoice.status).toBe("posted")

  // The ledger shows the refund, and the invoice balance is back to 200 THB.
  await expect.poll(() => document.body.innerText).toContain("200.00")
  await expect.poll(() => document.body.innerText).toContain("Owner cancelled the follow-up")
})

it("allows a full refund and makes the invoice voidable again", async () => {
  await page.viewport(1280, 1000)
  seed(paidState())
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
  await signInAsAdmin()
  await page.getByRole("button", { name: "Billing & Payments" }).click()

  const refund = [...document.querySelectorAll(".activity-row button")].find((b) => (b.textContent ?? "").trim() === "Refund")
  if (!refund) throw new Error("refund button not found")
  await refund.click()

  // Full refund of 984.40 THB leaves a zero balance on a paid invoice.
  await page.getByLabelText("Refund amount (THB)").fill("984.40")
  await page.getByLabelText(/Reason/).fill("Duplicate charge")
  await page.getByRole("button", { name: "Record refund" }).click()

  await expect.poll(() => document.querySelector(".modal")).toBeNull()
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
  const invoice = saved.invoices.find((i: { id: string }) => i.id === "inv-1")
  // The money went back, so the invoice owes its total again.
  expect(invoice.status).toBe("posted")
  expect(saved.payments.find((p: { kind?: string }) => p.kind === "refund").amount).toBe(-98440)

  // With no money held, the invoice can now be voided.
  await expect.poll(() => [...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").trim() === "Void")).toBe(true)
})

const signInAsAdmin = async () => {
  await page.getByRole("button", { name: "Staff & Permissions" }).click()
  const row = [...document.querySelectorAll(".staff-table .table-row")].find((r) => (r.textContent ?? "").includes("Mai Rattana"))
  const button = row ? [...row.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Sign in as")) : undefined
  if (!button) throw new Error("sign-in button not found")
  await button.click()
}
