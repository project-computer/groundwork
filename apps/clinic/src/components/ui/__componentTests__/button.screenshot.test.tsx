import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import "@/index.css";
import { Button } from "@/components/ui/button";

it("Button renders the default, outline, and destructive variants", async () => {
  const screen = await render(
    <div className="bg-background p-8">
      <div className="flex gap-4" data-testid="variants">
        <Button>Save visit</Button>
        <Button variant="outline">Cancel</Button>
        <Button variant="destructive">Delete</Button>
      </div>
    </div>,
  );

  await expect.element(screen.getByRole("button", { name: "Save visit" })).toBeVisible();
  await expect.element(screen.getByTestId("variants")).toMatchScreenshot("button-variants.png");
});

it("Button renders dark theme variants", async () => {
  document.documentElement.classList.add("dark");
  const screen = await render(
    <div className="bg-background p-8">
      <div className="flex gap-4" data-testid="variants-dark">
        <Button>Save visit</Button>
        <Button variant="outline">Cancel</Button>
        <Button variant="destructive">Delete</Button>
      </div>
    </div>,
  );

  await expect.element(screen.getByRole("button", { name: "Save visit" })).toBeVisible();
  await expect
    .element(screen.getByTestId("variants-dark"))
    .toMatchScreenshot("button-variants-dark.png");
  document.documentElement.classList.remove("dark");
});
