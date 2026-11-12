import "@/index.css"
import { afterEach, expect, it } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { page } from "vitest/browser"
import { App } from "@/app/App"
import { seedState } from "@/lib/vet/seed"

const STORAGE_KEY = "clinicbook:state:v1"
const seed = (state: object) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lastSyncedAt: undefined }))

const originalAnchorClick = HTMLAnchorElement.prototype.click
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
const downloads: HTMLAnchorElement[] = []
const blobs: Blob[] = []

afterEach(() => {
  cleanup()
  localStorage.clear()
  HTMLAnchorElement.prototype.click = originalAnchorClick
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
  downloads.length = 0
  blobs.length = 0
})

const openSettingsAsAdmin = async () => {
  await page.viewport(1400, 1200)
  seed(seedState)
  HTMLAnchorElement.prototype.click = function () {
    downloads.push(this)
  }
  URL.createObjectURL = (blob: Blob) => {
    blobs.push(blob)
    return "blob:export"
  }
  URL.revokeObjectURL = () => {}
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
  // Default session is a veterinarian, which has no export permission — sign
  // in as the admin so the export buttons enable.
  await page.getByRole("button", { name: "Staff & Permissions" }).click()
  const maiRow = [...document.querySelectorAll(".staff-table .table-row")].find((r) => (r.textContent ?? "").includes("Mai Rattana"))
  const signIn = maiRow ? [...maiRow.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Sign in as")) : undefined
  if (!signIn) throw new Error("admin sign-in button not found")
  await signIn.click()
  await page.getByRole("button", { name: /Settings/ }).click()
  await expect.poll(() => document.body.innerText).toContain("Portability & recovery")
}

it("exports the owner & patient register as CSV and audits it (BKP-06)", async () => {
  await openSettingsAsAdmin()
  await page.getByRole("button", { name: "Export CSV" }).click()
  await expect.poll(() => downloads.length).toBe(1)
  expect(downloads[0]?.download).toMatch(/^vetcare-register-baan-sathorn/)
  const csvBlob = blobs[0]
  // blob.text() decodes away the UTF-8 BOM — prove it's in the file bytes
  // (Excel compatibility) by reading the raw leading three bytes instead.
  const head = new Uint8Array(await csvBlob.arrayBuffer()).slice(0, 3)
  expect([...head]).toEqual([0xef, 0xbb, 0xbf])
  const csv = await csvBlob.text()
  expect(csv).toContain('"Patient"')
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
  expect(saved.audit[0]).toMatchObject({ action: "data.export", actorId: "u-mai" })
})

it("exports medical records as the documented JSON document (BKP-07)", async () => {
  await openSettingsAsAdmin()
  await page.getByRole("button", { name: "Export records" }).click()
  await expect.poll(() => downloads.length).toBe(1)
  expect(downloads[0]?.download).toMatch(/^vetcare-records-baan-sathorn/)
  const records = JSON.parse(await blobs[0].text())
  expect(records.format).toBe("vetcare-medical-records")
  expect(records.patients.some((p: { name: string }) => p.name === "Tiger")).toBe(true)
})

it("keeps the export buttons disabled for members without data.export", async () => {
  await page.viewport(1400, 1200)
  seed(seedState)
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
  await page.getByRole("button", { name: /Settings/ }).click()
  await expect.poll(() => document.body.innerText).toContain("Portability & recovery")
  await expect.element(page.getByRole("button", { name: "Export CSV" })).toBeDisabled()
  await expect.element(page.getByRole("button", { name: "Export records" })).toBeDisabled()
})
