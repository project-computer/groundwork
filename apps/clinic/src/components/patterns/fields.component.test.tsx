import "@/index.css";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
  Field,
  NativeSelect,
  PageHeader,
  Panel,
  Pill,
  ReadOnlyNote,
} from "@/components/patterns/fields";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

it("Field associates its label with the control", async () => {
  const screen = await render(
    <Field label="Patient name" htmlFor="patient-name">
      <Input id="patient-name" />
    </Field>,
  );

  await screen.getByLabelText("Patient name").fill("Tiger");
  await expect.element(screen.getByRole("textbox")).toHaveValue("Tiger");
});

it("NativeSelect forwards value and change events", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <NativeSelect aria-label="Species" onChange={onChange}>
      <option value="cat">Cat</option>
      <option value="dog">Dog</option>
    </NativeSelect>,
  );

  await screen.getByRole("combobox", { name: "Species" }).selectOptions("dog");

  await expect.element(screen.getByRole("combobox", { name: "Species" })).toHaveValue("dog");
  expect(onChange).toHaveBeenCalled();
});

it("Panel renders title, description, action, and children", async () => {
  const screen = await render(
    <Panel title="Vaccinations" description="Due this month" action={<Button>Add</Button>}>
      <p>No vaccinations due</p>
    </Panel>,
  );

  await expect.element(screen.getByRole("heading", { name: "Vaccinations" })).toBeVisible();
  await expect.element(screen.getByText("Due this month")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Add" })).toBeVisible();
  await expect.element(screen.getByText("No vaccinations due")).toBeVisible();
});

it("Pill renders its tone with an optional dot", async () => {
  const screen = await render(
    <Pill tone="warn" dot>
      Expiring soon
    </Pill>,
  );

  const pill = screen.getByText("Expiring soon").element();
  expect(pill.className).toContain("bg-warning/20");
  expect(pill.querySelector('[aria-hidden="true"]')).not.toBeNull();
});

it("Pill omits the dot by default", async () => {
  const screen = await render(<Pill tone="ok">In stock</Pill>);

  const pill = screen.getByText("In stock").element();
  expect(pill.querySelector('[aria-hidden="true"]')).toBeNull();
});

it("ReadOnlyNote explains why a section is read-only", async () => {
  const screen = await render(<ReadOnlyNote reason="Only a veterinarian can prescribe." />);

  await expect.element(screen.getByText("Only a veterinarian can prescribe.")).toBeVisible();
});

it("PageHeader renders title, description, and action", async () => {
  const screen = await render(
    <PageHeader
      title="Owners & Pets"
      description="Manage patients and their owners"
      action={<Button>New owner</Button>}
    />,
  );

  await expect.element(screen.getByRole("heading", { name: "Owners & Pets" })).toBeVisible();
  await expect.element(screen.getByText("Manage patients and their owners")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "New owner" })).toBeVisible();
});
