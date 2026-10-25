import "@/index.css";
import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const renderTabs = (defaultValue = "overview") => {
  return render(
    <Tabs defaultValue={defaultValue}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Overview panel</TabsContent>
      <TabsContent value="history">History panel</TabsContent>
    </Tabs>,
  );
}

it("shows the default tab's panel", async () => {
  const screen = await renderTabs();

  await expect.element(screen.getByText("Overview panel")).toBeVisible();
  await expect
    .element(screen.getByRole("tab", { name: "Overview" }))
    .toHaveAttribute("aria-selected", "true");
});

it("switches panels when a tab is clicked", async () => {
  const screen = await renderTabs();

  await screen.getByRole("tab", { name: "History" }).click();

  await expect.element(screen.getByText("History panel")).toBeVisible();
  await expect
    .element(screen.getByRole("tab", { name: "History" }))
    .toHaveAttribute("aria-selected", "true");
  await expect
    .element(screen.getByRole("tab", { name: "Overview" }))
    .toHaveAttribute("aria-selected", "false");
});

it("applies the line variant to the tab list", async () => {
  const screen = await render(
    <Tabs defaultValue="overview">
      <TabsList variant="line">
        <TabsTrigger value="overview">Overview</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Overview panel</TabsContent>
    </Tabs>,
  );

  await expect
    .element(screen.getByRole("tablist"))
    .toHaveAttribute("data-variant", "line");
});
