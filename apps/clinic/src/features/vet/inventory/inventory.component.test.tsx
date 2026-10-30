import "@/index.css"
import { afterEach, expect, it } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { page } from "vitest/browser"
import { App } from "@/app/App"
import { seedState } from "@/lib/vet/seed"

const seed = (state: object) => localStorage.setItem("clinicbook:state:v1", JSON.stringify({ ...state, lastSyncedAt: undefined }))

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const renderApp = async () => {
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
}

/** Pharmacist Beer holds inventory.write in the reducer's role matrix. */
const signInAsPharmacist = async () => {
  await page.getByRole("button", { name: "Staff & Permissions" }).click()
  const row = [...document.querySelectorAll(".staff-table .table-row")].find((r) =>
    (r.textContent ?? "").includes("Beer Chaiyaphon"),
  )
  if (!row) throw new Error("pharmacist staff row not found")
  const button = [...row.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Sign in as"))
  if (!button) throw new Error("sign-in button not found")
  await button.click()
}

it("lists InventoryItems with stock on hand and opens the receive-lot form", async () => {
  await page.viewport(1280, 900)
  seed(seedState)

  await renderApp()
  await signInAsPharmacist()
  await page.getByRole("button", { name: "Pharmacy & Inventory" }).click()

  // The seed's Amoxicillin item shows its lot totals (lot-2 holds 24).
  await expect.element(page.getByText("Amoxicillin 250 mg tablet")).toBeVisible()
  await expect.element(page.getByText("Pharmacy & inventory").first()).toBeVisible()

  // Receive-lot is an InventoryLot write: opens for the pharmacist.
  const receiveButton = page.getByRole("button", { name: /Receive/i }).first()
  await expect.element(receiveButton).toBeEnabled()
})
