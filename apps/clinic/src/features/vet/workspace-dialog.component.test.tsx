import "@/index.css"
import { afterEach, beforeEach, expect, it } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { page } from "vitest/browser"
import { App } from "@/app/App"

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

const renderApp = async () => {
  const screen = await render(<App />)
  await new Promise((r) => setTimeout(r, 50))
  return screen
}

/** Admin holds staff.manage + clinic.manage regardless of role changes. */
const signInAsAdmin = async () => {
  await page.getByRole("button", { name: "Staff & Permissions" }).click()
  const row = [...document.querySelectorAll(".staff-table .table-row")].find((r) =>
    (r.textContent ?? "").includes("Mai Rattana"),
  )
  if (!row) throw new Error("admin staff row not found")
  const button = [...row.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Sign in as"))
  if (!button) throw new Error("sign-in button not found")
  await button.click()
}

it("opens clinic management from the sidebar clinic card", async () => {
  await page.viewport(1280, 900)
  await renderApp()

  await page.getByRole("button", { name: /Manage Baan Sathorn Animal Clinic/ }).click()

  await expect.element(page.getByRole("dialog", { name: "Clinic and account management" })).toBeVisible()
  await expect.element(page.getByText("Clinic & account")).toBeVisible()
  await expect.element(page.getByLabelText("Clinic name")).toHaveValue("Baan Sathorn Animal Clinic")

  // A veterinarian cannot change tenant identity, but can inspect it.
  await expect.element(page.getByLabelText("Clinic name")).toBeDisabled()
  await expect.element(page.getByText("Only a clinic admin can change clinic identity.")).toBeVisible()
  await expect.element(page.getByRole("button", { name: "Save clinic" })).toBeDisabled()
})

it("lets an admin edit clinic identity and reflects it across the workspace", async () => {
  await page.viewport(1280, 900)
  await renderApp()
  await signInAsAdmin()

  await page.getByRole("button", { name: /Manage Baan Sathorn Animal Clinic/ }).click()
  await page.getByLabelText("Clinic name").fill("Riverside Animal Hospital")
  await page.getByLabelText("VAT rate (%)").fill("10")
  await page.getByRole("button", { name: "Save clinic" }).click()

  await expect.element(page.getByText("Saved locally")).toBeVisible()
  await expect.element(page.getByRole("button", { name: /Manage Riverside Animal Hospital/ })).toBeVisible()
  await expect
    .poll(() => JSON.parse(window.localStorage.getItem("clinicbook:state:v1") ?? "{}").clinic?.vatRate)
    .toBe(0.1)
})

it("updates the signed-in member's own profile from My account", async () => {
  await page.viewport(1280, 900)
  await renderApp()

  await page.getByRole("button", { name: /Account settings for Dr\. Pim/ }).click()
  await expect.element(page.getByRole("dialog", { name: "Clinic and account management" })).toBeVisible()

  await page.getByLabelText("Phone").fill("089 999 0000")
  await page.getByRole("button", { name: "Save profile" }).click()

  await expect.element(page.getByText("Profile saved")).toBeVisible()
  await expect.element(page.getByLabelText("Phone")).toHaveValue("089 999 0000")
})

it("switches the signed-in member from the team tab", async () => {
  await page.viewport(1280, 900)
  await renderApp()

  await page.getByRole("button", { name: /Manage Baan Sathorn Animal Clinic/ }).click()
  const dialog = page.getByRole("dialog", { name: "Clinic and account management" })
  await dialog.getByRole("tab", { name: "Team" }).click()

  const row = [...document.querySelectorAll(".workspace-member")].find((r) => (r.textContent ?? "").includes("Mai Rattana"))
  if (!row) throw new Error("team member row not found")
  const signIn = [...row.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Sign in as"))
  if (!signIn) throw new Error("sign-in button not found")
  await signIn.click()

  await expect.element(page.getByRole("dialog", { name: "Clinic and account management" })).not.toBeInTheDocument()
  await expect.element(page.getByRole("button", { name: /Account settings for Mai Rattana/ })).toBeVisible()
})

it("shows the permissions matrix and lets an admin manage the team", async () => {
  await page.viewport(1280, 900)
  await renderApp()
  await signInAsAdmin()

  await page.getByRole("button", { name: /Manage Baan Sathorn Animal Clinic/ }).click()
  const dialog = page.getByRole("dialog", { name: "Clinic and account management" })
  await dialog.getByRole("tab", { name: "Roles & permissions" }).click()

  await expect.element(dialog.getByRole("rowheader", { name: /Clinic identity.*clinic\.manage/ })).toBeVisible()
  await expect.element(dialog.getByText(/You are signed in as Clinic admin/)).toBeVisible()

  await dialog.getByRole("tab", { name: "Team" }).click()
  await dialog.getByLabelText("New member").fill("Anong Srisuk")
  await dialog.getByLabelText("Role").selectOptions("pharmacist")
  await dialog.getByRole("button", { name: "Add member" }).click()

  await expect.element(dialog.getByText("Anong Srisuk")).toBeVisible()
  await expect.element(dialog.getByRole("combobox", { name: "Role for Anong Srisuk" })).toHaveValue("pharmacist")
})
