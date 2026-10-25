import "@/index.css";
import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Badge } from "@/components/ui/badge";

it("renders a span with the badge slot", async () => {
  const screen = await render(<Badge>Active</Badge>);

  const badge = screen.getByText("Active").element();
  expect(badge.tagName).toBe("SPAN");
  expect(badge.getAttribute("data-slot")).toBe("badge");
});

it("applies variant classes", async () => {
  const screen = await render(<Badge variant="destructive">Overdue</Badge>);

  const badge = screen.getByText("Overdue").element();
  expect(badge.className).toContain("text-destructive");
  expect(badge.getAttribute("data-variant")).toBe("destructive");
});

it("renders a custom element via the render prop", async () => {
  const screen = await render(
    <Badge render={<a href="/patients/tiger" />}>Tiger</Badge>,
  );

  await expect.element(screen.getByRole("link", { name: "Tiger" })).toBeVisible();
});
