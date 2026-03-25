import { useState, useRef } from "react"
import { useBills, useCreateBill, useUpdateBill, usePatients, useVisits } from "@/hooks/use-queries"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Plus, Search, Receipt, Eye, Printer, Trash2, AlertCircle } from "lucide-react"
import { Link } from "react-router-dom"

type BillItem = { description: string; quantity: number; price: number; total?: number }

const statusColors: Record<string, string> = {
  Pending: "bg-warning/10 text-warning border-warning/20",
  Paid: "bg-success/10 text-success border-success/20",
  Overdue: "bg-destructive/10 text-destructive border-destructive/20",
}
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

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground text-balance">Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage invoices for all services.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" /> Create Bill
        </Button>
      </div>

      {pendingVisits.length > 0 && (
        <div className="mb-4 bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">{pendingVisits.length} visit(s) sent for billing</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {pendingVisits.map((v: Record<string, unknown>) => (
                <Link key={v.id as number} to={`/visits/${v.id}`}>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 cursor-pointer hover:bg-primary/20">
                    {v.customId as string} - {v.petName as string}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by pet, owner, or bill ID..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="Pending">Pending</SelectItem><SelectItem value="Paid">Paid</SelectItem><SelectItem value="Overdue">Overdue</SelectItem></SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="text-center py-8 text-muted-foreground">Loading...</div> : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Invoice</TableHead><TableHead>Pet</TableHead><TableHead className="hidden sm:table-cell">Owner</TableHead>
                  <TableHead>Date</TableHead><TableHead className="hidden md:table-cell">Items</TableHead><TableHead>Total</TableHead>
                  <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8"><div className="flex flex-col items-center gap-2 text-muted-foreground"><Receipt className="w-8 h-8" /><p>No bills found</p></div></TableCell></TableRow>
                ) : (
                  filtered.map((bill: Record<string, unknown>) => {
                    const items = Array.isArray(bill.items) ? bill.items : []
                    return (
                      <TableRow key={bill.id as number}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{bill.customId as string}</TableCell>
                        <TableCell className="font-medium text-foreground">{bill.petName as string}</TableCell>
                        <TableCell className="hidden sm:table-cell">{bill.ownerName as string}</TableCell>
                        <TableCell>{typeof bill.date === "string" ? bill.date.slice(0, 10) : ""}</TableCell>
                        <TableCell className="hidden md:table-cell">{items.length}</TableCell>
                        <TableCell className="font-semibold text-foreground">${(bill.total as number || 0).toFixed(2)}</TableCell>
                        <TableCell><Badge variant="outline" className={statusColors[bill.status as string] || ""}>{bill.status as string}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedBill(bill); setViewOpen(true) }} className="text-primary hover:text-primary"><Eye className="w-4 h-4" /></Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create New Bill</DialogTitle></DialogHeader>
          <div className="py-4">
            <div className="flex flex-col gap-2 mb-4">
              <Label>Source Visit (optional)</Label>
              <Select value={form.visitId} onValueChange={handleVisitSelect}>
                <SelectTrigger><SelectValue placeholder="Select visit" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked visit</SelectItem>
                  {pendingVisits.map((v: Record<string, unknown>) => <SelectItem key={String(v.id)} value={String(v.id)}>{v.customId as string} - {v.petName as string}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 mb-4">
              <Label>Patient</Label>
              <Select value={form.petId} onValueChange={(v) => setForm({ ...form, petId: v })}>
                <SelectTrigger><SelectValue placeholder="Select a patient" /></SelectTrigger>
                <SelectContent>{pets.filter((p: Record<string, unknown>) => p.status === "Active").map((p: Record<string, unknown>) => <SelectItem key={String(p.id)} value={String(p.id)}>{p.name as string} ({p.ownerName as string})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between"><Label>Line Items</Label><Button variant="outline" size="sm" onClick={addLineItem}><Plus className="w-3 h-3 mr-1" /> Add Item</Button></div>
              {form.items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">{i === 0 && <Label className="text-xs text-muted-foreground mb-1">Description</Label>}<Input placeholder="Service" value={item.description} onChange={(e) => updateLineItem(i, "description", e.target.value)} /></div>
                  <div className="col-span-2">{i === 0 && <Label className="text-xs text-muted-foreground mb-1">Qty</Label>}<Input type="number" min={1} value={item.quantity} onChange={(e) => updateLineItem(i, "quantity", e.target.value)} /></div>
                  <div className="col-span-2">{i === 0 && <Label className="text-xs text-muted-foreground mb-1">Price</Label>}<Input type="number" min={0} value={item.price} onChange={(e) => updateLineItem(i, "price", e.target.value)} /></div>
                  <div className="col-span-2">{i === 0 && <Label className="text-xs text-muted-foreground mb-1">Total</Label>}<Input value={`$${(item.quantity * item.price).toFixed(2)}`} disabled className="bg-muted" /></div>
                  <div className="col-span-1">{form.items.length > 1 && <Button variant="ghost" size="sm" onClick={() => removeLineItem(i)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 border-t border-border pt-4 text-right">
              <p className="text-sm text-muted-foreground">Subtotal: <span className="text-foreground font-medium">${subtotal.toFixed(2)}</span></p>
              <p className="text-sm text-muted-foreground">Tax (10%): <span className="text-foreground font-medium">${tax.toFixed(2)}</span></p>
              <p className="text-lg font-semibold text-foreground mt-1">Total: ${(subtotal + tax).toFixed(2)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.petId || form.items.some(i => !i.description || i.price <= 0) || createMutation.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">Create Bill</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Invoice {selectedBill?.customId}
              {selectedBill && <Badge variant="outline" className={statusColors[selectedBill.status as string] || ""}>{selectedBill.status as string}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {selectedBill && (
            <>
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
                {selectedBill.paymentMethod && <p style={{ fontSize: 13, color: "#666", marginTop: 12 }}>Payment Method: {selectedBill.paymentMethod as string}</p>}
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                {selectedBill.status !== "Paid" && (
                  <div className="flex gap-2">{paymentOptions.map(method => (<Button key={method} variant="outline" size="sm" onClick={() => handleMarkPaid(selectedBill, method)} className="text-success hover:text-success">Pay ({method})</Button>))}</div>
                )}
                <Button onClick={handlePrint} variant="outline" className="text-primary hover:text-primary"><Printer className="w-4 h-4 mr-2" /> Print</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
