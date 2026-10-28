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

const openConsultation = async () => {
  await page.viewport(1400, 1200)
  seed(seedState)
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
  await page.getByRole("button", { name: "Appointments & Queue" }).click()
  const card = [...document.querySelectorAll(".cal-appt")].find((c) => (c.textContent ?? "").includes("Moo Daeng"))
  const start = card ? [...card.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Start")) : undefined
  if (!start) throw new Error("checked-in appointment not found")
  await start.click()
  await expect.poll(() => document.body.innerText).toContain("Prescriptions")
}

it("refuses to prescribe more than the pharmacy has in stock", async () => {
  await openConsultation()

  // lot-2 holds 24 amoxicillin tablets.
  await page.getByLabelText("Medication").selectOptions("it-2")
  await page.getByLabelText("Dose").fill("1 tablet")
  await page.getByLabelText("Quantity").fill("30")

  await expect.poll(() => document.querySelector(".form-hint.is-bad")?.textContent ?? "").toContain("Only 24 tablet left in stock")
  const add = () => [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Add prescription")
  expect(add()?.disabled).toBe(true)

  await page.getByLabelText("Quantity").fill("8")
  await expect.poll(() => add()?.disabled).toBe(false)
  add()?.click()

  await expect.poll(() => document.querySelectorAll(".rx-row strong")).toBeTruthy()
  expect(document.body.innerText).toContain("Amoxicillin 250 mg tablet")
})
