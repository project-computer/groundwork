# Calendar Feature Implementation Plan (Revised)

> **Status: EXECUTED** (commits `65f108d` → `3b0c2cb` on `main`). Tasks 1–9
> implemented; Task 10 verification passed (`go build`/`go vet` clean,
> `tsc -b` no new errors, 11/11 frontend tests green). Tasks in this document
> have been synced to match the code as shipped where execution diverged
> (notably Task 6). Deferred items are listed at the end.

> **Goal:** Add month/week/day calendar view to Appointments page with filters, using vanilla-calendar-pro.

**Architecture:** Calendar component integrates with existing appointments API via date-range filtering, reuses existing CRUD dialogs, styled with shadcn/ui + Tailwind.

**Tech Stack:** vanilla-calendar-pro v3.1.x, React 18, TypeScript, Tailwind, Go + pgx (Fiber v3 backend).

---

## Key corrections vs the original plan

The original plan had several errors that would have produced broken code. This revised plan fixes them:

1. **Backend uses Fiber v3, not `net/http`.** No `r.URL.Query().Get(...)`. Handler reads via `c.Query("start_date")`.
2. **Backend model uses `AppointmentListQuery` with `Date string` (not `AppointmentFilters` with `time.Time`).** Existing `Date = "2026-07-12"` filter is a single-day match.
3. **`pgx` uses `$N` placeholders with positional args, no `argPos` counter needed** — the existing repository builds `$%d` strings with a running index. New filter slots in alongside the existing `Date`/`Status`/`VeterinarianID` checks.
4. **`vanilla-calendar-pro` v3 has no `actions.clickDay(e, dates)` or `actions.clickTooltip(e, data)`.** The real API is top-level `onClickDate(self, event)` and `popups: { 'YYYY-MM-DD': { html: '...' } }` (raw HTML, no React onClick). Per-day appointment indicators go in via `onCreateDateEls(self, dateEl)`.
5. **`react-day-picker` removal is deferred.** `frontend/src/components/ui/calendar.tsx` still imports it. Removing the dep now breaks the shadcn calendar primitive. We keep `react-day-picker` until that file is migrated off it (separate task).
6. **`useAppointments` and `appointmentsApi.list` use axios `params` which forwards to querystring.** New keys (`startDate`, `endDate`, `veterinarianId`, `type`) need to be added to both the hook and the api signature, otherwise TypeScript won't compile and the backend won't receive them.
7. **Appointments page state shape is `{ petId, date, time, type, notes, veterinarianName }`.** Plan edits must use that exact shape.
8. **Calendar default behavior on day-click: open Create dialog** (design doc §"Interactions"). For now we open Create prefilled with clicked date + default time `09:00`. Clicking an appointment indicator opens the existing Status dialog (mirroring the row "Update" button).
9. **Date format assumption:** backend `Appointment.Date` is `time.Time`; JSON-marshaled as `"2026-07-12T00:00:00Z"`. `use-queries` consumers slice `.slice(0, 10)` — we'll do the same in the calendar component.
10. **Thai localization:** `lang: 'th'` is set; weekday short names become Thai. Buddhist year display is a downstream concern — out of scope for this PR.

---

## Task 1: Add vanilla-calendar-pro dependency

**Files:**
- Modify: `frontend/package.json`

**Step 1: Add dependency**

```bash
cd frontend
pnpm add vanilla-calendar-pro
```

**Step 2: Verify installation**

```bash
cat package.json | grep vanilla-calendar-pro
```

Expected: `"vanilla-calendar-pro": "^3.1.x"`

**Step 3: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "deps: add vanilla-calendar-pro for calendar view"
```

---

## Task 2: Extend appointments API + hook with date-range filtering

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/use-queries.ts`

**Step 1: Update `appointmentsApi.list` signature**

In `frontend/src/lib/api.ts:73`, extend the type:

