import { useState, useRef } from "react"
import { Link } from "react-router-dom"
import { useBills, useCreateBill, useUpdateBill } from "@/features/billing/api"
import { usePatients } from "@/features/patients/api"
import { useVisits } from "@/features/visits/api"
import { Box, Button, Dialog, FormControl, Heading, Label, Select, Text, TextInput } from "@primer/react"
import { DataTable, type Column } from "@primer/react/experimental"

type BillItem = { description: string; quantity: number; price: number; total?: number }

type BillRow = {
  id: string
  invoice: string
  pet: string
  owner: string
  date: string
  items: string
  total: string
  status: string
}

const billColumns: Column<BillRow>[] = [
  { header: "Invoice", field: "invoice", rowHeader: true },
  { header: "Pet", field: "pet" },
  { header: "Owner", field: "owner" },
  { header: "Date", field: "date" },
  { header: "Items", field: "items" },
  { header: "Total", field: "total" },
  { header: "Status", field: "status" },
]

const paymentOptions = ["Cash", "Card", "Insurance"] as const

export default function BillingPage() {
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [selectedBill, setSelectedBill] = useState<Record<string, unknown> | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  const { data: billsData, isLoading } = useBills({ limit: 100, status: filterStatus !== "all" ? filterStatus : undefined })
  const { data: petsData } = usePatients({ limit: 200 })
  const { data: visitsData } = useVisits({ limit: 200 })
  const createMutation = useCreateBill()
  const updateMutation = useUpdateBill()

  const bills = billsData?.data ?? []
  const pets = petsData?.data ?? []
  const visits = visitsData?.data ?? []
  const pendingVisits = visits.filter((v: Record<string, string>) => v.billingStatus === "Sent to Billing")

  const [form, setForm] = useState({
    visitId: "",
    petId: "",
    items: [{ description: "", quantity: 1, price: 0 }] as BillItem[],
  })

  const filtered = bills.filter((b: Record<string, string>) => {
    const q = search.toLowerCase()
    return (b.petName || "").toLowerCase().includes(q) || (b.ownerName || "").toLowerCase().includes(q) || (b.customId || "").toLowerCase().includes(q)
  })

  function addLineItem() { setForm({ ...form, items: [...form.items, { description: "", quantity: 1, price: 0 }] }) }
  function removeLineItem(i: number) { setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) }) }
  function updateLineItem(i: number, field: keyof BillItem, value: string | number) {
    const items = [...form.items]
    if (field === "description") { items[i] = { ...items[i], description: value as string } }
    else { const n = Number(value) || 0; items[i] = { ...items[i], [field]: n } }
    setForm({ ...form, items })
  }

  function handleCreate() {
    const pet = pets.find((p: Record<string, unknown>) => String(p.id) === form.petId)
    if (!pet) return
    createMutation.mutate({
      visitId: form.visitId && form.visitId !== "none" ? Number(form.visitId) : undefined,
      petId: Number(form.petId),
      petName: pet.name as string,
      ownerName: pet.ownerName as string,
      date: new Date().toISOString().slice(0, 10),
      items: form.items,
    }, {
      onSuccess: () => {
        setCreateOpen(false)
        setForm({ visitId: "", petId: "", items: [{ description: "", quantity: 1, price: 0 }] })
      },
    })
  }

  function handleVisitSelect(visitId: string) {
    if (visitId === "none") { setForm({ ...form, visitId: "none", petId: "" }); return }
    const visit = visits.find((v: Record<string, unknown>) => String(v.id) === visitId)
    if (visit) setForm({ ...form, visitId, petId: String(visit.petId) })
  }

  function handleMarkPaid(bill: Record<string, unknown>, method: string) {
    updateMutation.mutate({ id: bill.id as number, data: { status: "Paid", paymentMethod: method } }, {
      onSuccess: () => setSelectedBill({ ...bill, status: "Paid", paymentMethod: method }),
    })
  }

  function handlePrint() {
    const content = printRef.current
    if (!content) return
    const w = window.open("", "_blank")
    if (!w) return
    w.document.write(`<html><head><title>Invoice ${selectedBill?.customId}</title><style>body{font-family:system-ui,sans-serif;padding:40px;color:#1a1a2e}table{width:100%;border-collapse:collapse;margin:24px 0}th{background:#f0fdfa;padding:10px;text-align:left;font-size:13px;font-weight:600;border-bottom:2px solid #0d9488}td{padding:10px;font-size:13px;border-bottom:1px solid #e5e7eb}</style></head><body>${content.innerHTML}</body></html>`)
    w.document.close(); w.print()
  }

  const subtotal = form.items.reduce((s, i) => s + (i.quantity * i.price), 0)
  const tax = subtotal * 0.1

  const tableData: BillRow[] = filtered.map((bill: Record<string, unknown>) => {
    const items = Array.isArray(bill.items) ? bill.items : []
    return {
      id: String(bill.id),
      invoice: (bill.customId as string) || "",
      pet: (bill.petName as string) || "",
      owner: (bill.ownerName as string) || "",
      date: typeof bill.date === "string" ? bill.date.slice(0, 10) : "",
      items: String(items.length),
      total: `$${(bill.total as number || 0).toFixed(2)}`,
      status: (bill.status as string) || "",
    }
  })

  return (
    <Box sx={{ p: [3, 4] }}>
      <Box sx={{ display: "flex", flexDirection: ["column", "row"], alignItems: ["stretch", "center"], justifyContent: "space-between", gap: 3, mb: 4 }}>
        <Box>
          <Heading as="h2" sx={{ fontSize: 4 }}>Billing</Heading>
          <Text sx={{ fontSize: 1, color: "fg.muted" }}>Create and manage invoices for all services.</Text>
        </Box>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>Create Bill</Button>
      </Box>

      {pendingVisits.length > 0 && (
        <Box sx={{ mb: 3, border: "1px solid", borderColor: "accent.emphasis", borderRadius: 2, p: 3 }}>
          <Text sx={{ fontSize: 1, fontWeight: 600 }}>{pendingVisits.length} visit(s) sent for billing</Text>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 2 }}>
            {pendingVisits.map((v: Record<string, unknown>) => (
              <Link key={v.id as number} to={`/visits/${v.id}`}>
                <Label variant="accent">{v.customId as string} - {v.petName as string}</Label>
              </Link>
            ))}
          </Box>
        </Box>
      )}

      <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2, bg: "canvas.default" }}>
        <Box sx={{ p: 3, display: "flex", flexDirection: ["column", "row"], gap: 2, borderBottom: "1px solid", borderColor: "border.default" }}>
          <Box sx={{ flex: 1 }}>
            <FormControl>
              <FormControl.Label visuallyHidden>Search bills</FormControl.Label>
              <TextInput placeholder="Search by pet, owner, or bill ID..." value={search} onChange={(e) => setSearch(e.target.value)} block />
            </FormControl>
          </Box>
          <FormControl>
            <FormControl.Label visuallyHidden>Filter by status</FormControl.Label>
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filter by status">
              <Select.Option value="all">All statuses</Select.Option>
              <Select.Option value="Pending">Pending</Select.Option>
              <Select.Option value="Paid">Paid</Select.Option>
              <Select.Option value="Overdue">Overdue</Select.Option>
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ p: 3 }}>
          {isLoading ? <Text sx={{ color: "fg.muted" }}>Loading...</Text> : filtered.length === 0 ? (
            <Text sx={{ color: "fg.muted" }}>No bills found</Text>
          ) : (
            <>
              <DataTable
                aria-labelledby="bills-heading"
                data={tableData}
                columns={billColumns}
              />
              <span id="bills-heading" style={{ display: "none" }}>Bills</span>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 2 }}>
                {filtered.map((bill: Record<string, unknown>) => (
                  <Button key={String(bill.id)} size="small" variant="invisible" onClick={() => { setSelectedBill(bill); setViewOpen(true) }}>
                    View {bill.customId as string}
                  </Button>
                ))}
              </Box>
            </>
          )}
        </Box>
      </Box>

      {createOpen && (
        <Dialog onClose={() => setCreateOpen(false)} aria-labelledby="create-bill-title" sx={{ width: "large" }}>
          <Dialog.Header id="create-bill-title">Create New Bill</Dialog.Header>
          <Box sx={{ p: 3 }}>
            <FormControl sx={{ mb: 3 }}>
              <FormControl.Label>Source Visit (optional)</FormControl.Label>
              <Select value={form.visitId} onChange={(e) => handleVisitSelect(e.target.value)} aria-label="Source Visit">
                <Select.Option value="">Select visit</Select.Option>
                <Select.Option value="none">No linked visit</Select.Option>
                {pendingVisits.map((v: Record<string, unknown>) => (
                  <Select.Option key={String(v.id)} value={String(v.id)}>{v.customId as string} - {v.petName as string}</Select.Option>
                ))}
              </Select>
            </FormControl>
            <FormControl sx={{ mb: 3 }}>
              <FormControl.Label>Patient</FormControl.Label>
              <Select value={form.petId} onChange={(e) => setForm({ ...form, petId: e.target.value })} aria-label="Patient">
                <Select.Option value="">Select a patient</Select.Option>
                {pets.filter((p: Record<string, unknown>) => p.status === "Active").map((p: Record<string, unknown>) => (
                  <Select.Option key={String(p.id)} value={String(p.id)}>{p.name as string} ({p.ownerName as string})</Select.Option>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
              <FormControl.Label>Line Items</FormControl.Label>
              <Button size="small" onClick={addLineItem}>Add Item</Button>
            </Box>
            {form.items.map((item, i) => (
              <Box key={i} sx={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 2, mb: 2, alignItems: "end" }}>
                <FormControl>
                  <FormControl.Label>Description</FormControl.Label>
                  <TextInput placeholder="Service" value={item.description} onChange={(e) => updateLineItem(i, "description", e.target.value)} block />
                </FormControl>
                <FormControl>
                  <FormControl.Label>Qty</FormControl.Label>
                  <TextInput type="number" value={String(item.quantity)} onChange={(e) => updateLineItem(i, "quantity", e.target.value)} block />
                </FormControl>
                <FormControl>
                  <FormControl.Label>Price</FormControl.Label>
                  <TextInput type="number" value={String(item.price)} onChange={(e) => updateLineItem(i, "price", e.target.value)} block />
                </FormControl>
                <FormControl>
                  <FormControl.Label>Total</FormControl.Label>
                  <TextInput value={`$${(item.quantity * item.price).toFixed(2)}`} disabled block />
                </FormControl>
                <Box>{form.items.length > 1 && <Button size="small" variant="danger" onClick={() => removeLineItem(i)}>X</Button>}</Box>
              </Box>
            ))}
            <Box sx={{ mt: 3, borderTop: "1px solid", borderColor: "border.default", pt: 3, textAlign: "right" }}>
              <Text as="p" sx={{ fontSize: 1, color: "fg.muted" }}>Subtotal: ${subtotal.toFixed(2)}</Text>
              <Text as="p" sx={{ fontSize: 1, color: "fg.muted" }}>Tax (10%): ${tax.toFixed(2)}</Text>
              <Text as="p" sx={{ fontSize: 2, fontWeight: 600 }}>Total: ${(subtotal + tax).toFixed(2)}</Text>
            </Box>
          </Box>
          <Box sx={{ p: 3, display: "flex", gap: 2, justifyContent: "flex-end", borderTop: "1px solid", borderColor: "border.default" }}>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={!form.petId || form.items.some(i => !i.description || i.price <= 0) || createMutation.isPending}>Create Bill</Button>
          </Box>
        </Dialog>
      )}

      {viewOpen && selectedBill && (
        <Dialog onClose={() => setViewOpen(false)} aria-labelledby="view-bill-title" sx={{ width: "large" }}>
          <Dialog.Header id="view-bill-title">Invoice {selectedBill.customId as string}</Dialog.Header>
          <Box sx={{ p: 3 }}>
            <Box sx={{ mb: 2 }}>
              <Label variant={selectedBill.status === "Paid" ? "success" : selectedBill.status === "Overdue" ? "danger" : "attention"}>{selectedBill.status as string}</Label>
            </Box>
            <div ref={printRef}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24, borderBottom: "2px solid #0d9488", paddingBottom: 12 }}>
                <div><div style={{ fontSize: 20, fontWeight: 700, color: "#0d9488" }}>VetCare Clinic</div><div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>123 Animal Care Blvd</div></div>
                <div style={{ textAlign: "right", fontSize: 13 }}><div style={{ fontWeight: 600 }}>Invoice #{selectedBill.customId as string}</div><div style={{ color: "#666" }}>Date: {typeof selectedBill.date === "string" ? selectedBill.date.slice(0, 10) : ""}</div></div>
              </div>
              <div style={{ marginBottom: 20 }}><p style={{ fontSize: 12, color: "#999", textTransform: "uppercase" }}>Bill To</p><p style={{ fontWeight: 600, fontSize: 14 }}>{selectedBill.ownerName as string}</p><p style={{ fontSize: 13, color: "#666" }}>Patient: {selectedBill.petName as string}</p></div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={{ background: "#f0fdfa", padding: 10, textAlign: "left", fontSize: 13, fontWeight: 600, borderBottom: "2px solid #0d9488" }}>Description</th><th style={{ background: "#f0fdfa", padding: 10, textAlign: "center", fontSize: 13, fontWeight: 600, borderBottom: "2px solid #0d9488" }}>Qty</th><th style={{ background: "#f0fdfa", padding: 10, textAlign: "right", fontSize: 13, fontWeight: 600, borderBottom: "2px solid #0d9488" }}>Price</th><th style={{ background: "#f0fdfa", padding: 10, textAlign: "right", fontSize: 13, fontWeight: 600, borderBottom: "2px solid #0d9488" }}>Total</th></tr></thead>
                <tbody>{(Array.isArray(selectedBill.items) ? selectedBill.items : []).map((item: Record<string, unknown>, i: number) => (<tr key={i}><td style={{ padding: 10, fontSize: 13, borderBottom: "1px solid #e5e7eb" }}>{item.description as string}</td><td style={{ padding: 10, fontSize: 13, textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>{item.quantity as number}</td><td style={{ padding: 10, fontSize: 13, textAlign: "right", borderBottom: "1px solid #e5e7eb" }}>${(item.price as number || 0).toFixed(2)}</td><td style={{ padding: 10, fontSize: 13, textAlign: "right", borderBottom: "1px solid #e5e7eb" }}>${((item.quantity as number || 0) * (item.price as number || 0)).toFixed(2)}</td></tr>))}</tbody>
              </table>
              <div style={{ textAlign: "right", marginTop: 16 }}>
                <p style={{ margin: "4px 0", fontSize: 14 }}>Subtotal: ${(selectedBill.subtotal as number || 0).toFixed(2)}</p>
                <p style={{ margin: "4px 0", fontSize: 14 }}>Tax: ${(selectedBill.tax as number || 0).toFixed(2)}</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: "#0d9488", marginTop: 8 }}>Total: ${(selectedBill.total as number || 0).toFixed(2)}</p>
              </div>
              {typeof selectedBill.paymentMethod === "string" && selectedBill.paymentMethod !== "" ? <p style={{ fontSize: 13, color: "#666", marginTop: 12 }}>Payment Method: {selectedBill.paymentMethod}</p> : null}
            </div>
          </Box>
          <Box sx={{ p: 3, display: "flex", gap: 2, justifyContent: "flex-end", borderTop: "1px solid", borderColor: "border.default" }}>
            {selectedBill.status !== "Paid" && (
              <Box sx={{ display: "flex", gap: 2 }}>
                {paymentOptions.map(method => (<Button key={method} size="small" onClick={() => handleMarkPaid(selectedBill, method)}>Pay ({method})</Button>))}
              </Box>
            )}
            <Button variant="primary" onClick={handlePrint}>Print</Button>
          </Box>
        </Dialog>
      )}
    </Box>
  )
}
