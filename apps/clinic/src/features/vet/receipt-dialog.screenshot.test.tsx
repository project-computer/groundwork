import "@/index.css";
import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { App } from "@/app/App";
import { seedState } from "@/lib/vet/seed";

// The receipt dialog was migrated from receipt.css to Tailwind utilities; these
// screenshots pin the converted layout (dashed rules, right-aligned amount
// columns, tabular figures) so future restyles are a deliberate diff.
it("receipt dialog desktop", async () => {
  await page.viewport(1440, 900);
  localStorage.setItem("clinicbook:state:v1", JSON.stringify({ ...seedState, lastSyncedAt: undefined }));
  const screen = await render(<App />);
  await screen.getByRole("button", { name: "Billing & Payments" }).click();
  await screen.getByRole("button", { name: "Receipt" }).click();
  const dialog = page.getByRole("dialog", { name: "Receipt for INV-2026-0142" });
  await expect.element(dialog).toBeVisible();
  await expect.element(dialog.getByText("Total")).toBeVisible();
  const modal = document.querySelector(".modal");
  if (!modal) throw new Error("modal not found");
  await expect.element(modal).toMatchScreenshot("receipt-desktop.png");
});

it("receipt dialog mobile", async () => {
  await page.viewport(390, 844);
  localStorage.setItem("clinicbook:state:v1", JSON.stringify({ ...seedState, lastSyncedAt: undefined }));
  const screen = await render(<App />);
  await screen.getByRole("button", { name: "Open menu" }).click();
  await screen.getByRole("button", { name: "Billing & Payments" }).click();
  await screen.getByRole("button", { name: "Receipt" }).click();
  const dialog = page.getByRole("dialog", { name: "Receipt for INV-2026-0142" });
  await expect.element(dialog).toBeVisible();
  const modal = document.querySelector(".modal");
  if (!modal) throw new Error("modal not found");
  await expect.element(modal).toMatchScreenshot("receipt-mobile.png");
});