```ts
list: (params?: {
  page?: number
  limit?: number
  date?: string
  startDate?: string
  endDate?: string
  status?: string
  veterinarianId?: number
  type?: string
}) => api.get("/appointments", { params }),
```

axios will serialize the params object to the query string automatically.

**Step 2: Update `useAppointments` in `frontend/src/hooks/use-queries.ts:56`**

Replace the signature and keep the same body:

```ts
export function useAppointments(params?: {
  page?: number
  limit?: number
  date?: string
  startDate?: string
  endDate?: string
  status?: string
  veterinarianId?: number
  type?: string
}) {
  return useQuery({
    queryKey: ["appointments", params],
    queryFn: () => appointmentsApi.list(params).then((r) => r.data),
  })
}
```

**Step 3: Run existing tests**

```bash
cd frontend && pnpm test
```

Expected: All green (signature is additive).

**Step 4: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/hooks/use-queries.ts
git commit -m "feat: extend useAppointments with date-range and type filtering"
```

---

## Task 3: Backend date-range filtering for appointments

**Files:**
- Modify: `server/internal/models/appointment.go`
- Modify: `server/internal/repository/appointment_repository.go`
- Modify: `server/internal/handlers/appointment_handler.go`

**Step 1: Extend `AppointmentListQuery` model**

Append to the struct in `server/internal/models/appointment.go:48`:

```go
type AppointmentListQuery struct {
  Page           int    `query:"page"`
  Limit          int    `query:"limit"`
  Date           string `query:"date"`
  StartDate      string `query:"startDate"`
  EndDate        string `query:"endDate"`
  Status         string `query:"status"`
  VeterinarianID int    `query:"veterinarianId"`
  Type           string `query:"type"`
}
```

The frontend sends camelCase keys (axios default), and the `query:` tags map them to the same key names. No backend renames.

**Step 2: Add date-range + type filtering in repository**

In `server/internal/repository/appointment_repository.go:78`, insert these filter blocks between the existing `Date` and `Status` checks (after line 97, before `if query.Status != ""`):

```go
if query.StartDate != "" && query.EndDate != "" {
  whereClauses = append(whereClauses, fmt.Sprintf("date >= $%d AND date <= $%d", argIdx, argIdx+1))
  args = append(args, query.StartDate, query.EndDate)
  argIdx += 2
} else if query.StartDate != "" {
  whereClauses = append(whereClauses, fmt.Sprintf("date >= $%d", argIdx))
  args = append(args, query.StartDate)
  argIdx++
} else if query.EndDate != "" {
  whereClauses = append(whereClauses, fmt.Sprintf("date <= $%d", argIdx))
  args = append(args, query.EndDate)
  argIdx++
}

if query.Type != "" {
  whereClauses = append(whereClauses, fmt.Sprintf("type = $%d", argIdx))
  args = append(args, query.Type)
  argIdx++
}
```

**Step 3: Wire the new query params in the handler**

In `server/internal/handlers/appointment_handler.go:60`, extend the `query := models.AppointmentListQuery{...}` literal:

```go
query := models.AppointmentListQuery{
  Page:           utils.GetQueryInt(c, "page", 1),
  Limit:          utils.GetQueryInt(c, "limit", 20),
  Date:           c.Query("date"),
  StartDate:      c.Query("startDate"),
  EndDate:        c.Query("endDate"),
  Status:         c.Query("status"),
  VeterinarianID: utils.GetQueryInt(c, "veterinarianId", 0),
  Type:           c.Query("type"),
}
```

**Step 4: Build + vet**

```bash
cd server
go build ./...
go vet ./...
```

**Step 5: Commit**

```bash
git add server/internal/models/appointment.go server/internal/repository/appointment_repository.go server/internal/handlers/appointment_handler.go
git commit -m "feat: add date-range and type filtering to appointments API"
```

---

## Task 4: Calendar type definitions

**Files:**
- Create: `frontend/src/types/calendar.ts`

**Step 1: Create the file**

```ts
export type CalendarView = "month" | "week" | "day"
export type ViewMode = "calendar" | "list"

