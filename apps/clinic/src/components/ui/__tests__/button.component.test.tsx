import "@/index.css";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Button } from "@/components/ui/button";

it("calls onClick when clicked", async () => {
  const onClick = vi.fn();
  const screen = await render(<Button onClick={onClick}>Save visit</Button>);

  await screen.getByRole("button", { name: "Save visit" }).click();

  expect(onClick).toHaveBeenCalledOnce();
});

it("does not call onClick when disabled", async () => {
  const onClick = vi.fn();
  const screen = await render(
    <Button disabled onClick={onClick}>
      Save visit
    </Button>,
  );

  await expect.element(screen.getByRole("button", { name: "Save visit" })).toBeDisabled();
  await screen.getByRole("button", { name: "Save visit" }).click({ force: true });

  expect(onClick).not.toHaveBeenCalled();
});

it("applies variant classes", async () => {
  const screen = await render(<Button variant="destructive">Delete</Button>);
  const button = screen.getByRole("button", { name: "Delete" }).element();

  expect(button.className).toContain("bg-destructive/10");
  expect(button.getAttribute("data-slot")).toBe("button");
});

it("renders a custom element via the render prop", async () => {
  const screen = await render(
    <Button render={<a href="/patients">Patients</a>} />,
  );

  await expect.element(screen.getByRole("link", { name: "Patients" })).toBeVisible();
});
