import "@/index.css";
import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { App } from "@/app/App";

it("records page desktop", async () => {
  await page.viewport(1440, 900);
  const screen = await render(<App />);
  await screen.getByRole("button", { name: /Medical Records/ }).click();
  await expect.element(screen.getByText("Vaccinations")).toBeVisible();
  const shell = document.querySelector(".app-shell") ?? document.body;
  await expect.element(shell).toMatchScreenshot("records-desktop.png");
});

it("records page mobile", async () => {
  await page.viewport(390, 844);
  const screen = await render(<App />);
  await screen.getByRole("button", { name: "Open menu" }).click();
  await screen.getByRole("button", { name: /Medical Records/ }).click();
  await expect.element(screen.getByText("Vaccinations")).toBeVisible();
  const shell = document.querySelector(".app-shell") ?? document.body;
  await expect.element(shell).toMatchScreenshot("records-mobile.png");
});
