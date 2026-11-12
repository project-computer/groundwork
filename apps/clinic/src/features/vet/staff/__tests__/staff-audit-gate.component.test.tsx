import "@/index.css"
import { page } from "vitest/browser"
import { expect, it } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { App } from "@/app/App"
import { seedState } from "@/lib/vet/seed"

const STORAGE_KEY = "clinicbook:state:v1"
const seed = (state: object) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lastSyncedAt: undefined }))

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const openStaff = async () => {
  await page.viewport(1280, 900)
  seed(seedState)
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
  await page.getByRole("button", { name: "Staff & Permissions" }).click()
  await expect.element(page.getByRole("main").getByText("Audit trail")).toBeVisible()
}

const signInAs = async (name: string) => {
  const row = [...document.querySelectorAll(".staff-table .table-row")].find((r) => (r.textContent ?? "").includes(name))
  const button = row ? [...row.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Sign in as")) : undefined
  if (!button) throw new Error(`sign-in button for ${name} not found`)
  await button.click()
}

it("hides audit entries from members without staff.manage (P2-16)", async () => {
  await openStaff()

  // The default session member is a veterinarian — the trail must not render.
  const auditPanel = [...document.querySelectorAll("section")].find((p) => (p.textContent ?? "").includes("Audit trail"))!
  expect(auditPanel.textContent).toContain("reserved for clinic admins")
  expect(auditPanel.querySelectorAll(".activity-row")).toHaveLength(0)

  // Signing in as the admin reveals the real trail.
  await signInAs("Mai Rattana")
  const adminPanel = [...document.querySelectorAll("section")].find((p) => (p.textContent ?? "").includes("Audit trail"))!
  expect(adminPanel.querySelectorAll(".activity-row").length).toBeGreaterThan(0)
})
