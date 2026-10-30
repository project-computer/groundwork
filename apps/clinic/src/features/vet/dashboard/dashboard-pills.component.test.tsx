import "@/index.css"
import { page } from "vitest/browser"
import { expect, it } from "vitest"
import { render } from "vitest-browser-react"
import { App } from "@/app/App"

// Pills inside .activity-row are shrink-0 + nowrap. When the row's text
// column cannot shrink (long unbreakable medicine names), the pill used to
// be pushed past the panel edge. The text column must absorb the squeeze.
const UNBREAKABLE_NAMES = [
  "Amoxicillin/Clavulanate875mg/125mgTAB",
  "MethylprednisoloneAcetate40mg/mLInjectable",
  "PrednisoloneSodiumPhosphate15mg/5mLx100mL",
]

const widths = [320, 360, 390, 414, 480, 600, 640, 768, 900, 1100, 1240, 1280, 1400]

it("keeps dashboard pills inside their panel at every viewport width", async () => {
  await render(<App />)

  const strongs = document.querySelectorAll<HTMLElement>(".activity-row strong")
  strongs.forEach((s, i) => {
    s.textContent = UNBREAKABLE_NAMES[i % UNBREAKABLE_NAMES.length]
  })

  const overflows: string[] = []
  for (const width of widths) {
    // Viewport resizes must be measured one at a time, after a layout settle.
    // oxlint-disable-next-line no-await-in-loop
    await page.viewport(width, 900)
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 60))

    for (const pill of document.querySelectorAll<HTMLElement>(".pill")) {
      if (pill.offsetParent === null) continue
      const card = pill.closest<HTMLElement>("section")
      if (!card) continue
      const over = pill.getBoundingClientRect().right - card.getBoundingClientRect().right
      if (over > 0.5) {
        overflows.push(`w=${width}: "${(pill.textContent ?? "").trim()}" overflows by ${over.toFixed(1)}px`)
      }
    }
  }

  expect(overflows.join(" | ")).toBe("")
})
