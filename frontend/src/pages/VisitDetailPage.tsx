import { useState, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useVisit, useUpdateVisit, useCompleteVisit, useDuplicateVisit } from "@/features/visits/api"
import { useCreatePrescription, usePrescriptions } from "@/features/prescriptions/api"
import { useCreateBill, useBills } from "@/features/billing/api"
import { usePatients } from "@/features/patients/api"
import { Box, Button, Label, TextInput, Textarea, FormControl, Checkbox, Heading, Text, IconButton } from "@primer/react"
import {
  ArrowLeft, Copy, Check, Circle, Trash2, Plus, Upload, X, Send,
  Thermometer, Heart, Wind, Weight, ChevronLeft, ChevronRight,
} from "lucide-react"

type StepKey = "basicInfo" | "treatmentPlan" | "lab" | "dispenseMedication" | "appointment" | "endTreatment"
type Med = { name: string; dosage: string; frequency: string; duration: string; instructions: string; envelopeLabel: boolean }

const stepDefs: { key: StepKey; label: string }[] = [
  { key: "basicInfo", label: "Basic Info" },
  { key: "treatmentPlan", label: "Treatment Plan" },
  { key: "lab", label: "Lab" },
  { key: "dispenseMedication", label: "Dispense Medication" },
  { key: "appointment", label: "Appointment" },
  { key: "endTreatment", label: "End Treatment" },
]

function getActiveSteps(purpose: string) {
  switch (purpose) {
    case "History Only": return new Set<StepKey>(["basicInfo", "endTreatment"])
    case "Pharmacy Only": return new Set<StepKey>(["dispenseMedication", "endTreatment"])
    case "Appointment Only": return new Set<StepKey>(["appointment", "endTreatment"])
    default: return new Set<StepKey>(stepDefs.map(s => s.key))
  }
}

type Visit = Record<string, unknown> & {
  id: number; petId: number; petName: string; ownerName: string; customId: string;
  status: string; purpose: string; type: string; assignedVetName?: string;
  steps?: Record<string, boolean>; vitals?: Record<string, string>;
  medications?: Med[]; images?: { id: string; url: string; caption: string }[];
  chiefComplaint?: string; historyNotes?: string; examination?: string;
  differentialDiagnosis?: string; finalDiagnosis?: string; treatment?: string;
  advice?: string; followUpDate?: string; hasMedicationEnvelope?: boolean; billingStatus?: string;
}

