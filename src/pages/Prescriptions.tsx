import { useState, useRef } from "react"
import {
  getPrescriptions,
  addPrescription,
  getPets,
  getVisits,
  createPrescriptionFromVisit,
  getNextPrescriptionId,
  getTodayISO,
} from "@/lib/store"
import type { Prescription, PrescriptionMedicine, Pet, Visit } from "@/lib/store"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Plus, Search, Pill, Eye, Printer, Trash2, AlertCircle } from "lucide-react"

const vets = ["Dr. Williams", "Dr. Martinez"]

export default function PrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState(getPrescriptions())
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [selectedRx, setSelectedRx] = useState<Prescription | null>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const pets = getPets()
  const visits = getVisits()

  const emptyMed: PrescriptionMedicine = { name: "", dosage: "", frequency: "", duration: "", instructions: "" }
  const [form, setForm] = useState({
    visitId: "none",
    petId: "",
    veterinarian: vets[0],
    diagnosis: "",
    notes: "",
    medicines: [{ ...emptyMed }] as PrescriptionMedicine[],
  })

  const filtered = prescriptions.filter((rx) => {
    const q = search.toLowerCase()
    return rx.petName.toLowerCase().includes(q) || rx.ownerName.toLowerCase().includes(q) || rx.diagnosis.toLowerCase().includes(q) || rx.id.toLowerCase().includes(q)
  })
  const visitsNeedingRx = visits.filter(
    (visit) => visit.status === "Done" && visit.medications.length > 0 && !prescriptions.some((rx) => rx.visitId === visit.id),
  )

  function addMedicine() { setForm({ ...form, medicines: [...form.medicines, { ...emptyMed }] }) }
  function removeMedicine(i: number) { setForm({ ...form, medicines: form.medicines.filter((_, idx) => idx !== i) }) }
  function updateMedicine(i: number, field: keyof PrescriptionMedicine, value: string) {
    const medicines = [...form.medicines]; medicines[i] = { ...medicines[i], [field]: value }; setForm({ ...form, medicines })
  }

  function handleCreate() {
    const pet = pets.find((p: Pet) => p.id === form.petId)
    if (!pet) return
    const newRx: Prescription = {
      id: getNextPrescriptionId(),
      visitId: form.visitId !== "none" ? form.visitId : undefined,
      petId: form.petId, petName: pet.name, ownerName: pet.ownerName,
      date: getTodayISO(),
      veterinarian: form.veterinarian, diagnosis: form.diagnosis, medicines: form.medicines, notes: form.notes,
    }
    addPrescription(newRx)
    setPrescriptions(getPrescriptions())
    setCreateOpen(false)
    setForm({ visitId: "none", petId: "", veterinarian: vets[0], diagnosis: "", notes: "", medicines: [{ ...emptyMed }] })
  }

  function handleGenerateFromVisit(visitId: string) {
    createPrescriptionFromVisit(visitId)
    setPrescriptions(getPrescriptions())
  }

  function hydrateFormFromVisit(visitId: string) {
    if (visitId === "none") {
      setForm({ ...form, visitId: "none" })
      return
    }
    const visit = visits.find((v) => v.id === visitId)
    if (!visit) return
    setForm({
      ...form,
      visitId,
      petId: visit.petId,
      veterinarian: visit.assignedVet,
      diagnosis: visit.finalDiagnosis || visit.differentialDiagnosis || visit.chiefComplaint,
      notes: visit.advice,
      medicines: visit.medications.length
        ? visit.medications.map((med) => ({
            name: med.name,
            dosage: med.dosage,
            frequency: med.frequency,
            duration: med.duration,
            instructions: med.instructions,
          }))
        : [{ ...emptyMed }],
    })
  }

  function handlePrint() {
    const content = printRef.current
    if (!content) return
    const w = window.open("", "_blank")
    if (!w) return
    w.document.write(`<html><head><title>Prescription ${selectedRx?.id}</title><style>
      body { font-family: system-ui, sans-serif; padding: 40px; color: #1a1a2e; max-width: 700px; margin: 0 auto; }
      .med-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    </style></head><body>${content.innerHTML}</body></html>`)
    w.document.close(); w.print()
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground text-balance">Prescriptions</h1>
          <p className="text-sm text-muted-foreground mt-1">Create prescriptions and print medicine labels.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" /> New Prescription
        </Button>
      </div>

      <Card>
        {visitsNeedingRx.length > 0 && (
          <div className="mx-4 mt-4 bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="w-full">
              <p className="text-sm font-medium text-foreground mb-2">{visitsNeedingRx.length} completed visit(s) are ready for prescription.</p>
              <div className="flex flex-wrap gap-2">
                {visitsNeedingRx.map((visit) => (
                  <Button
                    key={visit.id}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => handleGenerateFromVisit(visit.id)}
                  >
                    Generate {visit.id}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
        <CardHeader className="pb-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search by pet, owner, diagnosis, or ID..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>ID</TableHead><TableHead>Pet</TableHead><TableHead className="hidden sm:table-cell">Owner</TableHead>
                <TableHead>Date</TableHead><TableHead className="hidden md:table-cell">Diagnosis</TableHead>
                <TableHead className="hidden lg:table-cell">Medicines</TableHead><TableHead className="hidden lg:table-cell">Vet</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8"><div className="flex flex-col items-center gap-2 text-muted-foreground"><Pill className="w-8 h-8" /><p>No prescriptions found</p></div></TableCell></TableRow>
              ) : (
                filtered.map(rx => (
                  <TableRow key={rx.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{rx.id}</TableCell>
                    <TableCell className="font-medium text-foreground">{rx.petName}</TableCell>
                    <TableCell className="hidden sm:table-cell">{rx.ownerName}</TableCell>
                    <TableCell>{rx.date}</TableCell>
                    <TableCell className="hidden md:table-cell max-w-48 truncate text-muted-foreground">{rx.diagnosis}</TableCell>
                    <TableCell className="hidden lg:table-cell">{rx.medicines.length}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{rx.veterinarian}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => { setSelectedRx(rx); setViewOpen(true) }} className="text-primary hover:text-primary"><Eye className="w-4 h-4" /></Button></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Prescription</DialogTitle></DialogHeader>
          <div className="py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label>Source Visit (optional)</Label>
                <Select value={form.visitId} onValueChange={hydrateFormFromVisit}>
                  <SelectTrigger><SelectValue placeholder="Select completed visit" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked visit</SelectItem>
                    {visits.filter((visit: Visit) => visit.status === "Done").map((visit: Visit) => (
                      <SelectItem key={visit.id} value={visit.id}>
                        {visit.id} - {visit.petName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2"><Label>Patient</Label><Select value={form.petId} onValueChange={(v) => setForm({ ...form, petId: v })}><SelectTrigger><SelectValue placeholder="Select a patient" /></SelectTrigger><SelectContent>{pets.filter((p: Pet) => p.status === "Active").map((p: Pet) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.ownerName})</SelectItem>)}</SelectContent></Select></div>
              <div className="flex flex-col gap-2"><Label>Vet</Label><Select value={form.veterinarian} onValueChange={(v) => setForm({ ...form, veterinarian: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{vets.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
              <div className="flex flex-col gap-2 sm:col-span-2"><Label>Diagnosis</Label><Input value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="Enter diagnosis" /></div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between"><Label className="text-base font-semibold">Medicines</Label><Button variant="outline" size="sm" onClick={addMedicine}><Plus className="w-3 h-3 mr-1" /> Add</Button></div>
              {form.medicines.map((med, i) => (
                <div key={i} className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">Medicine {i + 1}</span>
                    {form.medicines.length > 1 && <Button variant="ghost" size="sm" onClick={() => removeMedicine(i)} className="text-destructive h-7 px-2"><Trash2 className="w-3.5 h-3.5" /></Button>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1"><Label className="text-xs">Name</Label><Input value={med.name} onChange={(e) => updateMedicine(i, "name", e.target.value)} placeholder="e.g. Amoxicillin" /></div>
                    <div className="flex flex-col gap-1"><Label className="text-xs">Dosage</Label><Input value={med.dosage} onChange={(e) => updateMedicine(i, "dosage", e.target.value)} placeholder="e.g. 500mg" /></div>
                    <div className="flex flex-col gap-1"><Label className="text-xs">Frequency</Label><Input value={med.frequency} onChange={(e) => updateMedicine(i, "frequency", e.target.value)} placeholder="e.g. Twice daily" /></div>
                    <div className="flex flex-col gap-1"><Label className="text-xs">Duration</Label><Input value={med.duration} onChange={(e) => updateMedicine(i, "duration", e.target.value)} placeholder="e.g. 7 days" /></div>
                    <div className="flex flex-col gap-1 sm:col-span-2"><Label className="text-xs">Instructions</Label><Textarea value={med.instructions} onChange={(e) => updateMedicine(i, "instructions", e.target.value)} rows={2} /></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 mt-4"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Additional instructions..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.petId || !form.diagnosis || form.medicines.some(m => !m.name || !m.dosage)} className="bg-primary text-primary-foreground hover:bg-primary/90">Create Prescription</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Prescription {selectedRx?.id}</DialogTitle></DialogHeader>
          {selectedRx && (
            <>
              <div ref={printRef}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, borderBottom: "3px solid #0d9488", paddingBottom: 16 }}>
                  <div><div style={{ fontSize: 24, fontWeight: 700, color: "#0d9488" }}>VetCare Clinic</div><div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>123 Animal Care Blvd</div></div>
                  <div style={{ fontSize: 36, color: "#0d9488", fontWeight: 700, fontFamily: "serif" }}>Rx</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", background: "#f0fdfa", padding: 16, borderRadius: 8, marginBottom: 24 }}>
                  <div style={{ fontSize: 13 }}><strong style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#999", marginBottom: 4 }}>Patient</strong>{selectedRx.petName}</div>
                  <div style={{ fontSize: 13 }}><strong style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#999", marginBottom: 4 }}>Owner</strong>{selectedRx.ownerName}</div>
                  <div style={{ fontSize: 13 }}><strong style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#999", marginBottom: 4 }}>Date</strong>{selectedRx.date}</div>
                  <div style={{ fontSize: 13 }}><strong style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#999", marginBottom: 4 }}>Vet</strong>{selectedRx.veterinarian}</div>
                </div>
                <div style={{ background: "#fff7ed", borderLeft: "4px solid #f59e0b", padding: "12px 16px", borderRadius: "0 8px 8px 0", marginBottom: 24 }}>
                  <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#999", margin: "0 0 6px 0" }}>Diagnosis</h3>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{selectedRx.diagnosis}</p>
                </div>
                {selectedRx.medicines.map((med, i) => (
                  <div key={i} className="med-card" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 600, color: "#0d9488" }}>{med.name}</span>
                      <span style={{ background: "#e0f2f1", color: "#0d9488", padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{med.dosage}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, marginBottom: 8 }}>
                      <div><span style={{ color: "#666" }}>Frequency: </span><strong style={{ color: "#333" }}>{med.frequency}</strong></div>
                      <div><span style={{ color: "#666" }}>Duration: </span><strong style={{ color: "#333" }}>{med.duration}</strong></div>
                    </div>
                    {med.instructions && <div style={{ background: "#f9fafb", padding: "8px 12px", borderRadius: 6, fontSize: 12, color: "#555" }}>{med.instructions}</div>}
                  </div>
                ))}
                {selectedRx.notes && (
                  <div style={{ background: "#fef9c3", borderRadius: 8, padding: "12px 16px", marginTop: 24 }}>
                    <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#999", margin: "0 0 6px 0" }}>Notes</h3>
                    <p style={{ margin: 0, fontSize: 13 }}>{selectedRx.notes}</p>
                  </div>
                )}
              </div>
              <DialogFooter><Button onClick={handlePrint} className="bg-primary text-primary-foreground hover:bg-primary/90"><Printer className="w-4 h-4 mr-2" /> Print</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