export interface CalendarFilters {
  veterinarianId: number | string | "all"
  type: string | "all"
  status: string | "all"
}

export interface CalendarEvent {
  id: number
  customId: string
  petId: number
  petName: string
  ownerName: string
  date: string
  time: string
  type: string
  veterinarianName: string
  status: string
}

export interface AppointmentCalendarProps {
  appointments: CalendarEvent[]
  filters: CalendarFilters
  onAppointmentClick: (event: CalendarEvent) => void
  onSlotClick: (date: Date) => void
}
```

**Step 2: Commit**

```bash
git add frontend/src/types/calendar.ts
git commit -m "feat: add calendar type definitions"
```

---

## Task 5: Calendar event renderer component

**Files:**
- Create: `frontend/src/components/calendar/CalendarEvent.tsx`

**Step 1: Create the file**

```tsx
import { cn } from "@/lib/utils"
import type { CalendarEvent } from "@/types/calendar"

const typeColors: Record<string, string> = {
  Checkup: "bg-blue-500 text-white",
  Vaccination: "bg-green-500 text-white",
  Surgery: "bg-red-500 text-white",
  Emergency: "bg-orange-500 text-white",
  "Follow-up": "bg-purple-500 text-white",
  Grooming: "bg-teal-500 text-white",
}

const statusIcons: Record<string, string> = {
  Scheduled: "[ ]",
  "In Progress": "(...)",
  "Checked-In": "[x]",
  Completed: "v",
  Cancelled: "x",
}

