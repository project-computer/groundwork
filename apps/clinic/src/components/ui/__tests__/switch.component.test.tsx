import "@/index.css";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Switch } from "@/components/ui/switch";

it("toggles when clicked", async () => {
  const screen = await render(<Switch aria-label="Reminders" />);
  const toggle = screen.getByRole("switch", { name: "Reminders" });

  await expect.element(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect.element(toggle).toHaveAttribute("aria-checked", "true");
});

it("honours defaultChecked", async () => {
  const screen = await render(<Switch aria-label="Reminders" defaultChecked />);

  await expect
    .element(screen.getByRole("switch", { name: "Reminders" }))
    .toHaveAttribute("aria-checked", "true");
});

it("reports changes through onCheckedChange", async () => {
  const onCheckedChange = vi.fn();
  const screen = await render(
    <Switch aria-label="Reminders" onCheckedChange={onCheckedChange} />,
  );

  await screen.getByRole("switch", { name: "Reminders" }).click();

  expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
});

it("does not toggle when disabled", async () => {
  const screen = await render(<Switch aria-label="Reminders" disabled />);
  const toggle = screen.getByRole("switch", { name: "Reminders" });

  await expect.element(toggle).toHaveAttribute("aria-disabled", "true");
  await toggle.click({ force: true });
  await expect.element(toggle).toHaveAttribute("aria-checked", "false");
});

it("renders the small size", async () => {
  const screen = await render(<Switch aria-label="Reminders" size="sm" />);

  await expect
    .element(screen.getByRole("switch", { name: "Reminders" }))
    .toHaveAttribute("data-size", "sm");
});