export default function VisitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const visitId = Number(id)
  const { data: visitRaw, isLoading } = useVisit(visitId || undefined)
  const visit = visitRaw as Visit | undefined
  const updateMutation = useUpdateVisit()
  const completeMutation = useCompleteVisit()
  const duplicateMutation = useDuplicateVisit()
  const createRxMutation = useCreatePrescription()
  const createBillMutation = useCreateBill()
  const { data: rxData } = usePrescriptions()
  const { data: billsData } = useBills()
  const { data: petsData } = usePatients({ limit: 200 })
  const [activeStep, setActiveStep] = useState(0)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  const save = useCallback((updates: Record<string, unknown>) => {
    if (!visit) return
    updateMutation.mutate({ id: visit.id, data: updates })
  }, [visit, updateMutation])

  if (isLoading) return <Box sx={{ p: 4, textAlign: "center", color: "fg.muted" }}><Text>Loading...</Text></Box>
  if (!visit) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Text sx={{ color: "fg.muted" }}>Visit not found.</Text>
        <Box sx={{ mt: 3 }}><Button onClick={() => navigate("/visits")} leadingVisual={() => <ArrowLeft size={16} />}>Back to Visits</Button></Box>
      </Box>
    )
  }

  const steps = (visit.steps || {}) as Record<string, boolean>
  const vitals = (visit.vitals || {}) as Record<string, string>
  const medications: Med[] = visit.medications || []
  const images = visit.images || []
  const activeSteps = getActiveSteps(visit.purpose)
  const pet = ((petsData?.data ?? []) as Record<string, unknown>[]).find((p) => p.id === visit.petId) as Record<string, unknown> | undefined
  const prescriptions = (rxData?.data ?? []) as Record<string, unknown>[]
  const bills = (billsData?.data ?? []) as Record<string, unknown>[]
  const linkedRx = prescriptions.find((rx) => rx.visitId === visit.id)
  const linkedBill = bills.find((b) => b.visitId === visit.id)

  function handleDuplicate() {
    duplicateMutation.mutate(visit!.id, {
      onSuccess: (data: { id?: number; data?: { id?: number } }) => navigate(`/visits/${data?.id || data?.data?.id}`),
    })
  }

  function markStepDone(stepKey: StepKey) {
    save({ steps: { ...steps, [stepKey]: true } })
  }

  function handleSendToBilling() {
    save({ billingStatus: "Sent to Billing", steps: { ...steps, endTreatment: true } })
  }

  function handleMarkDone() {
    completeMutation.mutate(visit!.id)
  }

  function handleGenerateRx() {
    createRxMutation.mutate({
      visitId: visit!.id,
      petId: visit!.petId,
      petName: visit!.petName,
      ownerName: visit!.ownerName,
      date: new Date().toISOString().slice(0, 10),
      veterinarianName: visit!.assignedVetName || "",
      diagnosis: visit!.finalDiagnosis || visit!.differentialDiagnosis || visit!.chiefComplaint || "",
      medicines: medications.length > 0 ? medications.map(m => ({ name: m.name, dosage: m.dosage, frequency: m.frequency, duration: m.duration, instructions: m.instructions })) : [{ name: "Supportive Medication", dosage: "As directed", frequency: "Twice daily", duration: "5 days", instructions: "" }],
      notes: visit!.advice || "",
    })
  }

  function handleGenerateBill() {
    const items: { description: string; quantity: number; price: number }[] = []
    if (visit!.treatment) items.push({ description: "Clinical Treatment", quantity: 1, price: 120 })
    if (visit!.examination) items.push({ description: "Consultation & Examination", quantity: 1, price: 85 })
    medications.forEach(med => items.push({ description: `Medication: ${med.name}`, quantity: 1, price: 25 }))
    if (items.length === 0) items.push({ description: "General Consultation", quantity: 1, price: 80 })
    createBillMutation.mutate({
      visitId: visit!.id,
      petId: visit!.petId,
      petName: visit!.petName,
      ownerName: visit!.ownerName,
      date: new Date().toISOString().slice(0, 10),
      items,
    })
  }

  function addMedication() {
    const med: Med = { name: "", dosage: "", frequency: "", duration: "", instructions: "", envelopeLabel: false }
    save({ medications: [...medications, med] })
  }

  function updateMedication(idx: number, field: keyof Med, value: string | boolean) {
    const meds = [...medications]
    meds[idx] = { ...meds[idx], [field]: value }
    save({ medications: meds })
  }

  function removeMedication(idx: number) {
    save({ medications: medications.filter((_, i) => i !== idx) })
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    const newImages = Array.from(files).map(file => ({
      id: Math.random().toString(36).slice(2),
      url: URL.createObjectURL(file),
      thumbnail: URL.createObjectURL(file),
      caption: file.name,
      uploadedAt: new Date().toISOString(),
    }))
    save({ images: [...images, ...newImages] })
    e.target.value = ""
  }

  function removeImage(imgId: string) {
    save({ images: images.filter((img) => img.id !== imgId) })
  }

  const currentStepDef = stepDefs[activeStep]
  const statusVariant = visit.status === "Done" ? "success" : visit.status === "In Examination" ? "primary" : visit.status === "Waiting" ? "attention" : "default"

  return (
    <Box sx={{ p: [3, 4] }}>
      <Box sx={{ display: "flex", flexDirection: ["column", "row"], alignItems: ["stretch", "center"], gap: 3, mb: 4 }}>
        <IconButton icon={() => <ArrowLeft size={20} />} aria-label="Back to visits" onClick={() => navigate("/visits")} />
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <Heading as="h2" sx={{ fontSize: 3 }}>{visit.customId}</Heading>
            <Label variant={statusVariant as "success" | "primary" | "attention" | "default"}>{visit.status}</Label>
            <Label variant="default">{visit.purpose}</Label>
            <Label variant="default">{visit.type}</Label>
          </Box>
          <Text as="p" sx={{ fontSize: 1, color: "fg.muted", mt: 1 }}>
            {visit.petName} ({String(pet?.species ?? "")} - {String(pet?.breed ?? "")}) &middot; Owner: {visit.ownerName} &middot; Vet: {visit.assignedVetName || "-"}
          </Text>
        </Box>
        <Box sx={{ display: "flex", gap: 2 }}>
          <Button size="small" onClick={handleDuplicate} leadingVisual={() => <Copy size={14} />}>Duplicate</Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexDirection: ["column", "row"], gap: 3 }}>
        <Box sx={{ width: ["100%", "224px"], flexShrink: 0 }}>
          <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2, p: 2 }}>
            <Box sx={{ display: "flex", flexDirection: ["row", "column"], gap: 1, overflowX: "auto" }}>
              {stepDefs.map((step, idx) => {
                const isActive = activeSteps.has(step.key)
                const isDone = steps[step.key]
                const selected = idx === activeStep
                return (
                  <Button
                    key={step.key}
                    variant={selected ? "primary" : "invisible"}
                    size="small"
                    onClick={() => isActive && setActiveStep(idx)}
                    disabled={!isActive}
                    leadingVisual={() => (isDone ? <Check size={14} /> : <Circle size={14} />)}
                    sx={{ justifyContent: "flex-start", whiteSpace: "nowrap" }}
                  >
                    {step.label}
                  </Button>
                )
              })}
            </Box>
          </Box>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 3, borderBottom: "1px solid", borderColor: "border.default" }}>
              <Heading as="h2" sx={{ fontSize: 2 }}>{currentStepDef.label}</Heading>
              {activeSteps.has(currentStepDef.key) && !steps[currentStepDef.key] && (
                <Button size="small" onClick={() => markStepDone(currentStepDef.key)} leadingVisual={() => <Check size={12} />}>Mark Complete</Button>
              )}
            </Box>
            <Box sx={{ p: 3 }}>
              {activeStep === 0 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {pet && (
                    <Box sx={{ display: "grid", gridTemplateColumns: ["1fr 1fr", "repeat(4, 1fr)"], gap: 2, bg: "canvas.subtle", borderRadius: 2, p: 3 }}>
                      <Box><Text sx={{ fontSize: 0, color: "fg.muted" }}>Patient</Text><Text sx={{ fontSize: 1, fontWeight: "bold" }}>{String(pet.name)}</Text></Box>
                      <Box><Text sx={{ fontSize: 0, color: "fg.muted" }}>Species</Text><Text sx={{ fontSize: 1 }}>{String(pet.species)}</Text></Box>
                      <Box><Text sx={{ fontSize: 0, color: "fg.muted" }}>Breed</Text><Text sx={{ fontSize: 1 }}>{String(pet.breed ?? "") || "-"}</Text></Box>
                      <Box><Text sx={{ fontSize: 0, color: "fg.muted" }}>Weight</Text><Text sx={{ fontSize: 1 }}>{pet.weight ? `${String(pet.weight)} kg` : "-"}</Text></Box>
                    </Box>
                  )}
                  <FormControl>
                    <FormControl.Label>Chief Complaint</FormControl.Label>
                    <Textarea value={visit.chiefComplaint || ""} onChange={(e) => save({ chiefComplaint: e.target.value })} placeholder="Primary reason for visit..." rows={3} block />
                  </FormControl>
                  <Box>
                    <Text sx={{ fontSize: 1, fontWeight: "bold", mb: 2 }}>Vitals</Text>
                    <Box sx={{ display: "grid", gridTemplateColumns: ["1fr 1fr", "repeat(4, 1fr)"], gap: 2 }}>
                      <FormControl>
                        <FormControl.Label><Thermometer size={12} /> Temp</FormControl.Label>
                        <TextInput value={vitals.temperature || ""} onChange={(e) => save({ vitals: { ...vitals, temperature: e.target.value } })} placeholder="101.5 F" block aria-label="Temperature" />
                      </FormControl>
                      <FormControl>
                        <FormControl.Label><Heart size={12} /> HR</FormControl.Label>
                        <TextInput value={vitals.heartRate || ""} onChange={(e) => save({ vitals: { ...vitals, heartRate: e.target.value } })} placeholder="90 bpm" block aria-label="Heart rate" />
                      </FormControl>
                      <FormControl>
                        <FormControl.Label><Wind size={12} /> RR</FormControl.Label>
                        <TextInput value={vitals.respiratoryRate || ""} onChange={(e) => save({ vitals: { ...vitals, respiratoryRate: e.target.value } })} placeholder="22/min" block aria-label="Respiratory rate" />
                      </FormControl>
                      <FormControl>
                        <FormControl.Label><Weight size={12} /> Weight</FormControl.Label>
                        <TextInput value={vitals.weight || ""} onChange={(e) => save({ vitals: { ...vitals, weight: e.target.value } })} placeholder="32 kg" block aria-label="Weight" />
                      </FormControl>
                    </Box>
                  </Box>
                  <FormControl>
                    <FormControl.Label>History Notes</FormControl.Label>
                    <Textarea value={visit.historyNotes || ""} onChange={(e) => save({ historyNotes: e.target.value })} placeholder="Relevant patient history..." rows={3} block />
                  </FormControl>
                </Box>
              )}

              {activeStep === 1 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <FormControl><FormControl.Label>Examination Findings</FormControl.Label><Textarea value={visit.examination || ""} onChange={(e) => save({ examination: e.target.value })} placeholder="Physical examination findings..." rows={3} block /></FormControl>
                  <FormControl><FormControl.Label>Differential Diagnosis</FormControl.Label><Textarea value={visit.differentialDiagnosis || ""} onChange={(e) => save({ differentialDiagnosis: e.target.value })} placeholder="Possible diagnoses..." rows={3} block /></FormControl>
                  <FormControl><FormControl.Label>Final Diagnosis</FormControl.Label><Textarea value={visit.finalDiagnosis || ""} onChange={(e) => save({ finalDiagnosis: e.target.value })} placeholder="Confirmed diagnosis..." rows={2} block /></FormControl>
                  <FormControl><FormControl.Label>Treatment</FormControl.Label><Textarea value={visit.treatment || ""} onChange={(e) => save({ treatment: e.target.value })} placeholder="Treatment administered..." rows={3} block /></FormControl>
                  <FormControl><FormControl.Label>Advice</FormControl.Label><Textarea value={visit.advice || ""} onChange={(e) => save({ advice: e.target.value })} placeholder="Home care instructions..." rows={2} block /></FormControl>
                </Box>
              )}

              {activeStep === 2 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <FormControl><FormControl.Label>Lab Notes</FormControl.Label><Textarea value={visit.historyNotes || ""} onChange={(e) => save({ historyNotes: e.target.value })} placeholder="Lab results and notes..." rows={4} block /></FormControl>
                  <Box>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                      <FormControl.Label htmlFor="img-upload">Images</FormControl.Label>
                      <Button leadingVisual={() => <Upload size={12} />} onClick={() => document.getElementById("img-upload")?.click()}>Upload</Button>
                      <input id="img-upload" type="file" accept="image/*" multiple hidden onChange={handleImageUpload} />
                    </Box>
                    {images.length > 0 ? (
                      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 2 }}>
                        {images.map((img, idx) => (
                          <Box key={img.id} sx={{ position: "relative", aspectRatio: "1", borderRadius: 2, overflow: "hidden", border: "1px solid", borderColor: "border.default", cursor: "pointer" }} onClick={() => setLightboxIdx(idx)}>
                            <img src={img.url} alt={img.caption} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <Button variant="danger" size="small" onClick={(e: React.MouseEvent) => { e.stopPropagation(); removeImage(img.id) }} sx={{ position: "absolute", top: 1, right: 1 }} aria-label="Remove image"><X size={12} /></Button>
                          </Box>
                        ))}
                      </Box>
                    ) : (
                      <Text sx={{ fontSize: 1, color: "fg.muted" }}>No images uploaded yet.</Text>
                    )}
                  </Box>
                </Box>
              )}

              {activeStep === 3 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <FormControl>
                    <Checkbox checked={visit.hasMedicationEnvelope || false} onChange={(e) => save({ hasMedicationEnvelope: (e.target as HTMLInputElement).checked })} />
                    <FormControl.Label>Medication Envelope Required</FormControl.Label>
                  </FormControl>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Text sx={{ fontSize: 2, fontWeight: "bold" }}>Medications</Text>
                    <Button size="small" onClick={addMedication} leadingVisual={() => <Plus size={12} />}>Add</Button>
                  </Box>
                  {medications.length === 0 ? (
                    <Text sx={{ fontSize: 1, color: "fg.muted" }}>No medications added yet.</Text>
                  ) : (
                    medications.map((med, i) => (
                      <Box key={i} sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2, p: 3 }}>
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                          <Text sx={{ fontSize: 1, fontWeight: "bold" }}>Medicine {i + 1}</Text>
                          <Button variant="danger" size="small" onClick={() => removeMedication(i)} leadingVisual={() => <Trash2 size={12} />} aria-label="Remove medication" />
                        </Box>
                        <Box sx={{ display: "grid", gridTemplateColumns: ["1fr", "1fr 1fr"], gap: 2 }}>
                          <FormControl><FormControl.Label>Name</FormControl.Label><TextInput value={med.name} onChange={(e) => updateMedication(i, "name", e.target.value)} placeholder="e.g. Amoxicillin" block aria-label="Medicine name" /></FormControl>
                          <FormControl><FormControl.Label>Dosage</FormControl.Label><TextInput value={med.dosage} onChange={(e) => updateMedication(i, "dosage", e.target.value)} placeholder="e.g. 500mg" block aria-label="Dosage" /></FormControl>
                          <FormControl><FormControl.Label>Frequency</FormControl.Label><TextInput value={med.frequency} onChange={(e) => updateMedication(i, "frequency", e.target.value)} placeholder="e.g. Twice daily" block aria-label="Frequency" /></FormControl>
                          <FormControl><FormControl.Label>Duration</FormControl.Label><TextInput value={med.duration} onChange={(e) => updateMedication(i, "duration", e.target.value)} placeholder="e.g. 7 days" block aria-label="Duration" /></FormControl>
                          <Box sx={{ gridColumn: ["auto", "1 / -1"] }}>
                            <FormControl><FormControl.Label>Instructions</FormControl.Label><Textarea value={med.instructions} onChange={(e) => updateMedication(i, "instructions", e.target.value)} rows={2} block /></FormControl>
                          </Box>
                          <FormControl>
                            <Checkbox checked={med.envelopeLabel} onChange={(e) => updateMedication(i, "envelopeLabel", (e.target as HTMLInputElement).checked)} />
                            <FormControl.Label>Envelope Label</FormControl.Label>
                          </FormControl>
                        </Box>
                      </Box>
                    ))
                  )}
                </Box>
              )}

              {activeStep === 4 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <FormControl>
                    <FormControl.Label>Follow-up Date</FormControl.Label>
                    <TextInput type="date" value={visit.followUpDate ? String(visit.followUpDate).slice(0, 10) : ""} onChange={(e) => save({ followUpDate: e.target.value })} aria-label="Follow-up date" />
                  </FormControl>
                  <FormControl>
                    <FormControl.Label>Notes</FormControl.Label>
                    <Textarea value={visit.advice || ""} onChange={(e) => save({ advice: e.target.value })} placeholder="Follow-up instructions..." rows={3} block />
                  </FormControl>
                </Box>
              )}

              {activeStep === 5 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <Box sx={{ bg: "canvas.subtle", borderRadius: 2, p: 3 }}>
                    <Heading as="h2" sx={{ fontSize: 1, mb: 2 }}>Visit Summary</Heading>
                    <Box sx={{ display: "grid", gridTemplateColumns: ["1fr", "1fr 1fr"], gap: 2, fontSize: 1 }}>
                      {visit.chiefComplaint && <Box><Text sx={{ fontSize: 0, color: "fg.muted" }}>Chief Complaint</Text><Text>{visit.chiefComplaint}</Text></Box>}
                      {visit.finalDiagnosis && <Box><Text sx={{ fontSize: 0, color: "fg.muted" }}>Final Diagnosis</Text><Text>{visit.finalDiagnosis}</Text></Box>}
                      {visit.treatment && <Box><Text sx={{ fontSize: 0, color: "fg.muted" }}>Treatment</Text><Text>{visit.treatment}</Text></Box>}
                      {visit.followUpDate && <Box><Text sx={{ fontSize: 0, color: "fg.muted" }}>Follow-up</Text><Text>{String(visit.followUpDate).slice(0, 10)}</Text></Box>}
                      {medications.length > 0 && <Box><Text sx={{ fontSize: 0, color: "fg.muted" }}>Medications</Text><Text>{medications.map((m) => m.name).join(", ")}</Text></Box>}
                    </Box>
                  </Box>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                    {!linkedRx ? (
                      <Button onClick={handleGenerateRx} disabled={createRxMutation.isPending} leadingVisual={() => <Plus size={14} />}>Generate Prescription</Button>
                    ) : (
                      <Label variant="success">Prescription: {String(linkedRx.customId || linkedRx.id)}</Label>
                    )}
                    {!linkedBill ? (
                      <Button onClick={handleGenerateBill} disabled={createBillMutation.isPending} leadingVisual={() => <Plus size={14} />}>Generate Bill</Button>
                    ) : (
                      <Label variant="success">Bill: {String(linkedBill.customId || linkedBill.id)}</Label>
                    )}
                    {visit.billingStatus === "Not Sent" && (
                      <Button variant="primary" onClick={handleSendToBilling} leadingVisual={() => <Send size={14} />}>Send to Billing</Button>
                    )}
                    {visit.billingStatus === "Sent to Billing" && <Label variant="attention">Sent to Billing</Label>}
                    {visit.billingStatus === "Billed" && <Label variant="success">Billed</Label>}
                    {visit.status !== "Done" && (
                      <Button onClick={handleMarkDone} disabled={completeMutation.isPending} leadingVisual={() => <Check size={14} />}>Mark as Done</Button>
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {lightboxIdx !== null && images[lightboxIdx] && (
        <Box
          sx={{ position: "fixed", inset: 0, zIndex: 50, bg: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setLightboxIdx(null)}
        >
          <Box sx={{ position: "absolute", top: 3, right: 3 }}><Button variant="invisible" onClick={() => setLightboxIdx(null)} aria-label="Close"><X size={32} color="white" /></Button></Box>
          {lightboxIdx > 0 && (
            <Box sx={{ position: "absolute", left: 3 }}>
              <Button variant="invisible" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1) }} aria-label="Previous"><ChevronLeft size={32} color="white" /></Button>
            </Box>
          )}
          {lightboxIdx < images.length - 1 && (
            <Box sx={{ position: "absolute", right: 3 }}>
              <Button variant="invisible" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1) }} aria-label="Next"><ChevronRight size={32} color="white" /></Button>
            </Box>
          )}
          <img src={images[lightboxIdx].url} alt={images[lightboxIdx].caption} style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
        </Box>
      )}
    </Box>
  )
}
