import { Link } from "react-router-dom"
import { useState } from "react"
import { useVisitQueue, useUpdateVisit, useCompleteVisit } from "@/features/visits/api"
import { Box, Button, Dialog, FormControl, Heading, Label, Select, Text } from "@primer/react"

export default function QueuePage() {
  const { data: queueData } = useVisitQueue()
  const updateMutation = useUpdateVisit()
  const completeMutation = useCompleteVisit()
  const [submitOpen, setSubmitOpen] = useState(false)
  const [selectedDraft, setSelectedDraft] = useState("")

  const visits = queueData ?? []
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
      <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2, p: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Text sx={{ fontFamily: "mono", fontSize: 0, color: "fg.muted" }}>{visit.customId as string}</Text>
          <Label variant="accent">{visit.purpose as string}</Label>
        </Box>
        <Text as="p" sx={{ fontSize: 1, fontWeight: 600 }}>{visit.petName as string}</Text>
        <Text as="p" sx={{ fontSize: 0, color: "fg.muted" }}>{visit.ownerName as string}</Text>
        <Text as="p" sx={{ fontSize: 0, color: "fg.muted", mt: 1 }}>Vet: {(visit.assignedVetName as string) || "-"}</Text>
        <Box sx={{ display: "flex", gap: 2, mt: 3 }}>{actions}</Box>
      </Box>
    )
  }

  function Column({ title, dot, empty, children }: { title: string; dot: string; empty: string; children: React.ReactNode }) {
    return (
      <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2, bg: "canvas.default" }}>
        <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "border.default" }}>
          <Heading as="h2" sx={{ fontSize: 1, display: "flex", alignItems: "center", gap: 2 }}>
            <Box as="span" sx={{ width: 8, height: 8, borderRadius: "50%", bg: dot }} />
            {title}
          </Heading>
        </Box>
        <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          {children === null || children === undefined ? <Text sx={{ fontSize: 1, color: "fg.muted", textAlign: "center", py: 3 }}>{empty}</Text> : children}
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ p: [3, 4] }}>
      <Box sx={{ display: "flex", flexDirection: ["column", "row"], alignItems: ["stretch", "center"], justifyContent: "space-between", gap: 3, mb: 4 }}>
        <Box>
          <Heading as="h2" sx={{ fontSize: 4 }}>Queue</Heading>
          <Text sx={{ fontSize: 1, color: "fg.muted" }}>Patient queue management board.</Text>
        </Box>
        <Button variant="primary" onClick={() => setSubmitOpen(true)} disabled={drafts.length === 0}>
          Submit to Queue
        </Button>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: ["1fr", "1fr", "1fr 1fr 1fr"], gap: 3 }}>
        <Column title={`Waiting (${waiting.length})`} dot="attention.emphasis" empty="No patients waiting">
          {waiting.length === 0 ? <Text sx={{ fontSize: 1, color: "fg.muted", textAlign: "center", py: 3 }}>No patients waiting</Text> : waiting.map((v: Record<string, unknown>) => (
            <VisitCard key={v.id as number} visit={v} actions={
              <Button variant="primary" size="small" onClick={() => startExam(v.id as number)} sx={{ width: "100%" }}>Start Examination</Button>
            } />
          ))}
        </Column>

        <Column title={`In Examination (${inExam.length})`} dot="accent.emphasis" empty="No patients in examination">
          {inExam.length === 0 ? <Text sx={{ fontSize: 1, color: "fg.muted", textAlign: "center", py: 3 }}>No patients in examination</Text> : inExam.map((v: Record<string, unknown>) => (
            <VisitCard key={v.id as number} visit={v} actions={
              <>
                <Link to={`/visits/${v.id}`} style={{ flex: 1 }}>
                  <Button size="small" sx={{ width: "100%" }}>Open</Button>
                </Link>
                <Button size="small" onClick={() => markDone(v.id as number)} sx={{ flex: 1 }}>Done</Button>
              </>
            } />
          ))}
        </Column>

        <Column title={`Done Today (${doneToday.length})`} dot="success.emphasis" empty="No completed visits today">
          {doneToday.length === 0 ? <Text sx={{ fontSize: 1, color: "fg.muted", textAlign: "center", py: 3 }}>No completed visits today</Text> : doneToday.map((v: Record<string, unknown>) => (
            <VisitCard key={v.id as number} visit={v} actions={
              <Link to={`/visits/${v.id}`} style={{ width: "100%" }}>
                <Button size="small" sx={{ width: "100%" }}>View</Button>
              </Link>
            } />
          ))}
        </Column>
      </Box>

      {submitOpen && (
        <Dialog onClose={() => setSubmitOpen(false)} aria-labelledby="submit-queue-title">
          <Dialog.Header id="submit-queue-title">Submit to Queue</Dialog.Header>
          <Box sx={{ p: 3 }}>
            <FormControl>
              <FormControl.Label>Select a Draft Visit</FormControl.Label>
              <Select value={selectedDraft} onChange={(e) => setSelectedDraft(e.target.value)} aria-label="Select a Draft Visit">
                <Select.Option value="">Select visit...</Select.Option>
                {drafts.map((d: Record<string, unknown>) => (
                  <Select.Option key={String(d.id)} value={String(d.id)}>{d.customId as string} - {d.petName as string} ({d.purpose as string})</Select.Option>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ p: 3, display: "flex", gap: 2, justifyContent: "flex-end", borderTop: "1px solid", borderColor: "border.default" }}>
            <Button onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={submitToQueue} disabled={!selectedDraft || updateMutation.isPending}>Submit</Button>
          </Box>
        </Dialog>
      )}
    </Box>
  )
}
