import "@/index.css"
import { afterEach, expect, it } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { page } from "vitest/browser"
import { App } from "@/app/App"
import { seedState } from "@/lib/vet/seed"
import { buildBackup } from "@/lib/vet/backup"

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

const signInAsAdmin = async () => {
  await page.getByRole("button", { name: "Staff & Permissions" }).click()
  const row = [...document.querySelectorAll(".staff-table .table-row")].find((r) => (r.textContent ?? "").includes("Mai Rattana"))
  const button = row ? [...row.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Sign in as")) : undefined
  if (!button) throw new Error("sign-in button not found")
  await button.click()
}

const openSettings = async () => {
  await page.viewport(1400, 1200)
  seed(seedState)
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
  await signInAsAdmin()
  await page.getByRole("button", { name: /Settings/ }).click()
  await expect.poll(() => document.body.innerText).toContain("Portability & recovery")
}

it("downloads a restorable backup and audits the export", async () => {
  await openSettings()
  HTMLAnchorElement.prototype.click = function () {
    downloads.push(this)
  }
  URL.createObjectURL = (blob: Blob) => {
    blobs.push(blob)
    return "blob:backup"
  }
  URL.revokeObjectURL = () => {}

  await page.getByRole("button", { name: "Create backup" }).click()
  await expect.poll(() => downloads.length).toBe(1)

  if (!blobs[0]) throw new Error("backup download produced no blob")
  const backup = JSON.parse(await blobs[0].text())
  expect(backup.format).toBe("vetcare-clinic-backup")
  expect(backup.version).toBe(1)
  expect(backup.state.patients).toHaveLength(seedState.patients.length)
  expect(downloads[0]?.download).toMatch(/^vetcare-backup-/)

  await expect.poll(() => document.body.innerText).toContain("Backup downloaded")
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
  expect(saved.audit[0]).toMatchObject({ action: "backup.create", actorId: "u-mai" })
})

it("previews a backup before replacing the clinic", async () => {
  await openSettings()

  const backup = buildBackup(
    { ...seedState, clinic: { ...seedState.clinic, name: "Riverside Recovery" }, patients: [seedState.patients[0]] },
    new Date().toISOString(),
  )
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Choose a backup file"]')
  if (!input) throw new Error("backup file input not found")
  const transfer = new DataTransfer()
  transfer.items.add(new File([JSON.stringify(backup)], "backup.json", { type: "application/json" }))
  input.files = transfer.files
  input.dispatchEvent(new Event("change", { bubbles: true }))

  await expect.poll(() => document.body.innerText).toContain("Restore clinic backup")
  expect(document.body.innerText).toContain("Riverside Recovery")
  expect(document.body.innerText).toMatch(/1 patients?/)

  // Nothing has changed yet — the preview is not destructive.
  const before = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
  expect(before.clinic.name).toBe(seedState.clinic.name)

  // Web flow (ADR 0021): no sidecar can hold a safety snapshot, so restore
  // stays disabled until the user downloads a safety copy explicitly.
  const restoreButton = page.getByRole("button", { name: "Restore backup" })
  await expect.element(restoreButton).toBeDisabled()
  await expect.poll(() => document.body.innerText).toContain("cannot hold a safety copy")

  HTMLAnchorElement.prototype.click = function () {
    downloads.push(this)
  }
  URL.createObjectURL = (blob: Blob) => {
    blobs.push(blob)
    return "blob:safety-copy"
  }
  URL.revokeObjectURL = () => {}
  await page.getByRole("button", { name: "Download safety copy" }).click()
  await expect.poll(() => downloads.length).toBe(1)
  await expect.element(restoreButton).toBeEnabled()

  await restoreButton.click()

  await expect.poll(() => document.querySelector(".modal")).toBeNull()
  await expect.poll(() => document.body.innerText).toMatch(/Restored 1 patients?/)

  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
  expect(saved.clinic.name).toBe("Riverside Recovery")
  expect(saved.patients).toHaveLength(1)
  expect(saved.audit[0]).toMatchObject({ action: "backup.restore", actorId: "u-mai" })
})

it("shows the daily automatic backup toggle and persists it on the clinic", async () => {
  await openSettings()
  await expect.poll(() => document.body.innerText).toContain("Daily automatic backup")

  // Seed clinic starts with the toggle on (undefined counts as on).
  const toggle = page.getByRole("checkbox")
  await expect.element(toggle).toBeChecked()

  // A non-admin member cannot flip the clinic toggle.
  await page.getByRole("button", { name: "Staff & Permissions" }).click()
  const row = [...document.querySelectorAll(".staff-table .table-row")].find((r) => (r.textContent ?? "").includes("Dr. Pim Chaiyasit"))
  const button = row ? [...row.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Sign in as")) : undefined
  if (!button) throw new Error("sign-in button not found")
  await button.click()
  await page.getByRole("button", { name: /Settings/ }).click()
  await expect.poll(() => document.body.innerText).toContain("Portability & recovery")
  await expect.element(page.getByRole("checkbox")).toBeDisabled()
})

it("rejects a file that is not a clinic backup", async () => {
  await openSettings()

  const input = document.querySelector<HTMLInputElement>('input[aria-label="Choose a backup file"]')
  if (!input) throw new Error("backup file input not found")
  const transfer = new DataTransfer()
  transfer.items.add(new File(["not a backup"], "notes.json", { type: "application/json" }))
  input.files = transfer.files
  input.dispatchEvent(new Event("change", { bubbles: true }))

  await expect.poll(() => document.querySelector('[role="alert"]')?.textContent ?? "").toContain("not valid JSON")
  expect(document.querySelector(".modal")).toBeNull()
})
