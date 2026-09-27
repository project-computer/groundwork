import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useVisits, useCreateVisit, useDuplicateVisit } from "@/features/visits/api"
import { usePatients } from "@/features/patients/api"
import { Box, Button, Label, TextInput, Select, FormControl, Dialog, Heading, Text } from "@primer/react"
import { DataTable } from "@primer/react/experimental"
import { Plus, Search, ClipboardPlus, Eye, Copy } from "lucide-react"

const statusVariant: Record<string, "default" | "primary" | "success" | "danger" | "attention"> = {
  Draft: "default",
  Waiting: "attention",
  "In Examination": "primary",
  Done: "success",
  Cancelled: "danger",
}
const billingVariant: Record<string, "default" | "success" | "attention"> = {
  "Not Sent": "default",
  "Sent to Billing": "attention",
  Billed: "success",
}
const vets = ["Dr. Williams", "Dr. Martinez"]

type Rec = Record<string, unknown> & { id: string | number }

export default function VisitsPage() {
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterBilling, setFilterBilling] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const navigate = useNavigate()

  const { data: visitsData, isLoading } = useVisits({
    limit: 100,
    status: filterStatus !== "all" ? filterStatus : undefined,
  })
  const { data: petsData } = usePatients({ limit: 200 })
  const createMutation = useCreateVisit()
  const duplicateMutation = useDuplicateVisit()

  const visits = (visitsData?.data ?? []) as Rec[]
  const pets = (petsData?.data ?? []) as Rec[]

  const [form, setForm] = useState({ petId: "", type: "OPD", purpose: "Full", assignedVetName: vets[0] })

  const filtered = visits.filter((v) => {
    const q = search.toLowerCase()
    const matchesSearch =
      String(v.petName ?? "").toLowerCase().includes(q) ||
      String(v.ownerName ?? "").toLowerCase().includes(q) ||
      String(v.customId ?? "").toLowerCase().includes(q)
    const matchesBilling = filterBilling === "all" || v.billingStatus === filterBilling
    return matchesSearch && matchesBilling
  })

  function handleCreate() {
    const pet = pets.find((p) => String(p.id) === form.petId)
    if (!pet) return
    createMutation.mutate({
      petId: Number(form.petId),
      petName: pet.name as string,
      ownerName: pet.ownerName as string,
      type: form.type,
      purpose: form.purpose,
      assignedVetName: form.assignedVetName,
    }, {
      onSuccess: (data: { id?: number; data?: { id?: number } }) => {
        setDialogOpen(false)
        navigate(`/visits/${data?.id || data?.data?.id}`)
      },
    })
  }

  function handleDuplicate(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    duplicateMutation.mutate(id, {
      onSuccess: (data: { id?: number; data?: { id?: number } }) => navigate(`/visits/${data?.id || data?.data?.id}`),
    })
  }

  return (
    <Box sx={{ p: [3, 4] }}>
      <Box sx={{ display: "flex", flexDirection: ["column", "row"], alignItems: ["stretch", "center"], justifyContent: "space-between", gap: 3, mb: 4 }}>
        <Box>
          <Heading as="h2" sx={{ fontSize: 4 }}>Visits</Heading>
          <Text as="p" sx={{ fontSize: 1, color: "fg.muted", mt: 1 }}>Manage patient visits and case workflows.</Text>
        </Box>
        <Button variant="primary" onClick={() => setDialogOpen(true)} leadingVisual={() => <Plus size={16} />}>New Visit</Button>
      </Box>

      <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 3, display: "flex", flexDirection: ["column", "row"], gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <TextInput
              placeholder="Search by pet, owner, vet, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              trailingVisual={() => <Search size={16} />}
              block
              aria-label="Search visits"
            />
          </Box>
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filter by status">
            <Select.Option value="all">All statuses</Select.Option>
            {["Draft", "Waiting", "In Examination", "Done", "Cancelled"].map((s) => <Select.Option key={s} value={s}>{s}</Select.Option>)}
          </Select>
          <Select value={filterBilling} onChange={(e) => setFilterBilling(e.target.value)} aria-label="Filter by billing">
            <Select.Option value="all">All billing</Select.Option>
            {["Not Sent", "Sent to Billing", "Billed"].map((s) => <Select.Option key={s} value={s}>{s}</Select.Option>)}
          </Select>
        </Box>
        <Box sx={{ overflowX: "auto" }}>
          {isLoading ? (
            <Text as="p" sx={{ textAlign: "center", py: 4, color: "fg.muted" }}>Loading...</Text>
          ) : filtered.length === 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, py: 4, color: "fg.muted" }}>
              <ClipboardPlus size={32} /><Text>No visits found</Text>
            </Box>
          ) : (
            <DataTable
              aria-label="Visits"
              data={filtered}
              columns={[
                { header: "ID", field: "customId", rowHeader: true, renderCell: (row: Rec) => <Text sx={{ fontFamily: "mono", fontSize: 0, color: "fg.muted" }}>{String(row.customId ?? "")}</Text> },
                { header: "Pet", field: "petName", renderCell: (row: Rec) => <Text sx={{ fontWeight: "bold" }}>{String(row.petName ?? "")}</Text> },
                { header: "Owner", field: "ownerName", renderCell: (row: Rec) => <Text>{String(row.ownerName ?? "")}</Text> },
                { header: "Type", field: "type", renderCell: (row: Rec) => <Label variant="default">{String(row.type ?? "")}</Label> },
                { header: "Purpose", field: "purpose", renderCell: (row: Rec) => <Text sx={{ fontSize: 1, color: "fg.muted" }}>{String(row.purpose ?? "")}</Text> },
                { header: "Vet", field: "assignedVetName", renderCell: (row: Rec) => <Text sx={{ fontSize: 1, color: "fg.muted" }}>{String(row.assignedVetName ?? "") || "-"}</Text> },
                { header: "Status", field: "status", renderCell: (row: Rec) => <Label variant={statusVariant[String(row.status)] ?? "default"}>{String(row.status ?? "")}</Label> },
                { header: "Billing", field: "billingStatus", renderCell: (row: Rec) => <Label variant={billingVariant[String(row.billingStatus)] ?? "default"}>{String(row.billingStatus ?? "")}</Label> },
                {
                  header: "Actions", field: "actions",
                  renderCell: (row: Rec) => (
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1 }}>
                      <Button variant="invisible" size="small" onClick={(e) => { e.stopPropagation(); navigate(`/visits/${row.id}`) }} leadingVisual={() => <Eye size={16} />} aria-label="View visit" />
                      <Button variant="invisible" size="small" onClick={(e) => handleDuplicate(row.id as number, e)} leadingVisual={() => <Copy size={16} />} aria-label="Duplicate visit" />
                    </Box>
                  ),
                },
              ]}
            />
          )}
        </Box>
      </Box>

      {dialogOpen && (
        <Dialog onClose={() => setDialogOpen(false)} aria-labelledby="new-visit-title" sx={{ width: "large" }}>
          <Dialog.Header id="new-visit-title">New Visit</Dialog.Header>
          <Box sx={{ p: 3, display: "grid", gridTemplateColumns: ["1fr", "1fr 1fr"], gap: 3 }}>
            <Box sx={{ gridColumn: ["auto", "1 / -1"] }}>
              <FormControl>
                <FormControl.Label>Patient</FormControl.Label>
                <Select value={form.petId} onChange={(e) => setForm({ ...form, petId: e.target.value })} aria-label="Patient" block>
                  <Select.Option value="">Select a patient</Select.Option>
                  {pets.filter((p) => p.status === "Active").map((p) => <Select.Option key={String(p.id)} value={String(p.id)}>{String(p.name)} ({String(p.ownerName)})</Select.Option>)}
                </Select>
              </FormControl>
            </Box>
            <FormControl>
              <FormControl.Label>Type</FormControl.Label>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} aria-label="Type" block>
                <Select.Option value="OPD">OPD</Select.Option>
                <Select.Option value="IPD">IPD</Select.Option>
              </Select>
            </FormControl>
            <FormControl>
              <FormControl.Label>Purpose</FormControl.Label>
              <Select value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} aria-label="Purpose" block>
                <Select.Option value="Full">Full</Select.Option>
                <Select.Option value="History Only">History Only</Select.Option>
                <Select.Option value="Pharmacy Only">Pharmacy Only</Select.Option>
                <Select.Option value="Appointment Only">Appointment Only</Select.Option>
              </Select>
            </FormControl>
            <Box sx={{ gridColumn: ["auto", "1 / -1"] }}>
              <FormControl>
                <FormControl.Label>Assigned Vet</FormControl.Label>
                <Select value={form.assignedVetName} onChange={(e) => setForm({ ...form, assignedVetName: e.target.value })} aria-label="Assigned vet" block>
                  {vets.map((v) => <Select.Option key={v} value={v}>{v}</Select.Option>)}
                </Select>
              </FormControl>
            </Box>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, p: 3, borderTop: "1px solid", borderColor: "border.default" }}>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={!form.petId || createMutation.isPending}>Create Visit</Button>
          </Box>
        </Dialog>
      )}
    </Box>
  )
}
