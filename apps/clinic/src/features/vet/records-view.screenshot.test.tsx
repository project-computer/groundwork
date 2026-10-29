import "@/index.css";
import { afterEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { App } from "@/app/App";
import { seedState } from "@/lib/vet/seed";

// The seed builds every timestamp from today's date, so these pixels would
// drift at midnight UTC and fail every following day. Freeze the clock to the
// day the baselines were captured. Only Date is faked — timers stay real so
// the browser driver keeps working.
vi.hoisted(() => {
  const baseline = Date.parse("2026-10-28T09:00:00+07:00");
  vi.useFakeTimers({ toFake: ["Date"], now: baseline });
});

afterEach(() => {
  localStorage.clear();
});

it("records page desktop", async () => {
  await page.viewport(1440, 900);
  // Deterministic render: other test files may leave state in localStorage.
  localStorage.setItem("clinicbook:state:v1", JSON.stringify({ ...seedState, lastSyncedAt: undefined }));
  const screen = await render(<App />);
  await screen.getByRole("button", { name: /Medical Records/ }).click();
  await expect.element(screen.getByText("Vaccinations")).toBeVisible();
  const shell = document.querySelector(".app-shell") ?? document.body;
  await expect.element(shell).toMatchScreenshot("records-desktop.png");
});

it("records page mobile", async () => {
  await page.viewport(390, 844);
  localStorage.setItem("clinicbook:state:v1", JSON.stringify({ ...seedState, lastSyncedAt: undefined }));
  const screen = await render(<App />);
  await screen.getByRole("button", { name: "Open menu" }).click();
  await screen.getByRole("button", { name: /Medical Records/ }).click();
  await expect.element(screen.getByText("Vaccinations")).toBeVisible();
  const shell = document.querySelector(".app-shell") ?? document.body;
  await expect.element(shell).toMatchScreenshot("records-mobile.png");
});
