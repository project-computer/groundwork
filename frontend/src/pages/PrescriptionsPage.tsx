import { useState, useRef } from "react"
import { Box, Button, Dialog, FormControl, Heading, Text, TextInput, Textarea, Select } from "@primer/react"
import { usePrescriptions, useCreatePrescription } from "@/features/prescriptions/api"
import { usePatients } from "@/features/patients/api"
import { useVisits } from "@/features/visits/api"
import { DataTable, type Column } from "@primer/react/experimental"

type Medicine = { name: string; dosage: string; frequency: string; duration: string; instructions: string }

type RxRow = {
  id: string
  rxId: string
  pet: string
  owner: string
  date: string
  diagnosis: string
  medicines: string
  vet: string
}

const rxColumns: Column<RxRow>[] = [
  { header: "ID", field: "rxId", rowHeader: true },
  { header: "Pet", field: "pet" },
  { header: "Owner", field: "owner" },
  { header: "Date", field: "date" },
  { header: "Diagnosis", field: "diagnosis" },
  { header: "Medicines", field: "medicines" },
  { header: "Vet", field: "vet" },
]

const vets = ["Dr. Williams", "Dr. Martinez"]

export default function PrescriptionsPage() {
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [selectedRx, setSelectedRx] = useState<Record<string, unknown> | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  const { data: rxData } = usePrescriptions({ limit: 100 })
  const { data: petsData } = usePatients({ limit: 200 })
  const { data: visitsData } = useVisits({ limit: 200 })
  const createMutation = useCreatePrescription()

  const prescriptions = rxData?.data ?? []
  const pets = petsData?.data ?? []
  const visits = visitsData?.data ?? []

  const emptyMed: Medicine = { name: "", dosage: "", frequency: "", duration: "", instructions: "" }
  const [form, setForm] = useState({
    visitId: "none",
    petId: "",
    veterinarianName: vets[0],
    diagnosis: "",
    notes: "",
    medicines: [{ ...emptyMed }] as Medicine[],
  })

  const filtered = prescriptions.filter((rx: Record<string, string>) => {
    const q = search.toLowerCase()
    return (rx.petName || "").toLowerCase().includes(q) || (rx.ownerName || "").toLowerCase().includes(q) || (rx.diagnosis || "").toLowerCase().includes(q) || (rx.customId || "").toLowerCase().includes(q)
  })

  const doneVisits = visits.filter((v: Record<string, string>) => v.status === "Done")

  function addMedicine() { setForm({ ...form, medicines: [...form.medicines, { ...emptyMed }] }) }
  function removeMedicine(i: number) { setForm({ ...form, medicines: form.medicines.filter((_, idx) => idx !== i) }) }
  function updateMedicine(i: number, field: keyof Medicine, value: string) {
    const medicines = [...form.medicines]; medicines[i] = { ...medicines[i], [field]: value }; setForm({ ...form, medicines })
  }

  function handleCreate() {
    const pet = pets.find((p: Record<string, unknown>) => String(p.id) === form.petId)
    if (!pet) return
    createMutation.mutate({
      visitId: form.visitId !== "none" ? Number(form.visitId) : undefined,
      petId: Number(form.petId),
      petName: pet.name as string,
      ownerName: pet.ownerName as string,
      date: new Date().toISOString().slice(0, 10),
      veterinarianName: form.veterinarianName,
      diagnosis: form.diagnosis,
      medicines: form.medicines,
      notes: form.notes,
    }, {
      onSuccess: () => {
        setCreateOpen(false)
        setForm({ visitId: "none", petId: "", veterinarianName: vets[0], diagnosis: "", notes: "", medicines: [{ ...emptyMed }] })
      },
    })
  }

  function hydrateFormFromVisit(visitId: string) {
    if (visitId === "none") { setForm({ ...form, visitId: "none" }); return }
    const visit = visits.find((v: Record<string, unknown>) => String(v.id) === visitId) as Record<string, unknown> | undefined
    if (!visit) return
    const meds = Array.isArray(visit.medications) && visit.medications.length > 0
      ? visit.medications.map((med: Record<string, string>) => ({
          name: med.name || "", dosage: med.dosage || "", frequency: med.frequency || "",
          duration: med.duration || "", instructions: med.instructions || "",
        }))
      : [{ ...emptyMed }]
    setForm({
      ...form,
      visitId,
      petId: String(visit.petId),
      veterinarianName: (visit.assignedVetName as string) || vets[0],
      diagnosis: (visit.finalDiagnosis as string) || (visit.differentialDiagnosis as string) || (visit.chiefComplaint as string) || "",
      notes: (visit.advice as string) || "",
      medicines: meds,
    })
  }

  function handlePrint() {
    const content = printRef.current
    if (!content) return
    const w = window.open("", "_blank")
    if (!w) return
    w.document.write(`<html><head><title>Prescription ${selectedRx?.customId}</title><style>
      body { font-family: system-ui, sans-serif; padding: 40px; color: #1a1a2e; max-width: 700px; margin: 0 auto; }
      .med-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    </style></head><body>${content.innerHTML}</body></html>`)
    w.document.close(); w.print()
  }

  const tableData: RxRow[] = filtered.map((rx: Record<string, unknown>) => {
    const meds = Array.isArray(rx.medicines) ? rx.medicines : []
    return {
      id: String(rx.id),
      rxId: (rx.customId as string) || "",
      pet: (rx.petName as string) || "",
      owner: (rx.ownerName as string) || "",
      date: typeof rx.date === "string" ? rx.date.slice(0, 10) : "",
      diagnosis: (rx.diagnosis as string) || "",
      medicines: String(meds.length),
      vet: (rx.veterinarianName as string) || "",
    }
  })

  return (
    <Box sx={{ p: [3, 4] }}>
      <Box sx={{ display: "flex", flexDirection: ["column", "row"], alignItems: ["stretch", "center"], justifyContent: "space-between", gap: 3, mb: 4 }}>
        <Box>
          <Heading as="h2" sx={{ fontSize: 4 }}>Prescriptions</Heading>
          <Text sx={{ fontSize: 1, color: "fg.muted" }}>Create prescriptions and print medicine labels.</Text>
        </Box>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>New Prescription</Button>
      </Box>

      <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2, bg: "canvas.default" }}>
        <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "border.default" }}>
          <FormControl>
            <FormControl.Label visuallyHidden>Search prescriptions</FormControl.Label>
            <TextInput placeholder="Search by pet, owner, diagnosis, or ID..." value={search} onChange={(e) => setSearch(e.target.value)} block />
          </FormControl>
        </Box>
        <Box sx={{ p: 3 }}>
          {filtered.length === 0 ? (
            <Text sx={{ color: "fg.muted" }}>No prescriptions found</Text>
          ) : (
            <>
              <DataTable
                aria-labelledby="rx-heading"
                data={tableData}
                columns={rxColumns}
              />
              <span id="rx-heading" style={{ display: "none" }}>Prescriptions</span>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 2 }}>
                {filtered.map((rx: Record<string, unknown>) => (
                  <Button key={String(rx.id)} size="small" variant="invisible" onClick={() => { setSelectedRx(rx); setViewOpen(true) }}>
                    View {rx.customId as string}
                  </Button>
                ))}
              </Box>
            </>
          )}
        </Box>
      </Box>

      {createOpen && (
        <Dialog onClose={() => setCreateOpen(false)} aria-labelledby="create-rx-title" sx={{ width: "large" }}>
          <Dialog.Header id="create-rx-title">New Prescription</Dialog.Header>
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: ["1fr", "1fr 1fr"], gap: 3, mb: 3 }}>
              <FormControl sx={{ gridColumn: ["auto", "1 / -1"] }}>
                <FormControl.Label>Source Visit (optional)</FormControl.Label>
                <Select value={form.visitId} onChange={(e) => hydrateFormFromVisit(e.target.value)} aria-label="Source Visit">
                  <Select.Option value="none">No linked visit</Select.Option>
                  {doneVisits.map((v: Record<string, unknown>) => (
                    <Select.Option key={String(v.id)} value={String(v.id)}>{v.customId as string} - {v.petName as string}</Select.Option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormControl.Label>Patient</FormControl.Label>
                <Select value={form.petId} onChange={(e) => setForm({ ...form, petId: e.target.value })} aria-label="Patient">
                  <Select.Option value="">Select a patient</Select.Option>
                  {pets.filter((p: Record<string, unknown>) => p.status === "Active").map((p: Record<string, unknown>) => (
                    <Select.Option key={String(p.id)} value={String(p.id)}>{p.name as string} ({p.ownerName as string})</Select.Option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormControl.Label>Vet</FormControl.Label>
                <Select value={form.veterinarianName} onChange={(e) => setForm({ ...form, veterinarianName: e.target.value })} aria-label="Vet">
                  {vets.map(v => <Select.Option key={v} value={v}>{v}</Select.Option>)}
                </Select>
              </FormControl>
              <FormControl sx={{ gridColumn: ["auto", "1 / -1"] }}>
                <FormControl.Label>Diagnosis</FormControl.Label>
                <TextInput value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="Enter diagnosis" block />
              </FormControl>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
              <Text sx={{ fontSize: 2, fontWeight: 600 }}>Medicines</Text>
              <Button size="small" onClick={addMedicine}>Add</Button>
            </Box>
            {form.medicines.map((med, i) => (
              <Box key={i} sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2, p: 3, mb: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                  <Text sx={{ fontSize: 1, fontWeight: 600 }}>Medicine {i + 1}</Text>
                  {form.medicines.length > 1 && <Button size="small" variant="danger" onClick={() => removeMedicine(i)}>Remove</Button>}
                </Box>
                <Box sx={{ display: "grid", gridTemplateColumns: ["1fr", "1fr 1fr"], gap: 2 }}>
                  <FormControl><FormControl.Label>Name</FormControl.Label><TextInput value={med.name} onChange={(e) => updateMedicine(i, "name", e.target.value)} placeholder="e.g. Amoxicillin" block /></FormControl>
                  <FormControl><FormControl.Label>Dosage</FormControl.Label><TextInput value={med.dosage} onChange={(e) => updateMedicine(i, "dosage", e.target.value)} placeholder="e.g. 500mg" block /></FormControl>
                  <FormControl><FormControl.Label>Frequency</FormControl.Label><TextInput value={med.frequency} onChange={(e) => updateMedicine(i, "frequency", e.target.value)} placeholder="e.g. Twice daily" block /></FormControl>
                  <FormControl><FormControl.Label>Duration</FormControl.Label><TextInput value={med.duration} onChange={(e) => updateMedicine(i, "duration", e.target.value)} placeholder="e.g. 7 days" block /></FormControl>
                  <FormControl sx={{ gridColumn: ["auto", "1 / -1"] }}>
                    <FormControl.Label>Instructions</FormControl.Label>
                    <Textarea value={med.instructions} onChange={(e) => updateMedicine(i, "instructions", e.target.value)} rows={2} />
                  </FormControl>
                </Box>
              </Box>
            ))}
            <FormControl sx={{ mt: 3 }}>
              <FormControl.Label>Notes</FormControl.Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Additional instructions..." />
            </FormControl>
          </Box>
          <Box sx={{ p: 3, display: "flex", gap: 2, justifyContent: "flex-end", borderTop: "1px solid", borderColor: "border.default" }}>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={!form.petId || !form.diagnosis || form.medicines.some(m => !m.name || !m.dosage) || createMutation.isPending}>Create Prescription</Button>
          </Box>
        </Dialog>
      )}

      {viewOpen && selectedRx && (() => {
        const medicines = Array.isArray(selectedRx.medicines) ? selectedRx.medicines : []
        return (
          <Dialog onClose={() => setViewOpen(false)} aria-labelledby="view-rx-title" sx={{ width: "large" }}>
            <Dialog.Header id="view-rx-title">Prescription {selectedRx.customId as string}</Dialog.Header>
            <Box sx={{ p: 3 }}>
              <div ref={printRef}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, borderBottom: "3px solid #0d9488", paddingBottom: 16 }}>
                  <div><div style={{ fontSize: 24, fontWeight: 700, color: "#0d9488" }}>VetCare Clinic</div><div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>123 Animal Care Blvd</div></div>
                  <div style={{ fontSize: 36, color: "#0d9488", fontWeight: 700, fontFamily: "serif" }}>Rx</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", background: "#f0fdfa", padding: 16, borderRadius: 8, marginBottom: 24 }}>
                  <div style={{ fontSize: 13 }}><strong style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#999", marginBottom: 4 }}>Patient</strong>{selectedRx.petName as string}</div>
                  <div style={{ fontSize: 13 }}><strong style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#999", marginBottom: 4 }}>Owner</strong>{selectedRx.ownerName as string}</div>
                  <div style={{ fontSize: 13 }}><strong style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#999", marginBottom: 4 }}>Date</strong>{typeof selectedRx.date === "string" ? selectedRx.date.slice(0, 10) : ""}</div>
                  <div style={{ fontSize: 13 }}><strong style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#999", marginBottom: 4 }}>Vet</strong>{selectedRx.veterinarianName as string}</div>
                </div>
                <div style={{ background: "#fff7ed", borderLeft: "4px solid #f59e0b", padding: "12px 16px", borderRadius: "0 8px 8px 0", marginBottom: 24 }}>
                  <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#999", margin: "0 0 6px 0" }}>Diagnosis</h3>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{selectedRx.diagnosis as string}</p>
                </div>
                {medicines.map((med: Record<string, unknown>, i: number) => (
                  <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 600, color: "#0d9488" }}>{med.name as string}</span>
                      <span style={{ background: "#e0f2f1", color: "#0d9488", padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{med.dosage as string}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, marginBottom: 8 }}>
                      <div><span style={{ color: "#666" }}>Frequency: </span><strong style={{ color: "#333" }}>{med.frequency as string}</strong></div>
                      <div><span style={{ color: "#666" }}>Duration: </span><strong style={{ color: "#333" }}>{med.duration as string}</strong></div>
                    </div>
                    {med.instructions ? <div style={{ background: "#f9fafb", padding: "8px 12px", borderRadius: 6, fontSize: 12, color: "#555" }}>{med.instructions as string}</div> : null}
                  </div>
                ))}
                {selectedRx.notes ? (
                  <div style={{ background: "#fef9c3", borderRadius: 8, padding: "12px 16px", marginTop: 24 }}>
                    <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#999", margin: "0 0 6px 0" }}>Notes</h3>
                    <p style={{ margin: 0, fontSize: 13 }}>{selectedRx.notes as string}</p>
                  </div>
                ) : null}
              </div>
            </Box>
            <Box sx={{ p: 3, display: "flex", gap: 2, justifyContent: "flex-end", borderTop: "1px solid", borderColor: "border.default" }}><Button variant="primary" onClick={handlePrint}>Print</Button></Box>
          </Dialog>
        )
      })()}
    </Box>
  )
}