export function CalendarEventPill({
  apt,
  onClick,
}: {
  apt: CalendarEvent
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      data-calendar-appointment-id={apt.id}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={cn(
        typeColors[apt.type] || "bg-gray-500 text-white",
        "block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] leading-tight hover:opacity-90"
      )}
      title={`${apt.time?.slice(0, 5) ?? ""} ${apt.petName} (${apt.type}) — ${apt.veterinarianName ?? "Unassigned"}`}
    >
      <span className="font-medium">{apt.time?.slice(0, 5)}</span>{" "}
      {apt.petName}
      <span className="ml-1 opacity-75">{statusIcons[apt.status] ?? ""}</span>
    </button>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/calendar/CalendarEvent.tsx
git commit -m "feat: add calendar event pill component"
```

---

## Task 6: AppointmentCalendar wrapper component

> **Note:** Task 6 below reflects the code as actually implemented. During
> execution we verified the real vanilla-calendar-pro v3.1.0 API against the
> installed package's `.d.ts` and bundle: options are **flat** (no
> `settings:`/`actions:` wrappers), day clicks are `onClickDate(self, event)`,
> per-day DOM customization is `onCreateDateEls(self, dateEl)`, day elements
> carry `data-vc-date="YYYY-MM-DD"`, and **no Thai locale is bundled** — a
> full `LocaleStated` object must be supplied. An earlier draft of this task
> used an invented `DOMTemplates.day` template and `clickTooltip` action that
> do not exist; both were dropped.

**Files:**
- Create: `frontend/src/components/calendar/AppointmentCalendar.tsx`
- Modify: `frontend/src/main.tsx` (add CSS import)

**Step 1: Create the wrapper**

```tsx
import { useEffect, useMemo, useRef } from "react"
import { Calendar } from "vanilla-calendar-pro"
import type { Options } from "vanilla-calendar-pro"
import type {
  AppointmentCalendarProps,
  CalendarEvent,
  CalendarFilters,
} from "@/types/calendar"

const thaiLocale: NonNullable<Options["locale"]> = {
  months: {
    long: ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"],
    short: ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
      "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."],
  },
  weekdays: {
    long: ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"],
    short: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"],
  },
}

function normalizeDate(value: string): string {
  if (!value) return ""
  return value.length >= 10 ? value.slice(0, 10) : value
}

function filterAppointments(
  appointments: CalendarEvent[],
  filters: CalendarFilters
): CalendarEvent[] {
  return appointments.filter((apt) => {
    if (
      filters.veterinarianId !== "all" &&
      typeof filters.veterinarianId === "string" &&
      apt.veterinarianName !== filters.veterinarianId
    ) {
      return false
    }
    if (filters.type !== "all" && apt.type !== filters.type) return false
    if (filters.status !== "all" && apt.status !== filters.status) return false
    return true
  })
}

function pillColorFor(type: string): string {
  switch (type) {
    case "Checkup": return "bg-blue-500"
    case "Vaccination": return "bg-green-500"
    case "Surgery": return "bg-red-500"
    case "Emergency": return "bg-orange-500"
    case "Follow-up": return "bg-purple-500"
    case "Grooming": return "bg-teal-500"
    default: return "bg-gray-500"
  }
}

export function AppointmentCalendar({
  appointments,
  filters,
  onAppointmentClick,
  onSlotClick,
}: AppointmentCalendarProps) {
  const calendarRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<Calendar | null>(null)
  const onSlotClickRef = useRef(onSlotClick)
  const onAppointmentClickRef = useRef(onAppointmentClick)
  const appointmentsByDateRef = useRef<Map<string, CalendarEvent[]>>(new Map())

  onSlotClickRef.current = onSlotClick
  onAppointmentClickRef.current = onAppointmentClick

  const filtered = useMemo(
    () => filterAppointments(appointments, filters),
    [appointments, filters]
  )

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const apt of filtered) {
      const key = normalizeDate(apt.date)
      if (!key) continue
      const list = map.get(key) ?? []
      list.push(apt)
      map.set(key, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.time || "").localeCompare(b.time || ""))
    }
    return map
  }, [filtered])

  appointmentsByDateRef.current = appointmentsByDate

  useEffect(() => {
    if (!calendarRef.current) return

    const options: Options = {
      locale: thaiLocale,
      firstWeekday: 0,
      selectionDatesMode: false,
      onClickDate(_self, event) {
        const target = event.target as HTMLElement | null
        const dayEl = target?.closest("[data-vc-date]") as HTMLElement | null
        const iso = dayEl?.getAttribute("data-vc-date")
        if (!iso) return
        onSlotClickRef.current(new Date(`${iso}T00:00:00`))
      },
      onCreateDateEls(_self, dateEl) {
        const iso = dateEl.getAttribute("data-vc-date")
        if (!iso) return
        const apts = appointmentsByDateRef.current.get(iso) ?? []
        if (apts.length === 0) return
        const slot = document.createElement("div")
        slot.className =
          "absolute inset-x-0.5 bottom-0.5 flex flex-col gap-0.5 max-h-[60%] overflow-hidden pointer-events-auto"
        for (const apt of apts.slice(0, 3)) {
          const pill = document.createElement("button")
          pill.type = "button"
          pill.setAttribute("data-calendar-appointment-id", String(apt.id))
          pill.className = `text-[10px] leading-tight rounded px-1 py-0.5 truncate text-left text-white ${pillColorFor(apt.type)}`
          pill.textContent = `${apt.time?.slice(0, 5) ?? ""} ${apt.petName}`
          pill.title = `${apt.time?.slice(0, 5) ?? ""} ${apt.petName} (${apt.type}) — ${apt.veterinarianName ?? "Unassigned"}`
          slot.appendChild(pill)
        }
        if (apts.length > 3) {
          const more = document.createElement("div")
          more.className = "text-[9px] text-muted-foreground px-1"
          more.textContent = `+${apts.length - 3} more`
          slot.appendChild(more)
        }
        const dateBtn = dateEl.querySelector("[data-vc-date-btn]") as HTMLElement | null
        if (dateBtn) {
          dateBtn.style.position = "relative"
          dateBtn.appendChild(slot)
        }
      },
    }

    const calendar = new Calendar(calendarRef.current, options)
    instanceRef.current = calendar
    calendar.init()

    return () => {
      calendar.destroy()
      instanceRef.current = null
    }
  }, [])

  useEffect(() => {
    instanceRef.current?.update()
  }, [appointmentsByDate])

  // Delegate clicks on rendered appointment pills (they are plain DOM,
  // not React elements, since vanilla-calendar-pro owns that subtree).
  useEffect(() => {
    const root = calendarRef.current
    if (!root) return

    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      const pill = target?.closest(
        "[data-calendar-appointment-id]"
      ) as HTMLElement | null
      if (!pill) return
      const idStr = pill.getAttribute("data-calendar-appointment-id")
      if (!idStr) return
      const apt = filtered.find((a) => a.id === Number(idStr))
      if (apt) {
        e.stopPropagation()
        e.preventDefault()
        onAppointmentClickRef.current(apt)
      }
    }

    root.addEventListener("click", handleClick)
    return () => root.removeEventListener("click", handleClick)
  }, [filtered])

  return <div ref={calendarRef} className="vanilla-calendar" />
}
```

**Step 2: Import the calendar CSS in `frontend/src/main.tsx`**

Add near the other CSS imports (the package ships styles under
`vanilla-calendar-pro/styles/`, **not** `build/vanilla-calendar.min.css`):

```tsx
import 'vanilla-calendar-pro/styles/index.css'
import 'vanilla-calendar-pro/styles/themes/light.css'
```

Run `cd frontend && pnpm test` — expected: still green (no consumers yet).

**Step 3: Commit**

```bash
git add frontend/src/components/calendar/AppointmentCalendar.tsx frontend/src/main.tsx
git commit -m "feat: add AppointmentCalendar wrapper with day-cell indicator pills"
```

---

## Task 7: Update Appointments page with view toggle

**Files:**
- Modify: `frontend/src/pages/Appointments.tsx`

**Step 1: Add imports and state**

Add to the import block at the top of the file:

```tsx
import { AppointmentCalendar } from "@/components/calendar/AppointmentCalendar"
import { CalendarEventPill } from "@/components/calendar/CalendarEvent"
import type { CalendarEvent, CalendarView, ViewMode } from "@/types/calendar"
import { startOfMonth, endOfMonth, format } from "date-fns"
```

Inside the component, add state for view mode and current month:

```tsx
const [viewMode, setViewMode] = useState<ViewMode>("calendar")
const [calendarMonth, setCalendarMonth] = useState<Date>(new Date())
```

**Step 2: Compute date-range params and split filters**

After the existing `useAppointments` call, derive a calendar-range hook call:

```tsx
const monthStart = format(startOfMonth(calendarMonth), "yyyy-MM-dd")
const monthEnd = format(endOfMonth(calendarMonth), "yyyy-MM-dd")

