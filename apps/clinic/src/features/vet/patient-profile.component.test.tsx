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

it("edits patient identity and owner contact details from the profile dialog", async () => {
  await page.viewport(1280, 900)
  seed(seedState)
  await renderApp()
  await page.getByRole("button", { name: "Owners & Pets" }).click()

  // Tiger (p-3) belongs to Somchai Prasert (o-2).
  await rowButton("Tiger", "View")

  const ownerName = page.getByLabelText("Owner name")
  const patientName = page.getByLabelText("Patient name")
  await expect.element(ownerName).toHaveValue("Somchai Prasert")
  await expect.element(patientName).toHaveValue("Tiger")

  await patientName.fill("Tiger II")
  await page.getByLabelText("Phone").fill("089 000 1111")
  await page.getByLabelText("Weight (kg)").fill("33.1")
  await page.getByRole("button", { name: "Save Profile" }).click()

  // The list reflects the renamed patient and the owner is untouched.
  await expect.element(page.getByText("Tiger II", { exact: true })).toBeVisible()
  await expect.element(page.getByText("Somchai Prasert", { exact: true })).toBeVisible()

  // Reopening proves both records were dispatched, not just local form state.
  await rowButton("Tiger II", "View")
  await expect.element(page.getByLabelText("Patient name")).toHaveValue("Tiger II")
  await expect.element(page.getByLabelText("Phone")).toHaveValue("089 000 1111")
  await expect.element(page.getByLabelText("Weight (kg)")).toHaveValue("33.1")
})

it("blocks saving when the patient name is blank", async () => {
  await page.viewport(1280, 900)
  seed(seedState)
  await renderApp()
  await page.getByRole("button", { name: "Owners & Pets" }).click()

  await rowButton("Tiger", "View")
  await page.getByLabelText("Patient name").fill("")

  await expect.element(page.getByRole("button", { name: "Save Profile" })).toBeDisabled()
})

const renderApp = async () => {
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
}

/** Clicks a named action button inside the table row that mentions `text`. */
const rowButton = async (text: string, label: string) => {
  const row = [...document.querySelectorAll(".table-row")].find((r) => (r.textContent ?? "").includes(text))
  if (!row) throw new Error(`row for ${text} not found`)
  const button = [...row.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === label)
  if (!button) throw new Error(`${label} button not found for ${text}`)
  await button.click()
}
