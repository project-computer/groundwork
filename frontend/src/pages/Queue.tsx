import { Link } from "react-router-dom"
import { useVisits, useUpdateVisit, useCompleteVisit } from "@/hooks/use-queries"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Play, Eye, Check, ArrowRight } from "lucide-react"
import { useState } from "react"

export default function QueuePage() {
  const { data: visitsData } = useVisits({ limit: 200 })
  const updateMutation = useUpdateVisit()
  const completeMutation = useCompleteVisit()
  const [submitOpen, setSubmitOpen] = useState(false)
  const [selectedDraft, setSelectedDraft] = useState("")

  const visits = visitsData?.data ?? []
  const today = new Date().toISOString().slice(0, 10)

  const waiting = visits.filter((v: Record<string, string>) => v.status === "Waiting")
  const inExam = visits.filter((v: Record<string, string>) => v.status === "In Examination")
  const doneToday = visits.filter((v: Record<string, string>) => v.status === "Done" && (v.updatedAt || "").slice(0, 10) === today)
  const drafts = visits.filter((v: Record<string, string>) => v.status === "Draft")

  function startExam(id: number) {
    updateMutation.mutate({ id, data: { status: "In Examination" } })
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
          <h1 className="text-2xl font-semibold text-foreground text-balance">Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">Patient queue management board.</p>
        </div>
        <Button onClick={() => setSubmitOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={drafts.length === 0}>
          <ArrowRight className="w-4 h-4 mr-2" /> Submit to Queue
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-warning" /> Waiting ({waiting.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {waiting.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No patients waiting</p> : waiting.map((v: Record<string, unknown>) => (
              <VisitCard key={v.id as number} visit={v} actions={
                <Button size="sm" onClick={() => startExam(v.id as number)} className="bg-primary text-primary-foreground hover:bg-primary/90 w-full">
                  <Play className="w-3 h-3 mr-1" /> Start Examination
                </Button>
              } />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" /> In Examination ({inExam.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {inExam.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No patients in examination</p> : inExam.map((v: Record<string, unknown>) => (
              <VisitCard key={v.id as number} visit={v} actions={
                <>
                  <Link to={`/visits/${v.id}`} className="flex-1">
                    <Button size="sm" variant="outline" className="w-full"><Eye className="w-3 h-3 mr-1" /> Open</Button>
                  </Link>
                  <Button size="sm" variant="outline" onClick={() => markDone(v.id as number)} className="flex-1">
                    <Check className="w-3 h-3 mr-1" /> Done
                  </Button>
                </>
              } />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success" /> Done Today ({doneToday.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {doneToday.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No completed visits today</p> : doneToday.map((v: Record<string, unknown>) => (
              <VisitCard key={v.id as number} visit={v} actions={
                <Link to={`/visits/${v.id}`} className="w-full">
                  <Button size="sm" variant="outline" className="w-full"><Eye className="w-3 h-3 mr-1" /> View</Button>
                </Link>
              } />
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Submit to Queue</DialogTitle></DialogHeader>
          <div className="py-4">
            <Label className="mb-2 block">Select a Draft Visit</Label>
            <Select value={selectedDraft} onValueChange={setSelectedDraft}>
              <SelectTrigger><SelectValue placeholder="Select visit..." /></SelectTrigger>
              <SelectContent>
                {drafts.map((d: Record<string, unknown>) => <SelectItem key={String(d.id)} value={String(d.id)}>{d.customId as string} - {d.petName as string} ({d.purpose as string})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button onClick={submitToQueue} disabled={!selectedDraft || updateMutation.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
