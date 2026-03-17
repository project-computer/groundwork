import { useState, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  getVisit,
  updateVisit,
  duplicateVisit,
  getPets,
  completeVisit,
  createPrescriptionFromVisit,
  createBillFromVisit,
  getPrescriptions,
  getBills,
} from "@/lib/store"
import type { Visit, DispensedMedication, VisitImage } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ArrowLeft, Copy, Check, Circle, Trash2, Plus, Upload, X, Send,
  Thermometer, Heart, Wind, Weight, ChevronLeft, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

const stepDefs = [
  { key: "basicInfo" as const, label: "Basic Info" },
  { key: "treatmentPlan" as const, label: "Treatment Plan" },
  { key: "lab" as const, label: "Lab" },
  { key: "dispenseMedication" as const, label: "Dispense Medication" },
  { key: "appointment" as const, label: "Appointment" },
  { key: "endTreatment" as const, label: "End Treatment" },
]

function getActiveSteps(purpose: Visit["purpose"]) {
  switch (purpose) {
    case "History Only": return new Set(["basicInfo", "endTreatment"])
    case "Pharmacy Only": return new Set(["dispenseMedication", "endTreatment"])
    case "Appointment Only": return new Set(["appointment", "endTreatment"])
    default: return new Set(stepDefs.map(s => s.key))
  }
}

