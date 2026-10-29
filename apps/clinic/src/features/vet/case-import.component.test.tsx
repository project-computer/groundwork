import "@/index.css"
import { afterEach, expect, it } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { page } from "vitest/browser"
import { App } from "@/app/App"
import { seedState } from "@/lib/vet/seed"
import { buildCaseBundle, newShareToken } from "@/lib/vet/case-transfer"

const seed = (state: object) => localStorage.setItem("clinicbook:state:v1", JSON.stringify({ ...state, lastSyncedAt: undefined }))

/**
 * Types into a React-controlled input. Setting `.value` directly is deduped by
 * React's value tracker, so the prototype's native setter must be used.
 */
const typeInto = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!
  setter.call(element, value)
  element.dispatchEvent(new Event("input", { bubbles: true }))
}

/** Types a bundle into the open import dialog's paste field. */
const pasteBundle = async (pasted: string) => {
  const pasteBox = document.querySelector<HTMLTextAreaElement>("#import-paste")
  if (!pasteBox) throw new Error("paste textarea not found")
  typeInto(pasteBox, pasted)
  await new Promise((r) => setTimeout(r, 30))
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

it("imports a case bundle as a provenance-stamped copy and blocks double-import", async () => {
  await page.viewport(1280, 900)
  seed(seedState)
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))

  // Build a bundle for Tiger (p-3) as if another clinic shared it.
  const tiger = seedState.patients.find((p) => p.id === "p-3")!
  const bundle = buildCaseBundle({ ...seedState, clinic: { ...seedState.clinic, id: "clinic-99", name: "Riverside Vet" } }, tiger, newShareToken(), new Date().toISOString())
  const pasted = JSON.stringify(bundle)

  await page.getByRole("button", { name: "Medical Records" }).click()
  await page.getByRole("button", { name: "Import case" }).click()
  await pasteBundle(pasted)
  await page.getByRole("button", { name: "Import pasted bundle" }).click()

  const status = document.querySelector("[role='status']")
  expect(status?.textContent).toContain("Received Tiger from Riverside Vet")

  // The copy appears under Owners & Pets with a new MRN and provenance pill.
  await page.getByRole("button", { name: "Done" }).click()
  await page.getByRole("button", { name: "Owners & Pets" }).click()
  const search = document.querySelector<HTMLInputElement>("input[aria-label='Search owners or patients']")
  if (!search) throw new Error("search box not found")
  typeInto(search, "Tiger")
  await new Promise((r) => setTimeout(r, 50))

  const rows = [...document.querySelectorAll(".patients-table .table-row")]
  const tigerRows = rows.filter((r) => (r.textContent ?? "").includes("Tiger"))
  expect(tigerRows.length, "original + received copy").toBe(2)
  const copy = tigerRows.find((r) => (r.textContent ?? "").includes("Received from Riverside Vet"))
  expect(copy, "copy should carry the provenance pill").toBeTruthy()
  expect(copy?.textContent).toMatch(/PT-\d{4}-0006/)
  expect(copy?.textContent).not.toContain("PT-2026-0003 ·")

  // Double-import of the same token is refused.
  await page.getByRole("button", { name: "Medical Records" }).click()
  await new Promise((r) => setTimeout(r, 30))
  await page.getByRole("button", { name: "Import case" }).click()
  await pasteBundle(pasted)
  await page.getByRole("button", { name: "Import pasted bundle" }).click()
  const dup = document.querySelector("[role='status']")
  expect(dup?.textContent).toContain("already received")
})
