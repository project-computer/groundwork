import { useState, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useVisit, useUpdateVisit, useCompleteVisit, useDuplicateVisit, useCreatePrescription, useCreateBill, usePrescriptions, useBills, usePatients } from "@/hooks/use-queries"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ArrowLeft, Copy, Check, Circle, Trash2, Plus, Upload, X, Send,
  Thermometer, Heart, Wind, Weight, ChevronLeft, ChevronRight, ClipboardCopy,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"

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

export default function VisitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const visitId = Number(id)
  const { data: visit, isLoading } = useVisit(visitId || undefined)
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
  const [dupDialogOpen, setDupDialogOpen] = useState(false)
  const { toast } = useToast()

  const save = useCallback((updates: Record<string, unknown>) => {
    if (!visit) return
    updateMutation.mutate({ id: visit.id, data: updates })
  }, [visit, updateMutation])

  if (isLoading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>
  if (!visit) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Visit not found.</p>
        <Button variant="outline" onClick={() => navigate("/visits")} className="mt-4"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Visits</Button>
      </div>
    )
  }

  const steps = visit.steps || {}
  const vitals = visit.vitals || {}
  const medications: Med[] = visit.medications || []
  const images = visit.images || []
  const activeSteps = getActiveSteps(visit.purpose)
  const pet = (petsData?.data ?? []).find((p: Record<string, unknown>) => p.id === visit.petId)
  const prescriptions = rxData?.data ?? []
  const bills = billsData?.data ?? []
  const linkedRx = prescriptions.find((rx: Record<string, unknown>) => rx.visitId === visit.id)
  const linkedBill = bills.find((b: Record<string, unknown>) => b.visitId === visit.id)

  function handleDuplicate() {
    duplicateMutation.mutate(visit!.id, {
      onSuccess: (data) => { setDupDialogOpen(false); navigate(`/visits/${data?.id || data?.data?.id}`) },
    })
  }

  function handleCopyReport() {
    const v = visit!
    const lines: string[] = [
      `VISIT REPORT - ${v.customId || v.id}`,
      `Date: ${v.createdAt ? new Date(v.createdAt).toLocaleDateString() : "-"}`,
      `Status: ${v.status}`,
      `Purpose: ${v.purpose} | Type: ${v.type}`,
      "",
      "--- PATIENT ---",
      `Name: ${v.petName}`,
      `Species: ${pet?.species || "-"} | Breed: ${pet?.breed || "-"}`,
      `Weight: ${pet?.weight ? `${pet.weight} kg` : "-"}`,
      `Owner: ${v.ownerName}`,
      "",
      "--- ASSIGNED VET ---",
      `${v.assignedVetName || "-"}`,
      "",
      "--- VITALS ---",
      `Temperature: ${vitals.temperature || "-"}`,
      `Heart Rate: ${vitals.heartRate || "-"}`,
      `Respiratory Rate: ${vitals.respiratoryRate || "-"}`,
      `Weight: ${vitals.weight || "-"}`,
      "",
      "--- CHIEF COMPLAINT ---",
      v.chiefComplaint || "-",
      "",
      "--- HISTORY NOTES ---",
      v.historyNotes || "-",
      "",
      "--- EXAMINATION ---",
      v.examination || "-",
      "",
      "--- DIFFERENTIAL DIAGNOSIS ---",
      v.differentialDiagnosis || "-",
      "",
      "--- FINAL DIAGNOSIS ---",
      v.finalDiagnosis || "-",
      "",
      "--- TREATMENT ---",
      v.treatment || "-",
      "",
      "--- ADVICE ---",
      v.advice || "-",
    ]

    if (medications.length > 0) {
      lines.push("", "--- MEDICATIONS ---")
      medications.forEach((m: Med, i: number) => {
        lines.push(`${i + 1}. ${m.name || "-"} | Dosage: ${m.dosage || "-"} | Frequency: ${m.frequency || "-"} | Duration: ${m.duration || "-"}${m.instructions ? ` | Instructions: ${m.instructions}` : ""}`)
      })
    }

    if (v.followUpDate) {
      lines.push("", "--- FOLLOW-UP ---", `Date: ${String(v.followUpDate).slice(0, 10)}`)
    }

    if (v.billingStatus) {
      lines.push("", "--- BILLING ---", `Status: ${v.billingStatus}`)
    }

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      toast({ title: "Report copied!", description: "Visit report copied to clipboard" })
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
    save({ medications: medications.filter((_: Med, i: number) => i !== idx) })
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
    save({ images: images.filter((i: { id: string }) => i.id !== imgId) })
  }

  const currentStepDef = stepDefs[activeStep]

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/visits")}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-foreground">{visit.customId}</h1>
            <Badge variant="outline" className={
              visit.status === "Done" ? "bg-success/10 text-success border-success/20"
              : visit.status === "In Examination" ? "bg-primary/10 text-primary border-primary/20"
              : visit.status === "Waiting" ? "bg-warning/10 text-warning border-warning/20"
              : "bg-muted text-muted-foreground border-border"
            }>{visit.status}</Badge>
            <Badge variant="outline">{visit.purpose}</Badge>
            <Badge variant="outline">{visit.type}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{visit.petName} ({pet?.species || ""} - {pet?.breed || ""}) &middot; Owner: {visit.ownerName} &middot; Vet: {visit.assignedVetName || "-"}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleCopyReport}><ClipboardCopy className="w-4 h-4 mr-1" /> Copy Report</Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/visits/${visit.id}/transfer`)}><Send className="w-4 h-4 mr-1" /> Transfer</Button>
          <Button variant="outline" size="sm" onClick={() => setDupDialogOpen(true)}><Copy className="w-4 h-4 mr-1" /> Duplicate</Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-56 shrink-0">
          <Card>
            <CardContent className="p-3">
              <div className="flex flex-row lg:flex-col gap-1 overflow-x-auto">
                {stepDefs.map((step, idx) => {
                  const isActive = activeSteps.has(step.key)
                  const isDone = steps[step.key]
                  return (
                    <button key={step.key} onClick={() => isActive && setActiveStep(idx)}
                      className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap",
                        idx === activeStep ? "bg-primary/10 text-primary" : isActive ? "hover:bg-muted text-foreground" : "text-muted-foreground/50 cursor-not-allowed"
                      )} disabled={!isActive}>
                      {isDone ? <Check className="w-4 h-4 text-success shrink-0" /> : <Circle className="w-4 h-4 shrink-0" />}
                      {step.label}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex-1 min-w-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{currentStepDef.label}</CardTitle>
              {activeSteps.has(currentStepDef.key) && !steps[currentStepDef.key] && (
                <Button size="sm" variant="outline" onClick={() => markStepDone(currentStepDef.key)}>
                  <Check className="w-3 h-3 mr-1" /> Mark Complete
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {activeStep === 0 && (
                <div className="flex flex-col gap-5">
                  {pet && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/40 rounded-lg p-4">
                      <div><p className="text-xs text-muted-foreground">Patient</p><p className="text-sm font-medium">{pet.name}</p></div>
                      <div><p className="text-xs text-muted-foreground">Species</p><p className="text-sm">{pet.species}</p></div>
                      <div><p className="text-xs text-muted-foreground">Breed</p><p className="text-sm">{pet.breed || "-"}</p></div>
                      <div><p className="text-xs text-muted-foreground">Weight</p><p className="text-sm">{pet.weight ? `${pet.weight} kg` : "-"}</p></div>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <Label>Chief Complaint</Label>
                    <Textarea rows={3} value={visit.chiefComplaint || ""} onChange={(e) => save({ chiefComplaint: e.target.value })} placeholder="Primary reason for visit..." />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-3">Vitals</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="flex flex-col gap-1"><Label className="text-xs"><Thermometer className="w-3 h-3 inline mr-1" />Temp</Label><Input value={vitals.temperature || ""} onChange={(e) => save({ vitals: { ...vitals, temperature: e.target.value } })} placeholder="101.5 F" /></div>
                      <div className="flex flex-col gap-1"><Label className="text-xs"><Heart className="w-3 h-3 inline mr-1" />HR</Label><Input value={vitals.heartRate || ""} onChange={(e) => save({ vitals: { ...vitals, heartRate: e.target.value } })} placeholder="90 bpm" /></div>
                      <div className="flex flex-col gap-1"><Label className="text-xs"><Wind className="w-3 h-3 inline mr-1" />RR</Label><Input value={vitals.respiratoryRate || ""} onChange={(e) => save({ vitals: { ...vitals, respiratoryRate: e.target.value } })} placeholder="22/min" /></div>
                      <div className="flex flex-col gap-1"><Label className="text-xs"><Weight className="w-3 h-3 inline mr-1" />Weight</Label><Input value={vitals.weight || ""} onChange={(e) => save({ vitals: { ...vitals, weight: e.target.value } })} placeholder="32 kg" /></div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>History Notes</Label>
                    <Textarea rows={3} value={visit.historyNotes || ""} onChange={(e) => save({ historyNotes: e.target.value })} placeholder="Relevant patient history..." />
                  </div>
                </div>
              )}

              {activeStep === 1 && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2"><Label>Examination Findings</Label><Textarea rows={3} value={visit.examination || ""} onChange={(e) => save({ examination: e.target.value })} placeholder="Physical examination findings..." /></div>
                  <div className="flex flex-col gap-2"><Label>Differential Diagnosis</Label><Textarea rows={3} value={visit.differentialDiagnosis || ""} onChange={(e) => save({ differentialDiagnosis: e.target.value })} placeholder="Possible diagnoses..." /></div>
                  <div className="flex flex-col gap-2"><Label>Final Diagnosis</Label><Textarea rows={2} value={visit.finalDiagnosis || ""} onChange={(e) => save({ finalDiagnosis: e.target.value })} placeholder="Confirmed diagnosis..." /></div>
                  <div className="flex flex-col gap-2"><Label>Treatment</Label><Textarea rows={3} value={visit.treatment || ""} onChange={(e) => save({ treatment: e.target.value })} placeholder="Treatment administered..." /></div>
                  <div className="flex flex-col gap-2"><Label>Advice</Label><Textarea rows={2} value={visit.advice || ""} onChange={(e) => save({ advice: e.target.value })} placeholder="Home care instructions..." /></div>
                </div>
              )}

              {activeStep === 2 && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2"><Label>Lab Notes</Label><Textarea rows={4} value={visit.historyNotes || ""} onChange={(e) => save({ historyNotes: e.target.value })} placeholder="Lab results and notes..." /></div>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label>Images</Label>
                      <label className="cursor-pointer">
                        <Button variant="outline" size="sm" asChild><span><Upload className="w-3 h-3 mr-1" /> Upload</span></Button>
                        <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                      </label>
                    </div>
                    {images.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {images.map((img: { id: string; url: string; caption: string }, idx: number) => (
                          <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border border-border cursor-pointer" onClick={() => setLightboxIdx(idx)}>
                            <img src={img.url} alt={img.caption} className="w-full h-full object-cover" />
                            <button className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); removeImage(img.id) }}>
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No images uploaded yet.</p>
                    )}
                  </div>
                </div>
              )}

              {activeStep === 3 && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={visit.hasMedicationEnvelope || false} onCheckedChange={(c) => save({ hasMedicationEnvelope: !!c })} id="envelope" />
                    <Label htmlFor="envelope">Medication Envelope Required</Label>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Medications</Label>
                    <Button variant="outline" size="sm" onClick={addMedication}><Plus className="w-3 h-3 mr-1" /> Add</Button>
                  </div>
                  {medications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No medications added yet.</p>
                  ) : (
                    medications.map((med: Med, i: number) => (
                      <div key={i} className="border border-border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium">Medicine {i + 1}</span>
                          <Button variant="ghost" size="sm" onClick={() => removeMedication(i)} className="text-destructive h-7 px-2"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1"><Label className="text-xs">Name</Label><Input value={med.name} onChange={(e) => updateMedication(i, "name", e.target.value)} placeholder="e.g. Amoxicillin" /></div>
                          <div className="flex flex-col gap-1"><Label className="text-xs">Dosage</Label><Input value={med.dosage} onChange={(e) => updateMedication(i, "dosage", e.target.value)} placeholder="e.g. 500mg" /></div>
                          <div className="flex flex-col gap-1"><Label className="text-xs">Frequency</Label><Input value={med.frequency} onChange={(e) => updateMedication(i, "frequency", e.target.value)} placeholder="e.g. Twice daily" /></div>
                          <div className="flex flex-col gap-1"><Label className="text-xs">Duration</Label><Input value={med.duration} onChange={(e) => updateMedication(i, "duration", e.target.value)} placeholder="e.g. 7 days" /></div>
                          <div className="flex flex-col gap-1 sm:col-span-2"><Label className="text-xs">Instructions</Label><Textarea value={med.instructions} onChange={(e) => updateMedication(i, "instructions", e.target.value)} rows={2} /></div>
                          <div className="flex items-center gap-2">
                            <Checkbox checked={med.envelopeLabel} onCheckedChange={(c) => updateMedication(i, "envelopeLabel", !!c)} />
                            <Label className="text-xs">Envelope Label</Label>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeStep === 4 && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label>Follow-up Date</Label>
                    <Input type="date" value={visit.followUpDate ? String(visit.followUpDate).slice(0, 10) : ""} onChange={(e) => save({ followUpDate: e.target.value })} className="max-w-xs" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Notes</Label>
                    <Textarea rows={3} value={visit.advice || ""} onChange={(e) => save({ advice: e.target.value })} placeholder="Follow-up instructions..." />
                  </div>
                </div>
              )}

              {activeStep === 5 && (
                <div className="flex flex-col gap-5">
                  <div className="bg-muted/40 rounded-lg p-4">
                    <h3 className="text-sm font-semibold mb-3">Visit Summary</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      {visit.chiefComplaint && <div><p className="text-xs text-muted-foreground">Chief Complaint</p><p>{visit.chiefComplaint}</p></div>}
                      {visit.finalDiagnosis && <div><p className="text-xs text-muted-foreground">Final Diagnosis</p><p>{visit.finalDiagnosis}</p></div>}
                      {visit.treatment && <div><p className="text-xs text-muted-foreground">Treatment</p><p>{visit.treatment}</p></div>}
                      {visit.followUpDate && <div><p className="text-xs text-muted-foreground">Follow-up</p><p>{String(visit.followUpDate).slice(0, 10)}</p></div>}
                      {medications.length > 0 && <div><p className="text-xs text-muted-foreground">Medications</p><p>{medications.map((m: Med) => m.name).join(", ")}</p></div>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {!linkedRx ? (
                      <Button variant="outline" onClick={handleGenerateRx} disabled={createRxMutation.isPending}>
                        <Plus className="w-4 h-4 mr-2" /> Generate Prescription
                      </Button>
                    ) : (
                      <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-sm py-1.5">
                        Prescription: {linkedRx.customId || linkedRx.id}
                      </Badge>
                    )}
                    {!linkedBill ? (
                      <Button variant="outline" onClick={handleGenerateBill} disabled={createBillMutation.isPending}>
                        <Plus className="w-4 h-4 mr-2" /> Generate Bill
                      </Button>
                    ) : (
                      <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-sm py-1.5">
                        Bill: {linkedBill.customId || linkedBill.id}
                      </Badge>
                    )}
                    {visit.billingStatus === "Not Sent" && (
                      <Button onClick={handleSendToBilling} className="bg-primary text-primary-foreground hover:bg-primary/90">
                        <Send className="w-4 h-4 mr-2" /> Send to Billing
                      </Button>
                    )}
                    {visit.billingStatus === "Sent to Billing" && <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-sm py-1.5">Sent to Billing</Badge>}
                    {visit.billingStatus === "Billed" && <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-sm py-1.5">Billed</Badge>}
                    {visit.status !== "Done" && (
                      <Button variant="outline" onClick={handleMarkDone} disabled={completeMutation.isPending}>
                        <Check className="w-4 h-4 mr-2" /> Mark as Done
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {lightboxIdx !== null && images[lightboxIdx] && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setLightboxIdx(null)}>
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightboxIdx(null)}><X className="w-8 h-8" /></button>
          {lightboxIdx > 0 && <button className="absolute left-4 text-white" onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1) }}><ChevronLeft className="w-8 h-8" /></button>}
          {lightboxIdx < images.length - 1 && <button className="absolute right-4 text-white" onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1) }}><ChevronRight className="w-8 h-8" /></button>}
          <img src={images[lightboxIdx].url} alt={images[lightboxIdx].caption} className="max-w-[90vw] max-h-[90vh] object-contain" onClick={(e: React.MouseEvent) => e.stopPropagation()} />
        </div>
      )}

      <AlertDialog open={dupDialogOpen} onOpenChange={setDupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate Visit</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to duplicate this visit for {visit.petName}? A new visit with the same details will be created.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDuplicate} disabled={duplicateMutation.isPending}>
              Duplicate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
