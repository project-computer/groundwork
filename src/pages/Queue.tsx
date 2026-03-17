import { useState } from "react"
import { Link } from "react-router-dom"
import { getVisits, updateVisit, completeVisit, getTodayISO } from "@/lib/store"
import type { Visit } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Play, Eye, Check, ArrowRight } from "lucide-react"

export default function QueuePage() {
  const [visits, setVisits] = useState(getVisits())
  const [submitOpen, setSubmitOpen] = useState(false)
  const [selectedDraft, setSelectedDraft] = useState("")

  const waiting = visits.filter(v => v.status === "Waiting")
  const inExam = visits.filter(v => v.status === "In Examination")
  const doneToday = visits.filter(v => v.status === "Done" && v.updatedAt === getTodayISO())
  const drafts = visits.filter(v => v.status === "Draft")

  function refresh() { setVisits(getVisits()) }

  function startExam(id: string) {
    updateVisit(id, { status: "In Examination" })
    refresh()
  }

  function markDone(id: string) {
    completeVisit(id)
    refresh()
  }

  function submitToQueue() {
    if (!selectedDraft) return
    updateVisit(selectedDraft, { status: "Waiting" })
    refresh()
    setSubmitOpen(false)
    setSelectedDraft("")
  }

  function VisitCard({ visit, actions }: { visit: Visit; actions: React.ReactNode }) {
    return (
      <div className="bg-background border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-xs text-muted-foreground">{visit.id}</span>
          <Badge variant="outline" className="text-[10px]">{visit.purpose}</Badge>
        </div>
        <p className="text-sm font-medium text-foreground">{visit.petName}</p>
        <p className="text-xs text-muted-foreground">{visit.ownerName}</p>
        <p className="text-xs text-muted-foreground mt-1">Vet: {visit.assignedVet}</p>
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
        {/* Waiting */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-warning" />
              Waiting ({waiting.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {waiting.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No patients waiting</p>
            ) : (
              waiting.map(v => (
                <VisitCard key={v.id} visit={v} actions={
                  <Button size="sm" onClick={() => startExam(v.id)} className="bg-primary text-primary-foreground hover:bg-primary/90 w-full">
                    <Play className="w-3 h-3 mr-1" /> Start Examination
                  </Button>
                } />
              ))
            )}
          </CardContent>
        </Card>

        {/* In Examination */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              In Examination ({inExam.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {inExam.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No patients in examination</p>
            ) : (
              inExam.map(v => (
                <VisitCard key={v.id} visit={v} actions={
                  <>
                    <Link to={`/visits/${v.id}`} className="flex-1">
                      <Button size="sm" variant="outline" className="w-full"><Eye className="w-3 h-3 mr-1" /> Open</Button>
                    </Link>
                    <Button size="sm" variant="outline" onClick={() => markDone(v.id)} className="flex-1">
                      <Check className="w-3 h-3 mr-1" /> Done
                    </Button>
                  </>
                } />
              ))
            )}
          </CardContent>
        </Card>

        {/* Done Today */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success" />
              Done Today ({doneToday.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {doneToday.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No completed visits today</p>
            ) : (
              doneToday.map(v => (
                <VisitCard key={v.id} visit={v} actions={
                  <Link to={`/visits/${v.id}`} className="w-full">
                    <Button size="sm" variant="outline" className="w-full"><Eye className="w-3 h-3 mr-1" /> View</Button>
                  </Link>
                } />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Submit to Queue Dialog */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Submit to Queue</DialogTitle></DialogHeader>
          <div className="py-4">
            <Label className="mb-2 block">Select a Draft Visit</Label>
            <Select value={selectedDraft} onValueChange={setSelectedDraft}>
              <SelectTrigger><SelectValue placeholder="Select visit..." /></SelectTrigger>
              <SelectContent>
                {drafts.map(d => <SelectItem key={d.id} value={d.id}>{d.id} - {d.petName} ({d.purpose})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button onClick={submitToQueue} disabled={!selectedDraft} className="bg-primary text-primary-foreground hover:bg-primary/90">Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
