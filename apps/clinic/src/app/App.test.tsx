import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import App from "./App";

let container: HTMLDivElement;
let root: Root;

function renderApp() {
  act(() => {
    root.render(<App />);
  });
}

/** Flushes pending effects/microtasks (hydration, persistence, timers). */
function flush() {
  return act(async () => {});
}

function findButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll("button")].find(
    (b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").includes(label),
  );
  if (!button) throw new Error(`button not found: ${label}`);
  return button as HTMLButtonElement;
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

/** Sets a value on a native input/select the way React expects. */
function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(element, value);
  act(() => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  document.body.innerHTML = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("App", () => {
  it("renders the clinic shell with the seeded clinic", async () => {
    renderApp();
    await flush();
    expect(document.body.textContent).toContain("Vettera");
    expect(document.body.textContent).toContain("Baan Sathorn Animal Clinic");
    expect(document.querySelector("nav[aria-label='Main navigation']")).toBeTruthy();
    for (const section of [
      "Dashboard",
      "Appointments & Queue",
      "Owners & Pets",
      "Medical Records",
      "Pharmacy & Inventory",
      "Billing & Payments",
      "Reports",
      "Staff & Permissions",
      "Settings",
    ]) {
      expect(
        [...document.querySelectorAll(".main-nav button")].some((b) => b.textContent?.includes(section)),
        `nav missing ${section}`,
      ).toBe(true);
    }
  });

  it("books an appointment from the calendar", async () => {
    renderApp();
    await flush();
    click(findButton("Appointments & Queue"));
    await flush();
    expect(document.body.textContent).toContain("Waiting queue");

    click(findButton("Book appointment")); // opens the dialog
    const dialog = document.querySelector(".modal");
    expect(dialog).toBeTruthy();

    setValue(document.getElementById("bk-patient") as HTMLSelectElement, "p-3");
    setValue(document.getElementById("bk-time") as HTMLInputElement, "11:00");
    click(dialog!.querySelector(".button.primary")!);
    await flush();

    expect(document.querySelector(".modal")).toBeNull();
    expect(document.body.textContent).toContain("Consultation · Dr. Pim Chaiyasit");
  });

  it("shows staff roles and the audit trail", async () => {
    renderApp();
    await flush();
    click(findButton("Staff & Permissions"));
    await flush();
    expect(document.body.textContent).toContain("Veterinarian");
    expect(document.body.textContent).toContain("Audit trail");
    expect(document.body.textContent).toContain("Closed consultation for Tiger");
  });

  it("cycles the theme and reflects it on <html>", async () => {
    renderApp();
    await flush();
    const toggle = () => findButton("Change theme");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    click(toggle()); // system -> light
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    click(toggle()); // light -> dark
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    click(toggle()); // dark -> system (resolves to light in jsdom)
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
