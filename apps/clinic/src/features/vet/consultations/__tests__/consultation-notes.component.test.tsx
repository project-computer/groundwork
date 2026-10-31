import "@/index.css"
import { afterEach, expect, it } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { page } from "vitest/browser"
import { App } from "@/app/App"
import { seedState } from "@/lib/vet/seed"

const STORAGE_KEY = "clinicbook:state:v1"

const seed = (state: object) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lastSyncedAt: undefined }))

const bodyText = () => document.body.innerText

afterEach(() => {
  cleanup()
  localStorage.clear()
})

/** Starts the checked-in appointment for Moo Daeng and lands in the consult view. */
const openConsultation = async () => {
  await page.viewport(1400, 1000)
  seed(seedState)
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
  await page.getByRole("button", { name: "Appointments & Queue" }).click()
  const card = [...document.querySelectorAll(".cal-appt")].find((c) => (c.textContent ?? "").includes("Moo Daeng"))
  if (!card) throw new Error("checked-in appointment card not found")
  const start = [...card.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Start"))
  if (!start) throw new Error("start button not found")
  await start.click()
  await expect.poll(bodyText).toContain("Clinical notes")
}

it("amends a clinical note with a reason and keeps the original", async () => {
  await openConsultation()

  await page.getByLabelText("Clinical notes").fill("Temp 38.6, mild dehydration. Start NSAIDs.")
  await page.getByRole("button", { name: "Add note" }).click()
  await expect.poll(bodyText).toContain("mild dehydration")

  const amend = [...document.querySelectorAll(".note-entry button")].find((b) => (b.textContent ?? "").trim() === "Amend")
  if (!amend) throw new Error("amend button not found")
  await amend.click()

  await page.getByLabelText("Reason for amendment").fill("Corrected temperature reading")
  await page.getByLabelText("Amended note").fill("Temp 39.1, mild dehydration. Start NSAIDs.")
  await page.getByRole("button", { name: "Save amendment" }).click()

  await expect.poll(bodyText).toContain("Temp 39.1")
  // The original note is not overwritten, and the amendment records its reason.
  expect(bodyText()).toContain("Temp 38.6")
  expect(bodyText()).toContain("Amendment")
  expect(bodyText()).toContain("Corrected temperature reading")

  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
  const notes: { body: string; amendReason?: string; amends?: string }[] = saved.encounters.flatMap(
    (e: { notes: { body: string; amendReason?: string; amends?: string }[] }) => e.notes,
  )
  const amendment = notes.find((n) => n.amends)
  expect(amendment).toMatchObject({ body: "Temp 39.1, mild dehydration. Start NSAIDs.", amendReason: "Corrected temperature reading" })
})

it("confirms a provisional diagnosis", async () => {
  await openConsultation()

  await page.getByLabelText("Diagnosis").fill("Otitis externa, left ear")
  await page.getByRole("button", { name: "Add diagnosis" }).click()

  const confirm = page.getByRole("button", { name: "Confirm diagnosis Otitis externa, left ear" })
  await expect.element(confirm).toBeVisible()
  await confirm.click()

  await expect.element(confirm).not.toBeInTheDocument()
  await expect.poll(bodyText).toContain("Otitis externa, left ear")

  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
  const diagnoses: { description: string; status: string }[] = saved.encounters.flatMap(
    (e: { diagnoses: { description: string; status: string }[] }) => e.diagnoses,
  )
  expect(diagnoses.find((d) => d.description === "Otitis externa, left ear")?.status).toBe("confirmed")
})
