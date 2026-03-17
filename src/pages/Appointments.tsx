import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  getAppointments,
  addAppointment,
  updateAppointment,
  getPets,
  getNextAppointmentId,
  checkInAppointment,
} from "@/lib/store"
import type { Appointment, Pet } from "@/lib/store"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Plus, Search, CalendarDays, LogIn } from "lucide-react"

const typeOptions = ["Checkup", "Vaccination", "Surgery", "Emergency", "Follow-up", "Grooming"] as const
const statusOptions = ["Scheduled", "In Progress", "Completed", "Cancelled"] as const
const vets = ["Dr. Williams", "Dr. Martinez"]
const statusColors: Record<string, string> = {
  Scheduled: "bg-primary/10 text-primary border-primary/20",
  "In Progress": "bg-warning/10 text-warning border-warning/20",
  Completed: "bg-success/10 text-success border-success/20",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
}

export default function AppointmentsPage() {
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState(getAppointments())
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null)
  const pets = getPets()
  const [form, setForm] = useState({ petId: "", date: "", time: "", type: "Checkup" as Appointment["type"], notes: "", veterinarian: vets[0] })

  const filtered = appointments.filter((a) => {
    const q = search.toLowerCase()
    const matchesSearch = a.petName.toLowerCase().includes(q) || a.ownerName.toLowerCase().includes(q) || a.veterinarian.toLowerCase().includes(q)
    const matchesStatus = filterStatus === "all" || a.status === filterStatus
    return matchesSearch && matchesStatus
  })

  function handleAdd() {
    const pet = pets.find((p: Pet) => p.id === form.petId)
    if (!pet) return
    const newApt: Appointment = {
      id: getNextAppointmentId(),
      petId: form.petId, petName: pet.name, ownerName: pet.ownerName,
      date: form.date, time: form.time, type: form.type, status: "Scheduled", notes: form.notes, veterinarian: form.veterinarian,
    }
    addAppointment(newApt)
    setAppointments(getAppointments())
    setDialogOpen(false)
    setForm({ petId: "", date: "", time: "", type: "Checkup", notes: "", veterinarian: vets[0] })
  }

  function handleStatusChange(newStatus: string) {
    if (!selectedApt) return
    updateAppointment(selectedApt.id, { status: newStatus as Appointment["status"] })
    setAppointments(getAppointments())
    setStatusDialogOpen(false)
    setSelectedApt(null)
  }

  function handleCheckIn(appointmentId: string) {
    const visit = checkInAppointment(appointmentId)
    setAppointments(getAppointments())
    if (visit) navigate(`/visits/${visit.id}`)
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground text-balance">Appointments</h1>
          <p className="text-sm text-muted-foreground mt-1">Schedule and manage all clinic appointments.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" /> New Appointment
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by pet, owner, or vet..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>ID</TableHead><TableHead>Pet</TableHead><TableHead className="hidden sm:table-cell">Owner</TableHead>
                <TableHead>Date</TableHead><TableHead className="hidden sm:table-cell">Time</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead><TableHead className="hidden lg:table-cell">Vet</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8"><div className="flex flex-col items-center gap-2 text-muted-foreground"><CalendarDays className="w-8 h-8" /><p>No appointments found</p></div></TableCell></TableRow>
              ) : (
                filtered.map(apt => (
                  <TableRow key={apt.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{apt.id}</TableCell>
                    <TableCell className="font-medium text-foreground">{apt.petName}</TableCell>
                    <TableCell className="hidden sm:table-cell">{apt.ownerName}</TableCell>
                    <TableCell>{apt.date}</TableCell>
                    <TableCell className="hidden sm:table-cell">{apt.time}</TableCell>
                    <TableCell className="hidden md:table-cell">{apt.type}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{apt.veterinarian}</TableCell>
                    <TableCell><Badge variant="outline" className={statusColors[apt.status] || ""}>{apt.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {(apt.status === "Scheduled" || apt.status === "In Progress") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCheckIn(apt.id)}
                            className="text-success hover:text-success"
                          >
                            <LogIn className="w-4 h-4 mr-1" /> Check In
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedApt(apt); setStatusDialogOpen(true) }} className="text-primary hover:text-primary">Update</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Schedule Appointment</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label>Patient</Label>
              <Select value={form.petId} onValueChange={(v) => setForm({ ...form, petId: v })}>
                <SelectTrigger><SelectValue placeholder="Select a patient" /></SelectTrigger>
                <SelectContent>{pets.filter((p: Pet) => p.status === "Active").map((p: Pet) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.ownerName})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="flex flex-col gap-2"><Label>Time</Label><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
            <div className="flex flex-col gap-2"><Label>Type</Label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as Appointment["type"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{typeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex flex-col gap-2"><Label>Vet</Label><Select value={form.veterinarian} onValueChange={(v) => setForm({ ...form, veterinarian: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{vets.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex flex-col gap-2 sm:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!form.petId || !form.date || !form.time} className="bg-primary text-primary-foreground hover:bg-primary/90">Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Update Status</DialogTitle></DialogHeader>
          {selectedApt && (
            <div className="py-4">
              <p className="text-sm text-muted-foreground mb-4">Update status for <span className="font-medium text-foreground">{selectedApt.petName}</span> on {selectedApt.date}.</p>
              <div className="flex flex-col gap-2">
                {statusOptions.map(status => (
                  <Button key={status} variant={selectedApt.status === status ? "default" : "outline"} onClick={() => handleStatusChange(status)} className={selectedApt.status === status ? "bg-primary text-primary-foreground" : ""}>{status}</Button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
