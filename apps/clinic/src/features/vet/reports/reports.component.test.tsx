import "@/index.css"
import { afterEach, expect, it } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { page } from "vitest/browser"
import { App } from "@/app/App"
import { seedState } from "@/lib/vet/seed"

/**
 * The report model is translation-free and unit-tested; this covers the view
 * side of that contract — label descriptors render as day numbers, weekday
 * names and month names per range.
 */

const seed = (state: object) => localStorage.setItem("clinicbook:state:v1", JSON.stringify({ ...state, lastSyncedAt: undefined }))

afterEach(() => {
  cleanup()
  localStorage.clear()
})

/** The x-axis labels inside the trend chart. */
const trendLabels = () =>
  [...document.querySelectorAll('[title*="collected"] small')].map((el) => (el.textContent ?? "").trim()).filter(Boolean)

it("renders trend labels that match the selected range", async () => {
  await page.viewport(1400, 1200)
  seed(seedState)
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
  await page.getByRole("button", { name: "Reports" }).click()

  await expect.element(page.getByText("Revenue trend")).toBeVisible()

  // Default 30 days: buckets are calendar days, so labels are day numbers and
  // the period reads as a date range.
  await expect.poll(() => trendLabels().some((label) => /^\d{1,2}$/.test(label))).toBe(true)
  expect(document.body.innerText).toMatch(/\d{1,2} \w{3} \d{4} – \d{1,2} \w{3} \d{4}/)

  // Seven days: labels become weekday names.
  await page.getByRole("button", { name: "7 days" }).click()
  await expect
    .poll(() => trendLabels().every((label) => /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/.test(label)))
    .toBe(true)

  // All time: the all-time sentence is translated by the view, not the model.
  await page.getByRole("button", { name: "All time" }).click()
  await expect.element(page.getByText(/All activity through/)).toBeVisible()
})
