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

it("surfaces overdue vaccinations and stock warnings, and navigates on click", async () => {
  await page.viewport(1280, 900)
  seed(seedState)
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
