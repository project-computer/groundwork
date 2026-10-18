import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScheduleCalendar, dayKey } from "./schedule-calendar";
import type { Appointment } from "@/lib/types";

const today = dayKey(new Date());

function appt(id: string, dateTime: string): Appointment {
  return {
    id,
    patientId: "p1",
    dateTime,
    durationMin: 30,
    reason: "Checkup",
    vet: "Dr. Rivera",
    status: "scheduled",
    notes: "",
    createdAt: "t",
    updatedAt: "t",
  };
}

describe("ScheduleCalendar", () => {
  const patients = new Map([["p1", { id: "p1", name: "Momo" } as never]]);

  it("shows appointment chips on the right day", () => {
    render(
      <ScheduleCalendar
        appointments={[appt("a1", `${today}T09:00`)]}
        patients={patients}
        selected={today}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/09:00 Momo/)).toBeInTheDocument();
  });

  it("selects a day on click", async () => {
    const user = userEvent.setup();
    let picked = "";
    render(
      <ScheduleCalendar
        appointments={[appt("a1", `${today}T09:00`)]}
        patients={patients}
        selected={today}
        onSelect={(d) => (picked = d)}
      />,
    );
    await user.click(screen.getByText(/09:00 Momo/));
    expect(picked).toBe(today);
  });
});
