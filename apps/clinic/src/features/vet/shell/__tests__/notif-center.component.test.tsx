import "@/index.css"
import { afterEach, expect, it } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { page } from "vitest/browser"
import { App } from "@/app/App"
import { seedState } from "@/lib/vet/seed"

const seed = (state: object) => localStorage.setItem("clinicbook:state:v1", JSON.stringify({ ...state, lastSyncedAt: undefined }))

/** ISO date `days` from now — clock-proof near-expiry fixtures. */
const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

afterEach(() => {
  cleanup()
  localStorage.clear()
})

it("surfaces overdue vaccinations and stock warnings, and navigates on click", async () => {
  await page.viewport(1280, 900)
  // The static seed's near-expiry lots rot with the calendar; this test is
  // about the worklist logic, so the near-expiry dates roll with the clock.
  const clockProof = {
    ...seedState,
    inventoryLots: seedState.inventoryLots.map((lot) =>
      Object.assign({}, lot, {
        expiryDate: lot.id === "lot-2" ? soon(25) : lot.id === "lot-3" ? soon(20) : lot.expiryDate,
      }),
    ),
  }
  seed(clockProof)
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))

  // The seed has overdue vaccinations (Tiger, Khao Niao), low stock (bandage,
  // rabies vaccine, amoxicillin) and lots expiring within 30 days.
  const bell = page.getByRole("button", { name: /Notifications \(\d+ pending\)/ })
  await expect.element(bell).toBeVisible()
  await bell.click()

  const panel = page.getByRole("dialog", { name: "Notifications" })
  await expect.element(panel).toBeVisible()

  const panelEl = document.querySelector('[role="dialog"]')
  const text = [...(panelEl?.querySelectorAll("button") ?? [])].map((n) => n.textContent ?? "").join(" | ")
  expect(text).toContain("Vaccination overdue — Tiger")
  expect(text).toContain("Low stock — Cohesive bandage 5cm")
  expect(text).toContain("Expiring soon")

  // Overdue patients appear once: the worklist no longer also lists them as
  // "due soon" (the raw due-window helper has no lower bound).
  expect(text.split("Vaccination overdue — Tiger").length - 1).toBe(1)
  expect(text).not.toContain("Vaccination due —")

  // Clicking an inventory reminder navigates to Pharmacy & Inventory.
  const lowStockItem = [...(panelEl?.querySelectorAll("button") ?? [])].find((n) => (n.textContent ?? "").includes("Low stock"))
  lowStockItem!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  await new Promise((r) => setTimeout(r, 50))
  const active = document.querySelector(".nav-item.active")
  expect((active?.textContent ?? "").toLowerCase()).toContain("inventory")
})
