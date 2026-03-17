import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { getVisits, addVisit, duplicateVisit, getPets, getNextVisitId, getTodayISO } from "@/lib/store"
import type { Visit, Pet } from "@/lib/store"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Plus, Search, ClipboardPlus, Eye, Copy } from "lucide-react"

const statusColors: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground border-border",
  Waiting: "bg-warning/10 text-warning border-warning/20",
  "In Examination": "bg-primary/10 text-primary border-primary/20",
  Done: "bg-success/10 text-success border-success/20",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
}

const billingColors: Record<string, string> = {
  "Not Sent": "bg-muted text-muted-foreground border-border",
  "Sent to Billing": "bg-warning/10 text-warning border-warning/20",
  Billed: "bg-success/10 text-success border-success/20",
}

const vets = ["Dr. Williams", "Dr. Martinez"]

export default function VisitsPage() {
  const [visits, setVisits] = useState(getVisits())
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterBilling, setFilterBilling] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const navigate = useNavigate()
  const pets = getPets()

  const [form, setForm] = useState({
    petId: "",
    type: "OPD" as Visit["type"],
    purpose: "Full" as Visit["purpose"],
    assignedVet: vets[0],
  })

  const filtered = visits.filter((v) => {
    const q = search.toLowerCase()
    const matchesSearch = v.petName.toLowerCase().includes(q) || v.ownerName.toLowerCase().includes(q) || v.assignedVet.toLowerCase().includes(q) || v.id.toLowerCase().includes(q)
    const matchesStatus = filterStatus === "all" || v.status === filterStatus
    const matchesBilling = filterBilling === "all" || v.billingStatus === filterBilling
    return matchesSearch && matchesStatus && matchesBilling
  })

  function handleCreate() {
    const pet = pets.find((p: Pet) => p.id === form.petId)
    if (!pet) return
    const newVisit: Visit = {
      id: getNextVisitId(), petId: form.petId, petName: pet.name, ownerName: pet.ownerName,
      type: form.type, purpose: form.purpose, status: "Draft", assignedVet: form.assignedVet,
      steps: { basicInfo: false, treatmentPlan: false, lab: false, dispenseMedication: false, appointment: false, endTreatment: false },
      chiefComplaint: "", vitals: { temperature: "", heartRate: "", respiratoryRate: "", weight: "" },
      examination: "", differentialDiagnosis: "", finalDiagnosis: "", treatment: "", advice: "", followUpDate: "",
      medications: [], hasMedicationEnvelope: false, images: [], historyNotes: "",
      billingStatus: "Not Sent",
      createdAt: getTodayISO(),
      updatedAt: getTodayISO(),
    }
    addVisit(newVisit)
    setVisits(getVisits())
    setDialogOpen(false)
    navigate(`/visits/${newVisit.id}`)
  }

  function handleDuplicate(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const newVisit = duplicateVisit(id)
    if (newVisit) {
      setVisits(getVisits())
      navigate(`/visits/${newVisit.id}`)
    }
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground text-balance">Visits</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage patient visits and case workflows.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" /> New Visit
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by pet, owner, vet, or ID..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["Draft", "Waiting", "In Examination", "Done", "Cancelled"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterBilling} onValueChange={setFilterBilling}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All billing" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All billing</SelectItem>
                {["Not Sent", "Sent to Billing", "Billed"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>ID</TableHead>
                <TableHead>Pet</TableHead>
                <TableHead className="hidden sm:table-cell">Owner</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden md:table-cell">Purpose</TableHead>
                <TableHead className="hidden lg:table-cell">Vet</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Billing</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <ClipboardPlus className="w-8 h-8" /><p>No visits found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((visit) => (
                  <TableRow key={visit.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate(`/visits/${visit.id}`)}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{visit.id}</TableCell>
                    <TableCell className="font-medium text-foreground">{visit.petName}</TableCell>
                    <TableCell className="hidden sm:table-cell">{visit.ownerName}</TableCell>
                    <TableCell><Badge variant="outline">{visit.type}</Badge></TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{visit.purpose}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{visit.assignedVet}</TableCell>
                    <TableCell><Badge variant="outline" className={statusColors[visit.status]}>{visit.status}</Badge></TableCell>
                    <TableCell className="hidden md:table-cell"><Badge variant="outline" className={billingColors[visit.billingStatus]}>{visit.billingStatus}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); navigate(`/visits/${visit.id}`) }}><Eye className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={(e) => handleDuplicate(visit.id, e)}><Copy className="w-4 h-4" /></Button>
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
          <DialogHeader><DialogTitle>New Visit</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label>Patient</Label>
              <Select value={form.petId} onValueChange={(v) => setForm({ ...form, petId: v })}>
                <SelectTrigger><SelectValue placeholder="Select a patient" /></SelectTrigger>
                <SelectContent>{pets.filter((p: Pet) => p.status === "Active").map((p: Pet) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.ownerName})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as Visit["type"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="OPD">OPD</SelectItem><SelectItem value="IPD">IPD</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Purpose</Label>
              <Select value={form.purpose} onValueChange={(v) => setForm({ ...form, purpose: v as Visit["purpose"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Full">Full</SelectItem>
                  <SelectItem value="History Only">History Only</SelectItem>
                  <SelectItem value="Pharmacy Only">Pharmacy Only</SelectItem>
                  <SelectItem value="Appointment Only">Appointment Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label>Assigned Vet</Label>
              <Select value={form.assignedVet} onValueChange={(v) => setForm({ ...form, assignedVet: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{vets.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.petId} className="bg-primary text-primary-foreground hover:bg-primary/90">Create Visit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
