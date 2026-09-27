import { useMemo, useState } from "react"
import { useVisits } from "@/features/visits/api"
import { Box, FormControl, Heading, Label, Text, TextInput, UnderlineNav } from "@primer/react"
import { DataTable, type Column } from "@primer/react/experimental"

type Row = Record<string, unknown>

type RecordRow = {
  id: string
  customId: string
  petName: string
  ownerName: string
  date: string
  vet: string
  diagnosis: string
  status: string
}

const statusVariant = (s: string) => {
  switch (s) {
    case "Done": return "success" as const
    case "In Examination": return "accent" as const
    case "Waiting": return "attention" as const
    case "Cancelled": return "danger" as const
    default: return "default" as const
  }
}

const columns: Column<RecordRow>[] = [
  { header: "ID", field: "customId", rowHeader: true },
  { header: "Pet", field: "petName" },
  { header: "Owner", field: "ownerName" },
  { header: "Date", field: "date" },
  { header: "Vet", field: "vet" },
  { header: "Diagnosis", field: "diagnosis" },
  { header: "Status", field: "status" },
]

export default function MedicalRecordsPage() {
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<"opd" | "ipd">("opd")
  const { data: visitsData } = useVisits({ limit: 200 })
  const visits = visitsData?.data ?? []

  const opdRecords = useMemo(() => visits.filter((v: Record<string, string>) => v.type === "OPD"), [visits])
  const ipdRecords = useMemo(() => visits.filter((v: Record<string, string>) => v.type === "IPD"), [visits])

  function matches(r: Record<string, string>, q: string) {
    return (
      (r.customId || "").toLowerCase().includes(q) ||
      (r.petName || "").toLowerCase().includes(q) ||
      (r.ownerName || "").toLowerCase().includes(q) ||
      (r.finalDiagnosis || "").toLowerCase().includes(q) ||
      (r.assignedVetName || "").toLowerCase().includes(q)
    )
  }

  const filteredOpd = useMemo(() => opdRecords.filter((r: Record<string, string>) => matches(r, search.toLowerCase())), [opdRecords, search])
  const filteredIpd = useMemo(() => ipdRecords.filter((r: Record<string, string>) => matches(r, search.toLowerCase())), [ipdRecords, search])

  function toRows(records: Row[]): RecordRow[] {
    return records.map((r) => ({
      id: String(r.id),
      customId: (r.customId as string) || "",
      petName: (r.petName as string) || "",
      ownerName: (r.ownerName as string) || "",
      date: typeof r.createdAt === "string" ? r.createdAt.slice(0, 10) : "",
      vet: (r.assignedVetName as string) || "-",
      diagnosis: (r.finalDiagnosis as string) || "-",
      status: (r.status as string) || "",
    }))
  }

  const rows = tab === "opd" ? toRows(filteredOpd) : toRows(filteredIpd)

  return (
    <Box sx={{ p: [3, 4] }}>
      <Box sx={{ mb: 4 }}>
        <Heading as="h2" sx={{ fontSize: 4 }}>Medical Records</Heading>
        <Text sx={{ fontSize: 1, color: "fg.muted" }}>Clinical OPD and IPD history for all patients.</Text>
      </Box>

      <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2, bg: "canvas.default" }}>
        <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "border.default" }}>
          <FormControl>
            <FormControl.Label visuallyHidden>Search records</FormControl.Label>
            <TextInput
              placeholder="Search by ID, pet, owner, diagnosis, or vet..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              block
            />
          </FormControl>
        </Box>
        <Box sx={{ px: 3, pt: 2 }}>
          <UnderlineNav aria-label="Record type">
            <UnderlineNav.Item aria-current={tab === "opd" ? "page" : undefined} onSelect={() => setTab("opd")}>
              OPD ({filteredOpd.length})
            </UnderlineNav.Item>
            <UnderlineNav.Item aria-current={tab === "ipd" ? "page" : undefined} onSelect={() => setTab("ipd")}>
              IPD ({filteredIpd.length})
            </UnderlineNav.Item>
          </UnderlineNav>
        </Box>
        <Box sx={{ p: 3 }}>
          {rows.length === 0 ? (
            <Text sx={{ color: "fg.muted", fontSize: 1 }}>{tab === "opd" ? "No OPD records found" : "No IPD records found"}</Text>
          ) : (
            <DataTable aria-labelledby="records-heading" aria-describedby="records-desc" data={rows} columns={columns} />
          )}
          <Box sx={{ display: "none" }}><span id="records-heading">Records</span><span id="records-desc">Clinical history</span></Box>
          {rows.length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 2 }}>
              {(tab === "opd" ? filteredOpd : filteredIpd).slice(0, 5).map((r: Row) => (
                <Label key={String(r.id)} variant={statusVariant(r.status as string)}>{r.status as string}</Label>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}
