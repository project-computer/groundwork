import "@/index.css"
import { afterEach, expect, it } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { page } from "vitest/browser"
import { App } from "@/app/App"
import { seedState } from "@/lib/vet/seed"

const STORAGE_KEY = "clinicbook:state:v1"

const seed = (state: object) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lastSyncedAt: undefined }))

const savedAppointments = () => {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? (JSON.parse(raw).appointments as unknown[]) : []
}

const warningText = () => document.querySelector('[role="alert"]')?.textContent ?? ""
const saveButton = () => document.querySelector<HTMLButtonElement>(".modal .panel-footer .button.primary")

afterEach(() => {
  cleanup()
  localStorage.clear()
})

it("warns before double-booking a vet and saves once acknowledged", async () => {
  await page.viewport(1280, 900)
  seed(seedState)
  await renderApp()
  await page.getByRole("button", { name: "Appointments & Queue" }).click()

  await page.getByRole("button", { name: "Book appointment" }).click()

  // Dr. Pim already has a checked-in patient at 10:00–10:20 today.
  await expect.poll(warningText).toContain("already booked at 10:00")
  await expect.poll(warningText).toContain("Moo Daeng")

  expect(saveButton()?.disabled, "clash must block the save button").toBe(true)

  await page.getByLabelText(/Book anyway/).click()
  await expect.poll(() => saveButton()?.disabled).toBe(false)

  saveButton()?.click()

  await expect.poll(() => document.querySelector(".modal")).toBeNull()
  await expect.poll(() => savedAppointments().length).toBe(seedState.appointments.length + 1)
})

it("books without a warning when the slot is free", async () => {
  await page.viewport(1280, 900)
  seed(seedState)
  await renderApp()
  await page.getByRole("button", { name: "Appointments & Queue" }).click()

  await page.getByRole("button", { name: "Book appointment" }).click()
  await page.getByLabelText("Time").fill("11:00")

  await expect.poll(() => document.querySelector('[role="alert"]')).toBeNull()
  const save = document.querySelector<HTMLButtonElement>(".modal .panel-footer .button.primary")
  expect(save?.disabled).toBe(false)
  save?.click()

  await expect.poll(() => savedAppointments().length).toBe(seedState.appointments.length + 1)
})

const renderApp = async () => {
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
}
