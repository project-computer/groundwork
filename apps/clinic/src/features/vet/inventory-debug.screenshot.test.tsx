import "@/index.css";
import { it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { App } from "@/app/App";

const acc: string[] = []

const gaps = (label: string) => {
  const out: string[] = []
  out.push(`===== ${label} =====`)
  const blocks = [...document.querySelectorAll(".page-wrap > *")] as HTMLElement[]
  let prevBottom: number | null = null
  blocks.forEach((b, i) => {
    const r = b.getBoundingClientRect()
    const tag = b.tagName.toLowerCase()
    const cls = (b.className || "").toString().slice(0, 40)
    const h2 = b.querySelector?.("h2")?.textContent ?? ""
    const gap = prevBottom === null ? 0 : Math.round(r.top - prevBottom)
    out.push(`block[${i}] <${tag}> cls="${cls}" h2="${h2}" top=${Math.round(r.top)} h=${Math.round(r.height)} gapAbove=${gap}`)
    prevBottom = Math.round(r.bottom)
  })
  return out.join("\n")
}

const view = async (label: string, rx: RegExp, marker: string) => {
  await page.viewport(1440, 900)
  const screen = await render(<App />)
  await screen.getByRole("button", { name: rx }).first().click()
  await new Promise((r) => setTimeout(r, 400))
  acc.push(gaps(label + (document.body.textContent?.includes(marker) ? "" : " [marker missed]")))
  screen.unmount()
}

it("panel gaps", async () => {
  await view("inventory", /Pharmacy & Inventory/, "Suppliers")
  await view("dashboard", /Dashboard/, "Today")
  await view("schedule", /Appointments & Queue/, "Week")
  await view("consult", /Consultation Room/, "Prescriptions")
  await view("billing", /Billing & Payments/, "Invoice")
  await view("settings", /Settings/, "Portability & recovery")
  await view("staff", /Staff & Permissions/, "Audit trail")
  await view("records", /Medical Records/, "Vaccinations")
  await view("reports", /Reports/, "Revenue")
  throw new Error("\n" + acc.join("\n\n"))
}, 300000)
