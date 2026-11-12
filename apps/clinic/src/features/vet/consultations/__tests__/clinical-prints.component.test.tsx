import "@/index.css"
import { page } from "vitest/browser"
import { expect, it } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { App } from "@/app/App"
import { seedState } from "@/lib/vet/seed"

// The printable clinical outputs (MED-11 / RX-05) are asserted through the
// full app: Consultation → the archived visit → the print dialogs. The seed's
// only visit (Tiger, e-1) carries vitals, a diagnosis, a prescription and a
// note — enough to assert every sheet section.

const openArchivedVisit = async () => {
  await page.viewport(1280, 900)
  localStorage.setItem("clinicbook:state:v1", JSON.stringify({ ...seedState, lastSyncedAt: undefined }))
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
  await page.getByRole("button", { name: "Medical Records" }).click()
  await page.getByRole("button", { name: "Consultation" }).click()
  // The archived visit opens from the recent-visits list.
  const row = [...document.querySelectorAll(".activity-row")].find((r) => (r.textContent ?? "").includes("Archived visit"))!
  const view = [...row.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("View"))!
  await view.click()
  await expect.element(page.getByText("Consultation closed")).toBeVisible()
}

afterEach(cleanup)

it("renders the consultation summary sheet with every clinical section", async () => {
  await openArchivedVisit()
  await page.getByRole("button", { name: "Print summary" }).click()

  await expect.element(page.getByText("Consultation summary")).toBeVisible()
  const area = document.querySelector(".print-area")!
  expect(area.textContent).toContain("PT-2026-0003")
  expect(area.textContent).toContain("Soft tissue strain, right stifle")
  expect(area.textContent).toContain("Meloxicam 1.5 mg/ml oral")
  expect(area.textContent).toContain("Mild lameness RH")
  expect(area.textContent).toContain(seedState.clinic.name)
  await expect.element(page.getByRole("button", { name: "Print summary" }).last()).toBeVisible()
})

it("renders the prescription sheet with medication, instructions and prescriber", async () => {
  await openArchivedVisit()
  await page.getByRole("button", { name: "Print prescription" }).click()

  await expect.element(page.getByText("Prescription", { exact: true })).toBeVisible()
  const area = document.querySelector(".print-area")!
  expect(area.textContent).toContain("Meloxicam 1.5 mg/ml oral")
  expect(area.textContent).toContain("0.1 mg/kg · PO · 7 days")
  expect(area.textContent).toContain("SID")
  expect(area.textContent).toContain("Dr. Pim Chaiyasit")
  expect(area.textContent).toContain("Signature")
})
