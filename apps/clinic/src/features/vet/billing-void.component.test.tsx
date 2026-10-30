import "@/index.css"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { page } from "vitest/browser"
import { App } from "@/app/App"
import { seedState } from "@/lib/vet/seed"

const seed = (state: object) => localStorage.setItem("clinicbook:state:v1", JSON.stringify({ ...state, lastSyncedAt: undefined }))

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

it("voids a posted invoice with no payments and keeps it out of outstanding", async () => {
  await page.viewport(1280, 900)
  seed(seedState)

  await renderApp()
  await signInAsAdmin()
  await page.getByRole("button", { name: "Billing & Payments" }).click()

  const voidButton = page.getByRole("button", { name: "Void", exact: true })
  await expect.element(voidButton).toBeVisible()
  await voidButton.click()

  // Destructive action asks for confirmation in a dialog before voiding.
  const dialog = page.getByRole("dialog", { name: "Void INV-2026-0142" })
  await expect.element(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Void invoice" }).click()
  await expect.element(dialog).not.toBeInTheDocument()

  const voidedRow = page.getByRole("button", { name: "Record payment" })
  await expect.element(voidedRow).not.toBeInTheDocument()

  // Outstanding stat must not count the voided invoice.
  const statCard = document.querySelectorAll(".stat-card")[0]
  expect(statCard?.textContent).toContain("0 open invoices")
})

it("keeps the invoice when the void confirmation is dismissed", async () => {
  await page.viewport(1280, 900)
  seed(seedState)

  await renderApp()
  await signInAsAdmin()
  await page.getByRole("button", { name: "Billing & Payments" }).click()

  await page.getByRole("button", { name: "Void", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Void INV-2026-0142" })
  await expect.element(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Keep invoice" }).click()
  await expect.element(dialog).not.toBeInTheDocument()

  // Still posted, still payable.
  await expect.element(page.getByRole("button", { name: "Record payment" })).toBeVisible()
})

it("offers no void on invoices that already have payments", async () => {
  await page.viewport(1280, 900)
  seed({
    ...seedState,
    payments: [{ id: "pay-1", invoiceId: "inv-1", amount: 1000, method: "cash" as const, receivedAt: seedState.invoices[0].createdAt }],
  })

  await renderApp()
  await signInAsAdmin()
  await page.getByRole("button", { name: "Billing & Payments" }).click()

  await expect.element(page.getByRole("button", { name: "Record payment" })).toBeVisible()
  const voidButton = page.getByRole("button", { name: "Void", exact: true })
  await expect.element(voidButton).not.toBeInTheDocument()
})

const renderApp = async () => {
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
}

/** Admin holds billing.write regardless of role-matrix changes. */
const signInAsAdmin = async () => {
  await page.getByRole("button", { name: "Staff & Permissions" }).click()
  const row = [...document.querySelectorAll(".staff-table .table-row")].find((r) =>
    (r.textContent ?? "").includes("Mai Rattana"),
  )
  if (!row) throw new Error("admin staff row not found")
  const button = [...row.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Sign in as"))
  if (!button) throw new Error("sign-in button not found")
  await button.click()
}