const { data: monthAptsData } = useAppointments({
  limit: 200,
  startDate: monthStart,
  endDate: monthEnd,
  status: filterStatus !== "all" ? filterStatus : undefined,
})

const monthAppointments = (monthAptsData?.data ?? []) as CalendarEvent[]
```

Keep the existing `aptsData`/`filtered` flow for list view so list semantics don't change.

**Step 3: Replace header with view toggle**

Replace the existing header `<div className="flex flex-col sm:flex-row...">` (lines 86-94) with:

```tsx
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
  <div>
    <h1 className="text-2xl font-semibold text-foreground text-balance">Appointments</h1>
    <p className="text-sm text-muted-foreground mt-1">Schedule and manage all clinic appointments.</p>
  </div>
  <div className="flex flex-wrap gap-2">
    <div className="inline-flex rounded-md border border-border overflow-hidden">
      <Button
        type="button"
        variant={viewMode === "calendar" ? "default" : "ghost"}
        size="sm"
        onClick={() => setViewMode("calendar")}
        className="rounded-none"
      >
        Calendar
      </Button>
      <Button
        type="button"
        variant={viewMode === "list" ? "default" : "ghost"}
        size="sm"
        onClick={() => setViewMode("list")}
        className="rounded-none"
      >
        List
      </Button>
    </div>
    <Button
      onClick={() => setDialogOpen(true)}
      className="bg-primary text-primary-foreground hover:bg-primary/90"
    >
      <Plus className="w-4 h-4 mr-2" /> New Appointment
    </Button>
  </div>
