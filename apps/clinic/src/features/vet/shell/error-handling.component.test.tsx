import "@/index.css"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { page } from "vitest/browser"
import { useState } from "react"
import { App } from "@/app/App"
import { ErrorBoundary } from "@/app/error-boundary"
import { seedState } from "@/lib/vet/seed"

const STORAGE_KEY = "clinicbook:state:v1"
const seed = (state: object) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lastSyncedAt: undefined }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

const signInAsAdmin = async () => {
  await page.getByRole("button", { name: "Staff & Permissions" }).click()
  const row = [...document.querySelectorAll(".staff-table .table-row")].find((r) => (r.textContent ?? "").includes("Mai Rattana"))
  const button = row ? [...row.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Sign in as")) : undefined
  if (!button) throw new Error("sign-in button not found")
  await button.click()
}

it("warns on screen when changes can no longer be saved", async () => {
  await page.viewport(1400, 1200)
  seed(seedState)
  render(<App />)
  await new Promise((r) => setTimeout(r, 50))
  await signInAsAdmin()
  await page.getByRole("button", { name: /Settings/ }).click()
  await expect.poll(() => document.body.innerText).toContain("Portability & recovery")

  // From here every change fails to persist.
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota exceeded")
  })

  // Exporting writes an audit event, which triggers a save attempt.
  await page.getByRole("button", { name: "Export data" }).click()

  await expect.poll(() => document.body.innerText).toContain("Changes are not being saved to this computer")
  expect(document.body.innerText).toContain("quota exceeded")

  // Dismissing hides the banner until the next failed save.
  await page.getByRole("button", { name: "Dismiss saving warning" }).click()
  await expect.poll(() => document.body.innerText).not.toContain("Changes are not being saved")
})

it("recovers from a render crash instead of blanking the workspace", async () => {
  let boom = true
  const Bomb = () => {
    if (boom) throw new Error("kaboom")
    return <p>All better</p>
  }
  const screen = await render(
    <ErrorBoundary>
      <Bomb />
    </ErrorBoundary>,
  )

  await expect.element(screen.getByText("Something went wrong while drawing the workspace")).toBeVisible()
  expect(document.body.innerText).toContain("kaboom")
  expect(document.body.innerText).toContain("Your records are saved on this computer")

  boom = false
  await screen.getByRole("button", { name: "Try again" }).click()
  await expect.element(screen.getByText("All better")).toBeVisible()
})

/** Children can trigger their own crash to test the boundary inside the app shell. */
const CrashOnDemand = () => {
  const [crash, setCrash] = useState(false)
  if (crash) throw new Error("boundary probe")
  return (
    <button onClick={() => setCrash(true)} type="button">
      Crash the boundary
    </button>
  )
}

it("catches crashes thrown while the app is running", async () => {
  const screen = await render(
    <ErrorBoundary>
      <CrashOnDemand />
    </ErrorBoundary>,
  )
  await screen.getByRole("button", { name: "Crash the boundary" }).click()
  await expect.element(screen.getByText("Something went wrong while drawing the workspace")).toBeVisible()
  expect(document.body.innerText).toContain("boundary probe")
})
