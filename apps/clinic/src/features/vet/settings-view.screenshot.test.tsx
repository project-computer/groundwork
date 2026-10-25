import "@/index.css";
import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { App } from "@/app/App";

it("settings page desktop", async () => {
  await page.viewport(1440, 900);
  const screen = await render(<App />);
  await screen.getByRole("button", { name: /Settings/ }).click();
  await expect.element(screen.getByText("Portability & recovery")).toBeVisible();
  const shell = document.querySelector(".app-shell") ?? document.body;
  await expect.element(shell).toMatchScreenshot("settings-desktop.png");
});

it("settings page mobile", async () => {
  await page.viewport(390, 844);
  const screen = await render(<App />);
  await screen.getByRole("button", { name: "Open menu" }).click();
  await screen.getByRole("button", { name: /Settings/ }).click();
  await expect.element(screen.getByText("Portability & recovery")).toBeVisible();
  const shell = document.querySelector(".app-shell") ?? document.body;
  await expect.element(shell).toMatchScreenshot("settings-mobile.png");
});
