import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useVisits, useUpdateVisit, useCompleteVisit, useCreateVisit, usePatients } from "@/hooks/use-queries"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Play, Eye, Check, ArrowRight, Plus, Search } from "lucide-react"

export default function QueuePage() {
  const navigate = useNavigate()
  const { data: visitsData } = useVisits({ limit: 200 })
  const { data: petsData } = usePatients({ limit: 200 })
  const updateMutation = useUpdateVisit()
  const completeMutation = useCompleteVisit()
  const createMutation = useCreateVisit()
  const [submitOpen, setSubmitOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [selectedDraft, setSelectedDraft] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [quickPet, setQuickPet] = useState({ name: "", species: "Dog", ownerName: "", ownerPhone: "" })

  const visits = visitsData?.data ?? []
  const opdVisits = visits.filter((v: Record<string, string>) => v.type === "OPD")
  const pets = petsData?.data ?? []
  const today = new Date().toISOString().slice(0, 10)

  const waiting = opdVisits.filter((v: Record<string, string>) => v.status === "Waiting")
  const inExam = opdVisits.filter((v: Record<string, string>) => v.status === "In Examination")
  const doneToday = opdVisits.filter((v: Record<string, string>) => v.status === "Done" && (v.updatedAt || "").slice(0, 10) === today)
  const drafts = opdVisits.filter((v: Record<string, string>) => v.status === "Draft")

  const filteredPets = searchTerm
    ? pets.filter((p: Record<string, string>) =>
        (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.ownerName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.ownerPhone || "").includes(searchTerm)
      )
    : pets

  function openVisit(id: number) {
    navigate(`/visits/${id}`)
  }

  function markDone(id: number) {
    completeMutation.mutate(id)
  }

  function submitToQueue() {
    if (!selectedDraft) return
    updateMutation.mutate({ id: Number(selectedDraft), data: { status: "Waiting" } }, {
      onSuccess: () => { setSubmitOpen(false); setSelectedDraft("") },
    })
  }

  function quickAddToQueue() {
    const pet = pets.find((p: Record<string, string>) =>
      p.name === quickPet.name && p.ownerName === quickPet.ownerName
    )
    if (!pet) return
    createMutation.mutate(
      {
        petId: pet.id,
        petName: pet.name,
        ownerName: pet.ownerName,
        type: "OPD",
        purpose: "Examination",
      },
      {
        onSuccess: (data: Record<string, string>) => {
          updateMutation.mutate({ id: Number(data.id), data: { status: "Waiting" } })
          setQuickAddOpen(false)
          setQuickPet({ name: "", species: "Dog", ownerName: "", ownerPhone: "" })
        },
      },
    )
  }

  function VisitCard({ visit, actions }: { visit: Record<string, unknown>; actions: React.ReactNode }) {
    return (
      <div className="bg-background border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-xs text-muted-foreground">{visit.customId as string}</span>
          <Badge variant="outline" className="text-[10px]">{visit.purpose as string}</Badge>
        </div>
        <p className="text-sm font-medium text-foreground">{visit.petName as string}</p>
        <p className="text-xs text-muted-foreground">{visit.ownerName as string}</p>
        <p className="text-xs text-muted-foreground mt-1">Vet: {(visit.assignedVetName as string) || "-"}</p>
        <div className="flex gap-2 mt-3">{actions}</div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground text-balance">คิวผู้ป่วย (Queue)</h1>
          <p className="text-sm text-muted-foreground mt-1">จัดการคิวผู้ป่วยวันนี้</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setQuickAddOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" /> เพิ่มผู้ป่วย (Quick Add)
          </Button>
          <Button onClick={() => setSubmitOpen(true)} variant="outline" disabled={drafts.length === 0}>
            <ArrowRight className="w-4 h-4 mr-2" /> เข้าคิว (Submit)
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-warning" /> รอตรวจ (Waiting) ({waiting.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {waiting.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">ไม่มีผู้ป่วยรอ</p> : waiting.map((v: Record<string, unknown>) => (
              <VisitCard key={v.id as number} visit={v} actions={
                <Button size="sm" onClick={() => openVisit(v.id as number)} className="bg-primary text-primary-foreground hover:bg-primary/90 w-full">
                  <Play className="w-3 h-3 mr-1" /> เริ่มตรวจ (Start)
                </Button>
              } />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" /> กำลังตรวจ (In Exam) ({inExam.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {inExam.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">ไม่มีผู้ป่วยกำลังตรวจ</p> : inExam.map((v: Record<string, unknown>) => (
              <VisitCard key={v.id as number} visit={v} actions={
                <>
                  <Button size="sm" variant="outline" onClick={() => openVisit(v.id as number)} className="flex-1">
                    <Eye className="w-3 h-3 mr-1" /> เปิด (Open)
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => markDone(v.id as number)} className="flex-1">
                    <Check className="w-3 h-3 mr-1" /> เสร็จ (Done)
                  </Button>
                </>
              } />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success" /> เสร็จแล้ววันนี้ (Done) ({doneToday.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {doneToday.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">ยังไม่มีผู้ป่วยเสร็จ</p> : doneToday.map((v: Record<string, unknown>) => (
              <VisitCard key={v.id as number} visit={v} actions={
                <Link to={`/visits/${v.id}`} className="w-full">
                  <Button size="sm" variant="outline" className="w-full"><Eye className="w-3 h-3 mr-1" /> ดู (View)</Button>
                </Link>
              } />
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>เข้าคิว (Submit to Queue)</DialogTitle></DialogHeader>
          <div className="py-4">
            <Label className="mb-2 block">เลือก Visit ที่ยังไม่ได้เข้าคิว</Label>
            <Select value={selectedDraft} onValueChange={setSelectedDraft}>
              <SelectTrigger><SelectValue placeholder="Select visit..." /></SelectTrigger>
              <SelectContent>
                {drafts.map((d: Record<string, unknown>) => <SelectItem key={String(d.id)} value={String(d.id)}>{d.customId as string} - {d.petName as string}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button onClick={submitToQueue} disabled={!selectedDraft || updateMutation.isPending}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>เพิ่มผู้ป่วยเข้าคิว (Quick Add to Queue)</DialogTitle></DialogHeader>
          <DialogDescription>ค้นหาผู้ป่วยที่มี หรือสร้างใหม่</DialogDescription>
          <div className="py-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="ค้นหาชื่อผู้ป่วย, ชื่อเจ้าของ, เบอร์โทร..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            {filteredPets.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1">
                <p className="text-xs text-muted-foreground mb-1">เลือกผู้ป่วยที่มี:</p>
                {filteredPets.slice(0, 8).map((p: Record<string, unknown>) => (
                  <button
                    key={p.id as string}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm"
                    onClick={() => {
                      createMutation.mutate(
                        { petId: p.id, petName: p.name, ownerName: p.ownerName, type: "OPD", purpose: "Examination" },
                        {
                          onSuccess: (data: Record<string, unknown>) => {
                            updateMutation.mutate({ id: data.id as number, data: { status: "Waiting" } })
                            setQuickAddOpen(false)
                            setSearchTerm("")
                          },
                        },
                      )
                    }}
                  >
                    <span className="font-medium">{p.name as string}</span>
                    <span className="text-muted-foreground ml-2">({p.species as string})</span>
                    <span className="text-muted-foreground ml-2">— {p.ownerName as string}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground mb-3">หรือสร้างผู้ป่วยใหม่:</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">ชื่อผู้ป่วย</Label><Input value={quickPet.name} onChange={(e) => setQuickPet({ ...quickPet, name: e.target.value })} /></div>
                <div><Label className="text-xs">ชนิดสัตว์</Label>
                  <Select value={quickPet.species} onValueChange={(v) => setQuickPet({ ...quickPet, species: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dog">Dog (สุนัข)</SelectItem>
                      <SelectItem value="Cat">Cat (แมว)</SelectItem>
                      <SelectItem value="Bird">Bird (นก)</SelectItem>
                      <SelectItem value="Rabbit">Rabbit (กระต่าย)</SelectItem>
                      <SelectItem value="Other">Other (อื่นๆ)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">ชื่อเจ้าของ</Label><Input value={quickPet.ownerName} onChange={(e) => setQuickPet({ ...quickPet, ownerName: e.target.value })} /></div>
                <div><Label className="text-xs">เบอร์โทรเจ้าของ</Label><Input value={quickPet.ownerPhone} onChange={(e) => setQuickPet({ ...quickPet, ownerPhone: e.target.value })} /></div>
              </div>
              <Button className="w-full mt-3" onClick={quickAddToQueue} disabled={!quickPet.name || !quickPet.ownerName}>
                สร้างและเข้าคิวทันที
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAddOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
