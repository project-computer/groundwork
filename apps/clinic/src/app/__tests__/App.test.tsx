import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { todayKey } from "@/lib/vet/format";
import { App } from "../App";

// Freeze the clock past the seed's latest timestamp (today 09:42+07) so
// records created during a test always sort newest-first, and date-based
// assertions cannot drift with the real clock — same pattern as the
// screenshot suite (b2a0886). Fakes Date only; timers stay real.
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-28T13:00:00+07:00") });
});

let container: HTMLDivElement;
let root: Root;

const renderApp = () => {
  act(() => {
    root.render(<App />);
  });
}

/** Flushes pending effects/microtasks (hydration, persistence, timers). */
const flush = () => {
  return act(async () => {});
}

const findButton = (label: string): HTMLButtonElement => {
  const button = [...document.querySelectorAll("button")].find(
    (b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").includes(label),
  );
  if (!button) throw new Error(`button not found: ${label}`);
  return button as HTMLButtonElement;
}

const click = (element: Element) => {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

const themeToggle = () => findButton("Change theme");

/** Switches the signed-in staff account via Staff & Permissions. */
const signInAs = async (name: string) => {
  click(findButton("Staff & Permissions"));
  await flush();
  const row = [...document.querySelectorAll(".table-row")].find((r) => (r.textContent ?? "").includes(name));
  if (!row) throw new Error(`staff row not found: ${name}`);
  const button = [...row.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Sign in as"));
  if (!button) throw new Error(`sign-in button not found for ${name}`);
  click(button);
  await flush();
}

/** Sets a value on a native input/select the way React expects. */
const setValue = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(element, value);
  act(() => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const monthOf = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7));

/** Picks a date through the shared DatePicker: open the trigger, step to the month, click the day cell. */
const pickDate = (id: string, iso: string) => {
  const trigger = document.getElementById(id);
  if (!trigger) throw new Error(`date picker not found: ${id}`);
  click(trigger);
  const first = document.querySelector<HTMLButtonElement>('.date-picker-pop [data-iso]:not([data-outside])');
  if (!first) throw new Error(`date picker grid not found: ${id}`);
  const delta = monthOf(iso) - monthOf(first.dataset.iso!);
  if (delta !== 0) {
    const [previous, next] = document.querySelectorAll<HTMLButtonElement>('.date-picker-head button');
    const nav = delta < 0 ? previous : next;
    for (let step = 0; step < Math.abs(delta); step++) click(nav);
  }
  const day = document.querySelector<HTMLButtonElement>(`.date-picker-pop [data-iso="${iso}"]`);
  if (!day) throw new Error(`day not found in picker: ${iso}`);
  click(day);
}

/** Drag events in jsdom carry no dataTransfer; attach a minimal stub. */
const dragEvent = (type: string) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { effectAllowed: "", dropEffect: "", setData: () => {}, getData: () => "" },
  });
  return event;
};

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
      "Owners & Patients",
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

  it("opens a prefilled booking dialog when an empty hour slot is clicked", async () => {
    renderApp();
    await flush();
    click(findButton("Appointments & Queue"));
    await flush();

    const row = [...document.querySelectorAll(".cal-row")].find((r) => r.querySelector("time")?.textContent === "08:00");
    const cells = row?.querySelector(".cal-cells");
    expect(cells).toBeTruthy();

    act(() => {
      cells!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientY: 0 }));
    });
    act(() => {
      cells!.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientY: 0 }));
    });

    const dialog = document.querySelector(".modal");
    expect(dialog).toBeTruthy();
    expect((document.getElementById("bk-time") as HTMLInputElement).value).toBe("08:00");
    expect((document.getElementById("bk-duration") as HTMLSelectElement).value).toBe("30");
  });

  it("opens a booking dialog for the clicked day from a week slot", async () => {
    renderApp();
    await flush();
    click(findButton("Appointments & Queue"));
    await flush();
    click(findButton("Week"));
    await flush();

    const column = [...document.querySelectorAll(".week-col")].find((c) => c.querySelector("header.today"));
    const slot = column?.querySelector('.week-slot[data-slot-hour="8"]') as HTMLElement;
    expect(slot?.getAttribute("data-slot-iso")).toBe(todayKey());

    act(() => {
      slot.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientY: 0 }));
      slot.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientY: 0 }));
    });

    const dialog = document.querySelector(".modal");
    expect(dialog).toBeTruthy();
    expect(document.getElementById("bk-date")?.getAttribute("data-value")).toBe(todayKey());
    expect((document.getElementById("bk-time") as HTMLInputElement).value).toBe("08:00");
  });

  it("reschedules a week chip onto another day's hour slot", async () => {
    renderApp();
    await flush();
    click(findButton("Appointments & Queue"));
    await flush();
    click(findButton("Week"));
    await flush();

    const chip = [...document.querySelectorAll(".week-slot .cal-appt")].find((el) =>
      el.textContent?.includes("Mochi"),
    ) as HTMLElement;
    expect(chip).toBeTruthy();

    const column = [...document.querySelectorAll(".week-col")].find((c) => !c.querySelector("header.today"));
    const target = column?.querySelector('.week-slot[data-slot-hour="9"]') as HTMLElement;
    const targetIso = target?.getAttribute("data-slot-iso");
    expect(targetIso).toBeTruthy();

    act(() => {
      chip.dispatchEvent(dragEvent("dragstart"));
    });
    act(() => {
      target.dispatchEvent(dragEvent("dragover"));
    });
    act(() => {
      target.dispatchEvent(dragEvent("drop"));
    });
    await flush();

    expect(target?.textContent).toContain("Mochi");
    expect(target?.textContent).toContain("09:30");
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

  it("opens patient registration directly from the dashboard", async () => {
    renderApp();
    await flush();

    click(findButton("Register patient"));
    await flush();

    expect(document.getElementById("owner")).toBeTruthy();
    expect(document.getElementById("patient")).toBeTruthy();
  });

  it("registers a patient with a microchip and edits the clinical profile", async () => {
    renderApp();
    await flush();
    click(findButton("Owners & Patients"));
    await flush();

    click(findButton("Register Patient"));
    setValue(document.getElementById("owner") as HTMLInputElement, "Anong Srisuk");
    setValue(document.getElementById("patient") as HTMLInputElement, "Milo");
    setValue(document.getElementById("microchip") as HTMLInputElement, "988100011122333");
    click(findButton("Save Records"));
    await flush();

    expect(document.body.textContent).toContain("Milo registered.");

    // MRN assigned and microchip searchable
    expect(document.body.textContent).toContain("PT-2026-0006");
    setValue(
      document.querySelector(".search-field input") as HTMLInputElement,
      "988100011122333",
    );
    await flush();
    expect(document.body.textContent).toContain("Milo");

    // Clinical profile dialog: add an allergy, verify the flag appears
    click(findButton("View"));
    const dialog = document.querySelector(".modal");
    expect(dialog).toBeTruthy();
    setValue(document.getElementById("pt-allergies") as HTMLInputElement, "Penicillin");
    click(findButton("Save Profile"));
    await flush();
    expect(document.body.textContent).toContain("Allergy: Penicillin");
  });

  it("cycles the theme and reflects it on <html>", async () => {
    renderApp();
    await flush();
    click(themeToggle()); // system -> light
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    click(themeToggle()); // light -> dark
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    click(themeToggle()); // dark -> system (resolves to light in jsdom)
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("opens a past consultation from Medical Records and from the Consultation sub-nav", async () => {
    renderApp();
    await flush();

    // Closed visits are readable from the medical records list.
    click(findButton("Medical Records"));
    await flush();
    click(findButton("View"));
    await flush();
    expect(document.body.textContent).toContain("Consultation closed");
    expect(document.body.textContent).toContain("Soft tissue strain, right stifle");

    // The sidebar exposes Consultation directly and offers a picker when no
    // visit is currently open.
    click(findButton("Consultation"));
    await flush();
    expect(document.body.textContent).toContain("No active consultation");
    click(findButton("View"));
    await flush();
    expect(document.body.textContent).toContain("Consultation closed");
  });

  it("runs a full visit: vitals, diagnosis, prescription, close, invoice, partial payment and receipt", async () => {
    renderApp();
    await flush();
    await signInAs("Nok Srisuk"); // reception handles billing
    click(findButton("Appointments & Queue"));
    await flush();

    // Moo Daeng is checked in at 10:00 — start the consultation
    click(findButton("Start"));
    await flush();
    expect(document.body.textContent).toContain("Clinical record for Moo Daeng");

    // Vitals
    setValue(document.getElementById("vt-weight") as HTMLInputElement, "28.4");
    setValue(document.getElementById("vt-temp") as HTMLInputElement, "38.9");
    click(findButton("Record vitals"));
    await flush();

    // Diagnosis
    setValue(document.getElementById("dx-text") as HTMLInputElement, "Acute otitis externa, left ear");
    click(findButton("Add diagnosis"));
    await flush();
    expect(document.body.textContent).toContain("Acute otitis externa, left ear");

    // Prescription from the pharmacy catalog
    setValue(document.getElementById("rx-item") as HTMLSelectElement, "it-2");
    setValue(document.getElementById("rx-dose") as HTMLInputElement, "10 mg/kg");
    click(findButton("Add prescription"));
    await flush();
    expect(document.body.textContent).toContain("Amoxicillin 250 mg tablet");

    // Close → draft invoice generated
    click(findButton("Close consultation"));
    await flush();
    expect(document.body.textContent).toContain("Consultation closed");
    expect(document.body.textContent).toContain("INV-2026-0143");
    click(findButton("Go to billing"));
    await flush();

    // Post the draft, then pay part of the balance
    click(findButton("Post invoice"));
    await flush();
    click(findButton("Record payment"));
    await flush();
    const payDialog = document.querySelector(".modal")!;
    expect(payDialog).toBeTruthy();
    setValue(document.getElementById("pay-amount") as HTMLInputElement, "300");
    click(payDialog.querySelector(".button.primary")!);
    await flush();
    expect(document.body.textContent).toContain("฿251.05"); // remaining balance

    // Settle the rest — invoice flips to paid
    click(findButton("Record payment"));
    await flush();
    const settleDialog = document.querySelector(".modal")!;
    const amountInput = document.getElementById("pay-amount") as HTMLInputElement;
    expect(amountInput.value).toBe("251.05"); // defaults to the balance
    click(settleDialog.querySelector(".button.primary")!);
    await flush();
    expect(
      [...document.querySelectorAll(".pill")].some((p) => (p.textContent ?? "").trim() === "paid"),
    ).toBe(true);

    // Printable receipt
    click(findButton("Receipt"));
    await flush();
    expect(document.body.textContent).toContain("Invoice / Receipt");
    expect(document.body.textContent).toContain("Baan Sathorn Animal Clinic");
  });

  it("warns when prescribing a medication the patient is allergic to", async () => {
    renderApp();
    await flush();
    click(findButton("Appointments & Queue"));
    await flush();

    // Walk-in Khao Niao (allergic to Penicillin)
    click(findButton("Add walk-in"));
    setValue(document.querySelector("select[aria-label='Walk-in patient']") as HTMLSelectElement, "p-2");
    setValue(document.querySelector("input[aria-label='Walk-in reason']") as HTMLInputElement, "Skin check");
    click(findButton("Add"));
    await flush();

    // Start the most recent checked-in visit (the walk-in, last in the queue)
    const startButtons = [...document.querySelectorAll("button")].filter(
      (b) => (b.textContent ?? "").trim() === "Start",
    );
    click(startButtons[startButtons.length - 1]);
    await flush();
    expect(document.body.textContent).toContain("Clinical record for Khao Niao");
    expect(document.body.textContent).toContain("Allergy: Penicillin");

    // Selecting a penicillin-class drug raises the warning before dispensing
    setValue(document.getElementById("rx-item") as HTMLSelectElement, "it-6");
    setValue(document.getElementById("rx-dose") as HTMLInputElement, "40000 IU/kg");
    await flush();
    expect(document.body.textContent).toContain("Allergy warning");
    expect(document.body.textContent).toContain("Penicillin");
  });

  it("records a vaccination with a next-due date and surfaces it on the dashboard", async () => {
    renderApp();
    await flush();
    click(findButton("Appointments & Queue"));
    await flush();
    click(findButton("Start")); // Moo Daeng — annual vaccination visit
    await flush();

    setValue(document.getElementById("vac-name") as HTMLInputElement, "Rabies vaccine");
    setValue(document.getElementById("vac-lot") as HTMLInputElement, "RAB-2610B");
    pickDate("vac-next", "2026-11-15");
    click(findButton("Record vaccination"));
    await flush();
    expect(document.body.textContent).toContain("next due 2026-11-15");

    click(findButton("Dashboard"));
    await flush();
    expect(document.body.textContent).toContain("Vaccinations due");
    expect(document.body.textContent).toContain("Due 2026-11-15");
    expect(document.body.textContent).toContain("Overdue 2026-10-15"); // seeded overdue booster
  });

  it("books a follow-up appointment from the consultation", async () => {
    renderApp();
    await flush();
    click(findButton("Appointments & Queue"));
    await flush();
    click(findButton("Start")); // Moo Daeng
    await flush();

    pickDate("fu-date", "2026-11-05");
    click(findButton("Book follow-up"));
    await flush();

    click(findButton("Appointments & Queue"));
    await flush();
    expect(document.body.textContent).toContain("Follow-up: Annual vaccination");
  });

  it("creates an invoice directly in billing and settles it", async () => {
    renderApp();
    await flush();
    await signInAs("Nok Srisuk"); // reception handles billing
    click(findButton("Billing & Payments"));
    await flush();

    click(findButton("New invoice"));
    setValue(document.getElementById("ni-owner") as HTMLSelectElement, "o-3");
    setValue(document.getElementById("ni-item") as HTMLSelectElement, "svc-2");
    setValue(document.getElementById("ni-qty") as HTMLInputElement, "2");
    click(findButton("Create draft invoice"));
    await flush();
    expect(document.body.textContent).toContain("INV-2026-0143");

    click(findButton("Post invoice"));
    await flush();
    click(findButton("Record payment"));
    await flush();
    const dialog = document.querySelector(".modal")!;
    expect((document.getElementById("pay-amount") as HTMLInputElement).value).toBe("428.00"); // 2 × 200 + VAT
    click(dialog.querySelector(".button.primary")!);
    await flush();
    expect(
      [...document.querySelectorAll(".pill")].some((p) => (p.textContent ?? "").trim() === "paid"),
    ).toBe(true);
  });

  it("adds a patient to an existing owner and finds it by owner phone", async () => {
    renderApp();
    await flush();
    click(findButton("Owners & Patients"));
    await flush();

    click(findButton("Register Patient"));
    click(findButton("Existing owner"));
    setValue(document.getElementById("owner-select") as HTMLSelectElement, "o-1");
    setValue(document.getElementById("patient") as HTMLInputElement, "Thong Dee");
    setValue(document.getElementById("patient-species") as HTMLSelectElement, "Cat");
    pickDate("patient-dob", "2024-06-01");
    click(findButton("Save Records"));
    await flush();

    setValue(document.querySelector(".search-field input") as HTMLInputElement, "081 234 5678");
    await flush();
    expect(document.body.textContent).toContain("Thong Dee");
    expect(document.body.textContent).toContain("Moo Daeng"); // same owner, also found by phone
  });
});