export default function VisitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [visit, setVisit] = useState(() => getVisit(id!))
  const [activeStep, setActiveStep] = useState(0)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  const save = useCallback((updates: Partial<Visit>) => {
    if (!visit) return
    updateVisit(visit.id, updates)
    setVisit(getVisit(visit.id))
  }, [visit])

  if (!visit) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Visit not found.</p>
        <Button variant="outline" onClick={() => navigate("/visits")} className="mt-4"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Visits</Button>
      </div>
    )
  }

  const activeSteps = getActiveSteps(visit.purpose)
  const pet = getPets().find(p => p.id === visit.petId)
  const linkedPrescription = getPrescriptions().find((rx) => rx.visitId === visit.id)
  const linkedBill = getBills().find((bill) => bill.visitId === visit.id)

  function handleDuplicate() {
    const newVisit = duplicateVisit(visit!.id)
    if (newVisit) navigate(`/visits/${newVisit.id}`)
  }

  function markStepDone(stepKey: keyof Visit["steps"]) {
    save({ steps: { ...visit!.steps, [stepKey]: true } })
  }

  function handleSendToBilling() {
    save({ billingStatus: "Sent to Billing", steps: { ...visit!.steps, endTreatment: true } })
  }

  function handleMarkDone() {
    completeVisit(visit!.id)
    setVisit(getVisit(visit!.id))
  }

  function handleGeneratePrescription() {
    createPrescriptionFromVisit(visit!.id)
    setVisit(getVisit(visit!.id))
  }

  function handleGenerateBill() {
    createBillFromVisit(visit!.id)
    setVisit(getVisit(visit!.id))
  }

  function addMedication() {
    const med: DispensedMedication = { name: "", dosage: "", frequency: "", duration: "", instructions: "", envelopeLabel: false }
    save({ medications: [...visit!.medications, med] })
  }

  function updateMedication(idx: number, field: keyof DispensedMedication, value: string | boolean) {
    const meds = [...visit!.medications]
    meds[idx] = { ...meds[idx], [field]: value }
    save({ medications: meds })
  }

  function removeMedication(idx: number) {
    save({ medications: visit!.medications.filter((_, i) => i !== idx) })
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    const newImages: VisitImage[] = Array.from(files).map(file => ({
      id: Math.random().toString(36).slice(2),
      url: URL.createObjectURL(file),
      thumbnail: URL.createObjectURL(file),
      caption: file.name,
      uploadedAt: new Date().toISOString(),
    }))
    save({ images: [...visit!.images, ...newImages] })
    e.target.value = ""
  }

  function removeImage(imgId: string) {
    save({ images: visit!.images.filter(i => i.id !== imgId) })
  }

  const currentStepDef = stepDefs[activeStep]

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/visits")}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-foreground">{visit.id}</h1>
            <Badge variant="outline" className={
              visit.status === "Done" ? "bg-success/10 text-success border-success/20"
              : visit.status === "In Examination" ? "bg-primary/10 text-primary border-primary/20"
              : visit.status === "Waiting" ? "bg-warning/10 text-warning border-warning/20"
              : "bg-muted text-muted-foreground border-border"
            }>{visit.status}</Badge>
            <Badge variant="outline">{visit.purpose}</Badge>
            <Badge variant="outline">{visit.type}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{visit.petName} ({pet?.species} - {pet?.breed}) &middot; Owner: {visit.ownerName} &middot; Vet: {visit.assignedVet}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDuplicate}><Copy className="w-4 h-4 mr-1" /> Duplicate</Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Step sidebar */}
        <div className="lg:w-56 shrink-0">
          <Card>
            <CardContent className="p-3">
              <div className="flex flex-row lg:flex-col gap-1 overflow-x-auto">
                {stepDefs.map((step, idx) => {
                  const isActive = activeSteps.has(step.key)
                  const isDone = visit.steps[step.key]
                  return (
                    <button
                      key={step.key}
                      onClick={() => isActive && setActiveStep(idx)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap",
                        idx === activeStep ? "bg-primary/10 text-primary" : isActive ? "hover:bg-muted text-foreground" : "text-muted-foreground/50 cursor-not-allowed",
                      )}
                      disabled={!isActive}
                    >
                      {isDone ? <Check className="w-4 h-4 text-success shrink-0" /> : <Circle className="w-4 h-4 shrink-0" />}
                      {step.label}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step content */}
        <div className="flex-1 min-w-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{currentStepDef.label}</CardTitle>
              {activeSteps.has(currentStepDef.key) && !visit.steps[currentStepDef.key] && (
                <Button size="sm" variant="outline" onClick={() => markStepDone(currentStepDef.key)}>
                  <Check className="w-3 h-3 mr-1" /> Mark Complete
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {/* Step 1: Basic Info */}
              {activeStep === 0 && (
                <div className="flex flex-col gap-5">
                  {pet && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/40 rounded-lg p-4">
                      <div><p className="text-xs text-muted-foreground">Patient</p><p className="text-sm font-medium">{pet.name}</p></div>
                      <div><p className="text-xs text-muted-foreground">Species</p><p className="text-sm">{pet.species}</p></div>
                      <div><p className="text-xs text-muted-foreground">Breed</p><p className="text-sm">{pet.breed}</p></div>
                      <div><p className="text-xs text-muted-foreground">Weight</p><p className="text-sm">{pet.weight} kg</p></div>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <Label>Chief Complaint</Label>
                    <Textarea rows={3} value={visit.chiefComplaint} onChange={(e) => save({ chiefComplaint: e.target.value })} placeholder="Primary reason for visit..." />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-3">Vitals</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="flex flex-col gap-1"><Label className="text-xs"><Thermometer className="w-3 h-3 inline mr-1" />Temp</Label><Input value={visit.vitals.temperature} onChange={(e) => save({ vitals: { ...visit.vitals, temperature: e.target.value } })} placeholder="101.5 F" /></div>
                      <div className="flex flex-col gap-1"><Label className="text-xs"><Heart className="w-3 h-3 inline mr-1" />HR</Label><Input value={visit.vitals.heartRate} onChange={(e) => save({ vitals: { ...visit.vitals, heartRate: e.target.value } })} placeholder="90 bpm" /></div>
                      <div className="flex flex-col gap-1"><Label className="text-xs"><Wind className="w-3 h-3 inline mr-1" />RR</Label><Input value={visit.vitals.respiratoryRate} onChange={(e) => save({ vitals: { ...visit.vitals, respiratoryRate: e.target.value } })} placeholder="22/min" /></div>
                      <div className="flex flex-col gap-1"><Label className="text-xs"><Weight className="w-3 h-3 inline mr-1" />Weight</Label><Input value={visit.vitals.weight} onChange={(e) => save({ vitals: { ...visit.vitals, weight: e.target.value } })} placeholder="32 kg" /></div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>History Notes</Label>
                    <Textarea rows={3} value={visit.historyNotes} onChange={(e) => save({ historyNotes: e.target.value })} placeholder="Relevant patient history..." />
                  </div>
                </div>
              )}

              {/* Step 2: Treatment Plan */}
              {activeStep === 1 && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2"><Label>Examination Findings</Label><Textarea rows={3} value={visit.examination} onChange={(e) => save({ examination: e.target.value })} placeholder="Physical examination findings..." /></div>
                  <div className="flex flex-col gap-2"><Label>Differential Diagnosis</Label><Textarea rows={3} value={visit.differentialDiagnosis} onChange={(e) => save({ differentialDiagnosis: e.target.value })} placeholder="Possible diagnoses (one per line)..." /></div>
                  <div className="flex flex-col gap-2"><Label>Final Diagnosis</Label><Textarea rows={2} value={visit.finalDiagnosis} onChange={(e) => save({ finalDiagnosis: e.target.value })} placeholder="Confirmed diagnosis..." /></div>
                  <div className="flex flex-col gap-2"><Label>Treatment</Label><Textarea rows={3} value={visit.treatment} onChange={(e) => save({ treatment: e.target.value })} placeholder="Treatment administered..." /></div>
                  <div className="flex flex-col gap-2"><Label>Advice</Label><Textarea rows={2} value={visit.advice} onChange={(e) => save({ advice: e.target.value })} placeholder="Home care instructions..." /></div>
                </div>
              )}

              {/* Step 3: Lab */}
              {activeStep === 2 && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2"><Label>Lab Notes</Label><Textarea rows={4} value={visit.historyNotes} onChange={(e) => save({ historyNotes: e.target.value })} placeholder="Lab results and notes..." /></div>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label>Images</Label>
                      <label className="cursor-pointer">
                        <Button variant="outline" size="sm" asChild><span><Upload className="w-3 h-3 mr-1" /> Upload</span></Button>
                        <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                      </label>
                    </div>
                    {visit.images.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {visit.images.map((img, idx) => (
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

              {/* Step 4: Dispense Medication */}
              {activeStep === 3 && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={visit.hasMedicationEnvelope} onCheckedChange={(c) => save({ hasMedicationEnvelope: !!c })} id="envelope" />
                    <Label htmlFor="envelope">Medication Envelope Required</Label>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Medications</Label>
                    <Button variant="outline" size="sm" onClick={addMedication}><Plus className="w-3 h-3 mr-1" /> Add</Button>
                  </div>
                  {visit.medications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No medications added yet.</p>
                  ) : (
                    visit.medications.map((med, i) => (
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

              {/* Step 5: Appointment */}
              {activeStep === 4 && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label>Follow-up Date</Label>
                    <Input type="date" value={visit.followUpDate} onChange={(e) => save({ followUpDate: e.target.value })} className="max-w-xs" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Notes</Label>
                    <Textarea rows={3} value={visit.advice} onChange={(e) => save({ advice: e.target.value })} placeholder="Follow-up instructions..." />
                  </div>
                </div>
              )}

              {/* Step 6: End Treatment */}
              {activeStep === 5 && (
                <div className="flex flex-col gap-5">
                  <div className="bg-muted/40 rounded-lg p-4">
                    <h3 className="text-sm font-semibold mb-3">Visit Summary</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      {visit.chiefComplaint && <div><p className="text-xs text-muted-foreground">Chief Complaint</p><p>{visit.chiefComplaint}</p></div>}
                      {visit.finalDiagnosis && <div><p className="text-xs text-muted-foreground">Final Diagnosis</p><p>{visit.finalDiagnosis}</p></div>}
                      {visit.treatment && <div><p className="text-xs text-muted-foreground">Treatment</p><p>{visit.treatment}</p></div>}
                      {visit.followUpDate && <div><p className="text-xs text-muted-foreground">Follow-up</p><p>{visit.followUpDate}</p></div>}
                      {visit.medications.length > 0 && <div><p className="text-xs text-muted-foreground">Medications</p><p>{visit.medications.map(m => m.name).join(", ")}</p></div>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {!linkedPrescription ? (
                      <Button variant="outline" onClick={handleGeneratePrescription}>
                        <Plus className="w-4 h-4 mr-2" /> Generate Prescription
                      </Button>
                    ) : (
                      <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-sm py-1.5">
                        Prescription: {linkedPrescription.id}
                      </Badge>
                    )}

                    {!linkedBill ? (
                      <Button variant="outline" onClick={handleGenerateBill}>
                        <Plus className="w-4 h-4 mr-2" /> Generate Bill
                      </Button>
                    ) : (
                      <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-sm py-1.5">
                        Bill: {linkedBill.id}
                      </Badge>
                    )}

                    {visit.billingStatus === "Not Sent" && (
                      <Button onClick={handleSendToBilling} className="bg-primary text-primary-foreground hover:bg-primary/90">
                        <Send className="w-4 h-4 mr-2" /> Send to Billing
                      </Button>
                    )}
                    {visit.billingStatus === "Sent to Billing" && (
                      <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-sm py-1.5">Sent to Billing</Badge>
                    )}
                    {visit.billingStatus === "Billed" && (
                      <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-sm py-1.5">Billed</Badge>
                    )}
                    {visit.status !== "Done" && (
                      <Button variant="outline" onClick={handleMarkDone}>
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

      {/* Lightbox */}
      {lightboxIdx !== null && visit.images[lightboxIdx] && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setLightboxIdx(null)}>
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightboxIdx(null)}><X className="w-8 h-8" /></button>
          {lightboxIdx > 0 && (
            <button className="absolute left-4 text-white" onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1) }}><ChevronLeft className="w-8 h-8" /></button>
          )}
          {lightboxIdx < visit.images.length - 1 && (
            <button className="absolute right-4 text-white" onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1) }}><ChevronRight className="w-8 h-8" /></button>
          )}
          <img src={visit.images[lightboxIdx].url} alt={visit.images[lightboxIdx].caption} className="max-w-[90vw] max-h-[90vh] object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
