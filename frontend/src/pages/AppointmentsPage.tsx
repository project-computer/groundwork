import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAppointments, useCreateAppointment, useUpdateAppointment, useCheckInAppointment } from "@/features/appointments/api"
import { usePatients } from "@/features/patients/api"
import { Box, Button, Label, TextInput, Textarea, Select, FormControl, Dialog, Heading, Text } from "@primer/react"
import { DataTable } from "@primer/react/experimental"
import { Plus, Search, CalendarDays, LogIn } from "lucide-react"

const typeOptions = ["Checkup", "Vaccination", "Surgery", "Emergency", "Follow-up", "Grooming"] as const
const statusOptions = ["Scheduled", "In Progress", "Completed", "Cancelled"] as const
const vets = ["Dr. Williams", "Dr. Martinez"]
const statusVariant: Record<string, "primary" | "accent" | "success" | "danger" | "attention"> = {
  Scheduled: "primary",
  "In Progress": "attention",
  "Checked-In": "attention",
  Completed: "success",
  Cancelled: "danger",
}

type Apt = Record<string, unknown> & { id: string | number }

export default function AppointmentsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [selectedApt, setSelectedApt] = useState<Apt | null>(null)
  const [form, setForm] = useState({ petId: "", date: "", time: "", type: "Checkup", notes: "", veterinarianName: vets[0] })

  const { data: aptsData, isLoading } = useAppointments({ limit: 100, status: filterStatus !== "all" ? filterStatus : undefined })
  const { data: petsData } = usePatients({ limit: 200 })
  const createMutation = useCreateAppointment()
  const updateMutation = useUpdateAppointment()
  const checkInMutation = useCheckInAppointment()

  const appointments = (aptsData?.data ?? []) as Apt[]
  const pets = (petsData?.data ?? []) as Apt[]

  const filtered = appointments.filter((a) => {
    const q = search.toLowerCase()
    return (
      String(a.petName ?? "").toLowerCase().includes(q) ||
      String(a.ownerName ?? "").toLowerCase().includes(q) ||
      String(a.veterinarianName ?? "").toLowerCase().includes(q)
    )
  })

  function handleAdd() {
    const pet = pets.find((p) => String(p.id) === form.petId)
    if (!pet) return
    createMutation.mutate({
      petId: Number(form.petId),
      petName: pet.name as string,
      ownerName: pet.ownerName as string,
      date: form.date,
      time: form.time + ":00",
      type: form.type,
      notes: form.notes,
      veterinarianName: form.veterinarianName,
    }, {
      onSuccess: () => {
        setDialogOpen(false)
        setForm({ petId: "", date: "", time: "", type: "Checkup", notes: "", veterinarianName: vets[0] })
      },
    })
  }

  function handleStatusChange(newStatus: string) {
    if (!selectedApt) return
    updateMutation.mutate({ id: selectedApt.id as number, data: { status: newStatus } }, {
      onSuccess: () => { setStatusDialogOpen(false); setSelectedApt(null) },
    })
  }

  function handleCheckIn(aptId: number) {
    checkInMutation.mutate(aptId, {
      onSuccess: (data: { data?: { visitId?: number } }) => {
        if (data?.data?.visitId) navigate(`/visits/${data.data.visitId}`)
      },
    })
  }

  return (
    <Box sx={{ p: [3, 4] }}>
      <Box sx={{ display: "flex", flexDirection: ["column", "row"], alignItems: ["stretch", "center"], justifyContent: "space-between", gap: 3, mb: 4 }}>
        <Box>
          <Heading as="h2" sx={{ fontSize: 4 }}>Appointments</Heading>
          <Text as="p" sx={{ fontSize: 1, color: "fg.muted", mt: 1 }}>Schedule and manage all clinic appointments.</Text>
        </Box>
        <Button variant="primary" onClick={() => setDialogOpen(true)} leadingVisual={() => <Plus size={16} />}>New Appointment</Button>
      </Box>

      <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 3, display: "flex", flexDirection: ["column", "row"], gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <TextInput
              placeholder="Search by pet, owner, or vet..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              trailingVisual={() => <Search size={16} />}
              block
              aria-label="Search appointments"
            />
          </Box>
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filter by status">
            <Select.Option value="all">All statuses</Select.Option>
            {statusOptions.map((s) => <Select.Option key={s} value={s}>{s}</Select.Option>)}
          </Select>
        </Box>
        <Box sx={{ overflowX: "auto" }}>
          {isLoading ? (
            <Text as="p" sx={{ textAlign: "center", py: 4, color: "fg.muted" }}>Loading...</Text>
          ) : filtered.length === 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, py: 4, color: "fg.muted" }}>
              <CalendarDays size={32} /><Text>No appointments found</Text>
            </Box>
          ) : (
            <DataTable
              aria-label="Appointments"
              data={filtered}
              columns={[
                { header: "ID", field: "customId", rowHeader: true, renderCell: (row: Apt) => <Text sx={{ fontFamily: "mono", fontSize: 0, color: "fg.muted" }}>{String(row.customId ?? "")}</Text> },
                { header: "Pet", field: "petName", renderCell: (row: Apt) => <Text sx={{ fontWeight: "bold" }}>{String(row.petName ?? "")}</Text> },
                { header: "Owner", field: "ownerName", renderCell: (row: Apt) => <Text>{String(row.ownerName ?? "")}</Text> },
                { header: "Date", field: "date", renderCell: (row: Apt) => <Text>{typeof row.date === "string" ? row.date.slice(0, 10) : ""}</Text> },
                { header: "Time", field: "time", renderCell: (row: Apt) => <Text>{typeof row.time === "string" ? row.time.slice(0, 5) : ""}</Text> },
                { header: "Type", field: "type", renderCell: (row: Apt) => <Text>{String(row.type ?? "")}</Text> },
                { header: "Vet", field: "veterinarianName", renderCell: (row: Apt) => <Text sx={{ color: "fg.muted" }}>{String(row.veterinarianName ?? "") || "-"}</Text> },
                { header: "Status", field: "status", renderCell: (row: Apt) => <Label variant={statusVariant[String(row.status)] ?? "default"}>{String(row.status ?? "")}</Label> },
                {
                  header: "Actions", field: "actions",
                  renderCell: (row: Apt) => (
                    <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                      {(row.status === "Scheduled" || row.status === "In Progress") && (
                        <Button variant="invisible" size="small" onClick={() => handleCheckIn(row.id as number)} leadingVisual={() => <LogIn size={14} />}>Check In</Button>
                      )}
                      <Button variant="invisible" size="small" onClick={() => { setSelectedApt(row as Apt); setStatusDialogOpen(true) }}>Update</Button>
                    </Box>
                  ),
                },
              ]}
            />
          )}
        </Box>
      </Box>

      {dialogOpen && (
        <Dialog onClose={() => setDialogOpen(false)} aria-labelledby="schedule-apt-title" sx={{ width: "large" }}>
          <Dialog.Header id="schedule-apt-title">Schedule Appointment</Dialog.Header>
          <Box sx={{ p: 3, display: "grid", gridTemplateColumns: ["1fr", "1fr 1fr"], gap: 3 }}>
            <Box sx={{ gridColumn: ["auto", "1 / -1"] }}>
              <FormControl>
                <FormControl.Label>Patient</FormControl.Label>
                <Select value={form.petId} onChange={(e) => setForm({ ...form, petId: e.target.value })} aria-label="Patient" block>
                  <Select.Option value="">Select a patient</Select.Option>
                  {pets.filter((p) => p.status === "Active").map((p) => <Select.Option key={String(p.id)} value={String(p.id)}>{String(p.name)} ({String(p.ownerName)})</Select.Option>)}
                </Select>
              </FormControl>
            </Box>
            <FormControl>
              <FormControl.Label>Date</FormControl.Label>
              <TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} block aria-label="Date" />
            </FormControl>
            <FormControl>
              <FormControl.Label>Time</FormControl.Label>
              <TextInput type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} block aria-label="Time" />
            </FormControl>
            <FormControl>
              <FormControl.Label>Type</FormControl.Label>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} aria-label="Type" block>
                {typeOptions.map((t) => <Select.Option key={t} value={t}>{t}</Select.Option>)}
              </Select>
            </FormControl>
            <FormControl>
              <FormControl.Label>Vet</FormControl.Label>
              <Select value={form.veterinarianName} onChange={(e) => setForm({ ...form, veterinarianName: e.target.value })} aria-label="Vet" block>
                {vets.map((v) => <Select.Option key={v} value={v}>{v}</Select.Option>)}
              </Select>
            </FormControl>
            <Box sx={{ gridColumn: ["auto", "1 / -1"] }}>
              <FormControl>
                <FormControl.Label>Notes</FormControl.Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} block aria-label="Notes" />
              </FormControl>
            </Box>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, p: 3, borderTop: "1px solid", borderColor: "border.default" }}>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAdd} disabled={!form.petId || !form.date || !form.time || createMutation.isPending}>Schedule</Button>
          </Box>
        </Dialog>
      )}

      {statusDialogOpen && (
        <Dialog onClose={() => setStatusDialogOpen(false)} aria-labelledby="update-status-title">
          <Dialog.Header id="update-status-title">Update Status</Dialog.Header>
          {selectedApt && (
            <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
              <Text sx={{ fontSize: 1, color: "fg.muted", mb: 2 }}>Update status for <Text sx={{ fontWeight: "bold", color: "fg.default" }}>{String(selectedApt.petName ?? "")}</Text>.</Text>
              {statusOptions.map((status) => (
                <Button key={status} variant={selectedApt.status === status ? "primary" : "default"} onClick={() => handleStatusChange(status)}>{status}</Button>
              ))}
            </Box>
          )}
        </Dialog>
      )}
    </Box>
  )
}
