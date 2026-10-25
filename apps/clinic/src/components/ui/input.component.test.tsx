import "@/index.css";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

it("accepts typed input", async () => {
  const screen = await render(<Input aria-label="Search patients" />);
  const input = screen.getByRole("textbox", { name: "Search patients" });

  await input.fill("Tiger");

  await expect.element(input).toHaveValue("Tiger");
});

it("reports changes through onChange", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <Input aria-label="Search patients" onChange={onChange} />,
  );

  await screen.getByRole("textbox", { name: "Search patients" }).fill("Mochi");

  expect(onChange).toHaveBeenCalled();
});

it("supports placeholder, disabled, and invalid states", async () => {
  const screen = await render(
    <Input
      aria-label="Search patients"
      placeholder="MRN or name"
      disabled
      aria-invalid
    />,
  );
  const input = screen.getByRole("textbox", { name: "Search patients" });

  await expect.element(input).toHaveAttribute("placeholder", "MRN or name");
  await expect.element(input).toBeDisabled();
  await expect.element(input).toHaveAttribute("aria-invalid", "true");
});

it("associates a Label with the input", async () => {
  const screen = await render(
    <>
      <Label htmlFor="mrn">Medical record number</Label>
      <Input id="mrn" />
    </>,
  );

  await screen.getByLabelText("Medical record number").fill("PT-2026-0042");
  await expect.element(screen.getByRole("textbox")).toHaveValue("PT-2026-0042");
});
