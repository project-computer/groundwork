import "@/index.css";
import { expect, it, vi, beforeEach, afterEach } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { App } from "@/app/App";
import { seedState } from "@/lib/vet/seed";

/**
 * The notification badge (worklist facts) depends on the current date —
 * due/overdue windows move with the calendar. Freeze Date to the day the
 * baselines were captured so the screenshots stay deterministic; toFake
 * Date-only keeps vitest-browser polling on real timers.
 */
const BASELINE_DATE = new Date("2026-10-29T10:00:00+07:00");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(BASELINE_DATE);
});

afterEach(() => {
  vi.useRealTimers();
});

it("settings page desktop", async () => {
  await page.viewport(1440, 900);
  localStorage.setItem("clinicbook:state:v1", JSON.stringify({ ...seedState, lastSyncedAt: undefined }));
  const screen = await render(<App />);
  await screen.getByRole("button", { name: /Settings/ }).click();
  await expect.element(screen.getByText("Portability & recovery")).toBeVisible();
  const shell = document.querySelector(".app-shell") ?? document.body;
  await expect.element(shell).toMatchScreenshot("settings-desktop.png");
});

it("settings page mobile", async () => {
  await page.viewport(390, 844);
  localStorage.setItem("clinicbook:state:v1", JSON.stringify({ ...seedState, lastSyncedAt: undefined }));
  const screen = await render(<App />);
  await screen.getByRole("button", { name: "Open menu" }).click();
  await screen.getByRole("button", { name: /Settings/ }).click();
  await expect.element(screen.getByText("Portability & recovery")).toBeVisible();
  const shell = document.querySelector(".app-shell") ?? document.body;
  await expect.element(shell).toMatchScreenshot("settings-mobile.png");
});
