import "@/index.css"
import { page } from "vitest/browser"
import { expect, it } from "vitest"
import { render } from "vitest-browser-react"
import { App } from "@/app/App"

// The staff table used to keep a 640px min-width and five grid columns on
// phones, pushing the permission tags and "Sign in as" ~380px off-screen
// behind a sideways scroll. Rows must stack below 600px and the table must
// never require horizontal scrolling at any width.
const widths = [320, 360, 390, 414, 480, 560, 600, 620, 680, 740, 800, 920, 1100, 1280, 1400]

it("keeps the staff table usable without horizontal scroll at every viewport width", async () => {
  await page.viewport(1280, 900)
  await render(<App />)
  await page.getByRole("button", { name: "Staff & Permissions" }).click()
  await expect.element(page.getByRole("main").getByText("Dr. Pim Chaiyasit")).toBeVisible()

  const problems: string[] = []
  for (const width of widths) {
    await page.viewport(width, 900)
    await new Promise((r) => setTimeout(r, 60))

    const table = document.querySelector<HTMLElement>(".staff-table")
    if (!table) {
      problems.push(`w=${width}: staff table not mounted`)
      continue
    }
    const scroll = table.scrollWidth - table.clientWidth
    if (scroll > 1) problems.push(`w=${width}: table requires ${scroll}px of horizontal scrolling`)

    const vw = document.documentElement.clientWidth
    for (const el of document.querySelectorAll<HTMLElement>(".staff-table .perm-tag, .staff-table .small-button")) {
      if (el.offsetParent === null) continue
      const over = el.getBoundingClientRect().right - vw
      if (over > 0.5) problems.push(`w=${width}: "${(el.textContent ?? "").trim()}" sits ${over.toFixed(1)}px past the viewport`)
    }
  }

  expect(problems.join(" | ")).toBe("")
})

it("stacks staff rows on phones and keeps the grid on desktop", async () => {
  await page.viewport(1280, 900)
  await render(<App />)
  await page.getByRole("button", { name: "Staff & Permissions" }).click()
  await expect.element(page.getByRole("main").getByText("Dr. Pim Chaiyasit")).toBeVisible()

  const head = () => document.querySelector<HTMLElement>(".staff-table .table-head")
  const row = () => document.querySelector<HTMLElement>(".staff-table .table-row")
  const perms = () => document.querySelector<HTMLElement>(".staff-table .perm-list")

  await page.viewport(380, 900)
  await new Promise((r) => setTimeout(r, 60))
  expect(head()?.offsetParent).toBeNull()
  expect(perms()?.offsetParent).not.toBeNull()
  expect(getComputedStyle(row()!).gridTemplateColumns.split(" ").length).toBe(2)

  await page.viewport(1280, 900)
  await new Promise((r) => setTimeout(r, 60))
  expect(head()?.offsetParent).not.toBeNull()
  expect(getComputedStyle(row()!).gridTemplateColumns.split(" ").length).toBe(5)
})
