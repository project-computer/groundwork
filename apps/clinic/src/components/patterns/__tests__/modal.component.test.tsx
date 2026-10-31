import "@/index.css"
import { useState } from "react"
import { afterEach, beforeAll, expect, it, vi } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { page } from "vitest/browser"
import { initI18n, LocaleProvider } from "@/lib/i18n"
import { DataTable } from "../data-table"
import { Modal } from "../modal"

beforeAll(async () => {
  await initI18n()
})

afterEach(() => {
  cleanup()
})

const renderModal = (onClose: () => void, props: { closeOnEscape?: boolean } = {}) =>
  render(
    <LocaleProvider>
      <Modal title="Set a PIN" subtitle="Never synced in plain text" onClose={onClose} {...props}>
        <p>Dialog body</p>
      </Modal>
    </LocaleProvider>,
  )

it("names the dialog and exposes the title, subtitle and body", async () => {
  await renderModal(() => {})

  const dialog = page.getByRole("dialog", { name: "Set a PIN" })
  await expect.element(dialog).toBeVisible()
  await expect.element(page.getByText("Never synced in plain text")).toBeVisible()
  await expect.element(page.getByText("Dialog body")).toBeVisible()
})

it("closes from the close button, the backdrop and Escape", async () => {
  const onClose = vi.fn()
  const screen = await renderModal(onClose)

  await screen.getByRole("button", { name: "Close dialog" }).click()
  expect(onClose).toHaveBeenCalledTimes(1)

  // Backdrop click: the click lands on .modal-backdrop, not its content.
  await (document.querySelector(".modal-backdrop") as HTMLElement).click()
  expect(onClose).toHaveBeenCalledTimes(2)

  await page.getByRole("dialog").click() // inside the box: must not close
  expect(onClose).toHaveBeenCalledTimes(2)

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
  await expect.poll(() => onClose).toHaveBeenCalledTimes(3)
})

it("leaves Escape to a nested dialog when closeOnEscape is false", async () => {
  const onClose = vi.fn()
  await renderModal(onClose, { closeOnEscape: false })

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(onClose).not.toHaveBeenCalled()
})

/** Opener button + on-demand dialog, the way real surfaces mount Modal. */
const FocusHarness = () => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button id="opener" type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {open && (
        <Modal title="Set a PIN" onClose={() => setOpen(false)}>
          <input aria-label="New PIN" />
        </Modal>
      )}
    </>
  )
}

it("focuses the dialog on open and returns focus to the opener on close", async () => {
  const screen = await render(
    <LocaleProvider>
      <FocusHarness />
    </LocaleProvider>,
  )

  await screen.getByRole("button", { name: "Open dialog" }).click()
  const box = document.querySelector(".modal") as HTMLElement
  await expect.poll(() => document.activeElement === box).toBe(true)

  await screen.getByRole("button", { name: "Close dialog" }).click()
  const opener = document.getElementById("opener") as HTMLElement
  await expect.poll(() => document.activeElement === opener).toBe(true)
  expect(document.querySelector(".modal")).toBeNull()
})

it("wraps Tab and Shift+Tab inside the dialog", async () => {
  const screen = await render(
    <LocaleProvider>
      <FocusHarness />
    </LocaleProvider>,
  )

  await screen.getByRole("button", { name: "Open dialog" }).click()
  const closeButton = document.querySelector(".form-heading button") as HTMLElement
  const pinInput = document.querySelector('input[aria-label="New PIN"]') as HTMLElement

  // From the box, Tab lands on the first focusable (the close button).
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }))
  await expect.poll(() => document.activeElement === closeButton).toBe(true)

  // From the last focusable, Tab wraps around to the first.
  pinInput.focus()
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }))
  await expect.poll(() => document.activeElement === closeButton).toBe(true)

  // From the first focusable, Shift+Tab wraps around to the last.
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }))
  await expect.poll(() => document.activeElement === pinInput).toBe(true)
})

it("renders a heading-less surface without inventing one", async () => {
  await render(
    <LocaleProvider>
      <Modal label="Receipt for INV-1" onClose={() => {}}>
        <p>Receipt</p>
      </Modal>
    </LocaleProvider>,
  )

  await expect.element(page.getByRole("dialog", { name: "Receipt for INV-1" })).toBeVisible()
  expect(document.querySelector(".form-heading")).toBeNull()
})

it("DataTable renders its columns, rows and empty state", async () => {
  const screen = await render(
    <DataTable className="patients-table" columns={["Patient", "Owner", null]} empty="No patients match your search.">
      <div className="table-row">Moo Daeng</div>
    </DataTable>,
  )

  const headers = [...document.querySelectorAll(".table-head span")].map((node) => node.textContent)
  expect(headers).toEqual(["Patient", "Owner", ""])
  expect(document.querySelector(".records-table.patients-table .table-row")?.textContent).toBe("Moo Daeng")
  // The empty state is opt-in: it appears only when the caller says so.
  expect(document.querySelector(".empty-state")).toBeNull()
  await expect.element(screen.getByText("Moo Daeng")).toBeVisible()
})

it("DataTable shows the empty message only when isEmpty", async () => {
  await render(
    <DataTable
      className="patients-table"
      columns={["Patient"]}
      isEmpty
      empty="No patients match your search."
      emptyClassName="patients-empty"
    >
      {null}
    </DataTable>,
  )

  await expect.element(page.getByText("No patients match your search.")).toBeVisible()
  expect(document.querySelector(".empty-state.patients-empty")).not.toBeNull()
})
