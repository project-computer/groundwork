import "@/index.css"
import { beforeAll, afterEach, expect, it } from "vitest"
import { useState } from "react"
import { cleanup, render } from "vitest-browser-react"
import { page } from "vitest/browser"
import { initI18n, LocaleProvider } from "@/lib/i18n"
import { todayKey } from "@/lib/vet/format"
import { DatePicker } from "../date-picker"

beforeAll(async () => {
  await initI18n()
})

afterEach(() => {
  cleanup()
})

/** Fixed harness so the picked key is observable without spying on React state. */
const Harness = ({ initial }: { initial: string }) => {
  const [value, setValue] = useState(initial)
  return (
    <div style={{ padding: 24 }}>
      <DatePicker id="pick" label="Appointment date" value={value} onChange={setValue} />
    </div>
  )
}

const renderPicker = async (initial: string) => {
  render(
    <LocaleProvider>
      <Harness initial={initial} />
    </LocaleProvider>,
  )
}

it("picks a day from the grid and reports the YYYY-MM-DD key", async () => {
  await renderPicker("2026-03-10")

  const trigger = page.getByRole("button", { name: "Appointment date" })
  await expect.element(trigger).toHaveAttribute("data-value", "2026-03-10")
  await trigger.click()

  const dialog = page.getByRole("dialog")
  await expect.element(dialog).toBeVisible()
  await page.getByRole("gridcell", { name: "15 Mar 2026" }).click()

  await expect.element(trigger).toHaveAttribute("data-value", "2026-03-15")
  await expect.element(dialog).not.toBeInTheDocument()
})

it("navigates months and jumps back via Today", async () => {
  await renderPicker("2026-03-10")

  await page.getByRole("button", { name: "Appointment date" }).click()
  await expect.element(page.getByRole("dialog")).toBeVisible()

  await page.getByRole("button", { name: "Previous month" }).click()
  await expect.element(page.getByRole("dialog", { name: /February 2026/ })).toBeVisible()
  await page.getByRole("gridcell", { name: "20 Feb 2026" }).click()

  const trigger = page.getByRole("button", { name: "Appointment date" })
  await expect.element(trigger).toHaveAttribute("data-value", "2026-02-20")

  await trigger.click()
  // Reopening lands on the picked day's month, and Today jumps back from there.
  await expect.element(page.getByRole("dialog", { name: /February 2026/ })).toBeVisible()
  await page.getByRole("button", { name: "Today" }).click()

  await expect.element(trigger).toHaveAttribute("data-value", todayKey())
})