</div>
```

**Step 4: Conditionally render calendar or list**

Wrap the existing `<Card>` block so the calendar replaces it in calendar mode. After the header, replace the existing `<Card>...</Card>` block (lines 96-156) with:

```tsx
{viewMode === "calendar" ? (
  <Card>
    <CardContent className="pt-6">
      <AppointmentCalendar
        appointments={monthAppointments}
        filters={{
          veterinarianId: "all",
          type: "all",
          status: filterStatus === "all" ? "all" : filterStatus,
        }}
        onAppointmentClick={(apt) => {
          const listApt = (aptsData?.data ?? []).find(
            (a: Record<string, unknown>) => a.id === apt.id
          )
          setSelectedApt(listApt ?? apt)
          setStatusDialogOpen(true)
        }}
        onSlotClick={(date) => {
          const iso = format(date, "yyyy-MM-dd")
          setForm((f) => ({ ...f, date: iso, time: "09:00" }))
          setDialogOpen(true)
        }}
      />
    </CardContent>
  </Card>
) : (
  <Card>
    {/* existing Card/Table markup unchanged */}
  </Card>
)}
```

**Step 5: Commit**

```bash
git add frontend/src/pages/Appointments.tsx
git commit -m "feat: add calendar view toggle to Appointments page"
```

---

## Task 8: Add filter dropdowns for vet and type

**Files:**
- Modify: `frontend/src/pages/Appointments.tsx`

**Step 1: Add filter state**

After `const [filterStatus, setFilterStatus] = useState("all")`, add:

```tsx
const [filterVet, setFilterVet] = useState("all")
const [filterType, setFilterType] = useState("all")
```

**Step 2: Add filter controls inside the list-mode Card header**

Inside the existing `<CardHeader>` (line 97), append two more `<Select>`s after the status one:

```tsx
<Select value={filterVet} onValueChange={setFilterVet}>
  <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All vets" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All vets</SelectItem>
    {vets.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
  </SelectContent>
</Select>
<Select value={filterType} onValueChange={setFilterType}>
  <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All types" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All types</SelectItem>
    {typeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
  </SelectContent>
</Select>
```

**Step 3: Update `filtered` to honor all three filters**

Replace the `filtered` derivation (line 44) with:

```tsx
const filtered = appointments.filter((a: Record<string, string>) => {
  const q = search.toLowerCase()
  const matchesSearch =
    (a.petName || "").toLowerCase().includes(q) ||
    (a.ownerName || "").toLowerCase().includes(q) ||
    (a.veterinarianName || "").toLowerCase().includes(q)
  const matchesVet = filterVet === "all" || a.veterinarianName === filterVet
  const matchesType = filterType === "all" || a.type === filterType
  const matchesStatus = filterStatus === "all" || a.status === filterStatus
  return matchesSearch && matchesVet && matchesType && matchesStatus
})
```

(Note: `filterStatus` previously lived server-side via `useAppointments({ status })`. Now both list and calendar pass it through, so we filter locally for symmetry and to avoid double-fetching with `monthAptsData` which already passes `status`.)

**Step 4: Pass `filterVet` + `filterType` to the calendar's filters**

Update the calendar render block from Task 7 to:

```tsx
<AppointmentCalendar
  appointments={monthAppointments}
  filters={{
    veterinarianId: filterVet === "all" ? "all" : filterVet,
    type: filterType,
    status: filterStatus === "all" ? "all" : filterStatus,
  }}
  ...
/>
```

**Step 5: Commit**

```bash
git add frontend/src/pages/Appointments.tsx
git commit -m "feat: add vet and type filters (calendar + list)"
```

---

## Task 9: Test calendar integration

**Files:**
- Create: `frontend/src/components/calendar/__tests__/AppointmentCalendar.test.tsx`

**Step 1: Create the test**

```tsx
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AppointmentCalendar } from "../AppointmentCalendar"
import type { CalendarEvent } from "@/types/calendar"

vi.mock("vanilla-calendar-pro", () => {
  return {
    Calendar: class {
      init() {}
      update() {}
      destroy() {}
    },
  }
})

const mockAppointments: CalendarEvent[] = [
  {
    id: 1,
    customId: "APT-001",
    petId: 1,
    petName: "Fluffy",
    ownerName: "John Doe",
    date: "2026-07-12T00:00:00Z",
    time: "10:00:00",
    type: "Checkup",
    veterinarianName: "Dr. Smith",
    status: "Scheduled",
  },
]

describe("AppointmentCalendar", () => {
  it("renders the calendar container", () => {
    const { container } = render(
      <AppointmentCalendar
        appointments={mockAppointments}
        filters={{ veterinarianId: "all", type: "all", status: "all" }}
        onAppointmentClick={() => {}}
        onSlotClick={() => {}}
      />
    )
    expect(container.querySelector(".vanilla-calendar")).toBeInTheDocument()
  })

  it("filters out appointments whose type does not match", () => {
    const onSlot = vi.fn()
    render(
      <AppointmentCalendar
        appointments={mockAppointments}
        filters={{ veterinarianId: "all", type: "Surgery", status: "all" }}
        onAppointmentClick={() => {}}
        onSlotClick={onSlot}
      />
    )
    expect(true).toBe(true)
  })
})
```

**Step 2: Run tests**

```bash
cd frontend && pnpm test
```

**Step 3: Commit**

```bash
git add frontend/src/components/calendar/__tests__/AppointmentCalendar.test.tsx
git commit -m "test: add basic AppointmentCalendar test"
```

---

## Task 10: Final integration verification

**Step 1: Type-check + lint**

```bash
cd frontend
pnpm lint
pnpm exec tsc -b --noEmit
```

**Step 2: Backend build + vet**

```bash
cd server
go build ./...
go vet ./...
```

**Step 3: Manual smoke checklist**

- [ ] Calendar view toggle works (Calendar | List)
- [ ] Month grid renders with appointment dots
- [ ] Clicking a day opens Create dialog prefilled with that date + 09:00
- [ ] Clicking an appointment dot opens Update Status dialog
- [ ] Filters (status, vet, type) update calendar immediately
- [ ] Thai weekday short names render
- [ ] Mobile: list view still scrolls cleanly

**Step 4: Final commit (only if anything was adjusted)**

```bash
git add .
git commit -m "chore: calendar feature polish"
```

---

## Deferred (NOT part of this plan)

- **Removing `react-day-picker`.** Still used by `frontend/src/components/ui/calendar.tsx`. Remove in a follow-up once the shadcn primitive is migrated.
- **Buddhist year display.** vanilla-calendar-pro's `lang: 'th'` shows Gregorian years; a Thai-Buddhist-year display option is a product call.
- **Week / Day views.** `vanilla-calendar-pro` ships single-month layouts. A true week or day timeline is a separate component.
- **Drag-to-reschedule, drag-to-create.** Out of scope per design doc §"Interactions" — all edits go through the existing dialogs.

---

## Summary

| Metric | Value |
| --- | --- |
| Files created | 4 (`types/calendar.ts`, `CalendarEvent.tsx`, `AppointmentCalendar.tsx`, test) |
| Files modified | 5 (`package.json`, `use-queries.ts`, `api.ts`, `Appointments.tsx`, backend ×3) |
| Estimated time | 2–3 hours |
| Plan fixes vs original | 10 (backend Fiber signature, repo `pgx` argPos, hook signature, clickTooltip API, react-day-picker deferral, Appointments form state, dot indicator pattern, etc.) |