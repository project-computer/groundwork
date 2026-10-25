import "@/index.css";
import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

it("renders the composed card sections", async () => {
  const screen = await render(
    <Card>
      <CardHeader>
        <CardTitle>Patient summary</CardTitle>
        <CardDescription>Updated today</CardDescription>
        <CardAction>Edit</CardAction>
      </CardHeader>
      <CardContent>Vitals stable</CardContent>
      <CardFooter>Last visit: today</CardFooter>
    </Card>,
  );

  const { container } = screen;
  expect(container.querySelector('[data-slot="card"]')).not.toBeNull();
  expect(container.querySelector('[data-slot="card-header"]')).not.toBeNull();
  expect(container.querySelector('[data-slot="card-title"]')?.textContent).toBe(
    "Patient summary",
  );
  expect(container.querySelector('[data-slot="card-description"]')?.textContent).toBe(
    "Updated today",
  );
  expect(container.querySelector('[data-slot="card-action"]')?.textContent).toBe("Edit");
  await expect.element(screen.getByText("Vitals stable")).toBeVisible();
  await expect.element(screen.getByText("Last visit: today")).toBeVisible();
});

it("marks small cards with a size attribute", async () => {
  const screen = await render(<Card size="sm">Compact</Card>);

  const card = screen.container.querySelector('[data-slot="card"]');
  expect(card?.getAttribute("data-size")).toBe("sm");
});

it("forwards className and native attributes", async () => {
  const screen = await render(
    <Card className="custom-card" data-testid="summary">
      Content
    </Card>,
  );

  const card = screen.getByTestId("summary");
  await expect.element(card).toHaveClass("custom-card");
  await expect.element(card).toHaveAttribute("data-slot", "card");
});
