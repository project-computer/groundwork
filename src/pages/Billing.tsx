import { useState, useRef } from "react"
import {
  getBills,
  addBill,
  updateBill,
  getPets,
  getVisitsByBillingStatus,
  getVisits,
  getNextBillId,
  createBillFromVisit,
  getTodayISO,
} from "@/lib/store"
import type { Bill, BillItem, Pet } from "@/lib/store"
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

const statusColors: Record<string, string> = {
  Pending: "bg-warning/10 text-warning border-warning/20",
  Paid: "bg-success/10 text-success border-success/20",
  Overdue: "bg-destructive/10 text-destructive border-destructive/20",
}
const paymentOptions = ["Cash", "Card", "Insurance"] as const

export default function BillingPage() {
  const [bills, setBills] = useState(getBills())
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const pets = getPets()
  const pendingVisits = getVisitsByBillingStatus("Sent to Billing")
  const visits = getVisits()

  const [form, setForm] = useState({
    visitId: "",
    petId: "",
    items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }] as BillItem[],
  })

  const filtered = bills.filter((b) => {
    const q = search.toLowerCase()
    const matchesSearch = b.petName.toLowerCase().includes(q) || b.ownerName.toLowerCase().includes(q) || b.id.toLowerCase().includes(q)
    const matchesStatus = filterStatus === "all" || b.status === filterStatus
    return matchesSearch && matchesStatus
  })

  function addLineItem() { setForm({ ...form, items: [...form.items, { description: "", quantity: 1, unitPrice: 0, total: 0 }] }) }
  function removeLineItem(i: number) { setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) }) }
  function updateLineItem(i: number, field: keyof BillItem, value: string | number) {
    const items = [...form.items]
    if (field === "description") { items[i] = { ...items[i], description: value as string } }
    else { const n = Number(value) || 0; items[i] = { ...items[i], [field]: n }; items[i].total = items[i].quantity * items[i].unitPrice }
    setForm({ ...form, items })
  }

  function handleCreate() {
    const pet = pets.find((p: Pet) => p.id === form.petId)
    if (!pet) return
    const subtotal = form.items.reduce((s, i) => s + i.total, 0)
    const tax = subtotal * 0.1
    const newBill: Bill = {
      id: getNextBillId(),
      visitId: form.visitId && form.visitId !== "none" ? form.visitId : undefined,
      petId: form.petId, petName: pet.name, ownerName: pet.ownerName,
      date: getTodayISO(), items: form.items,
      subtotal, tax, total: subtotal + tax, status: "Pending",
    }
    addBill(newBill)
    setBills(getBills())
    setCreateOpen(false)
    setForm({ visitId: "", petId: "", items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }] })
  }

  function handleCreateFromVisit(visitId: string) {
    createBillFromVisit(visitId)
    setBills(getBills())
  }

  function handleVisitSelect(visitId: string) {
    if (visitId === "none") {
      setForm({ ...form, visitId: "none", petId: "" })
      return
    }
    const visit = visits.find((v) => v.id === visitId)
    if (!visit) {
      setForm({ ...form, visitId, petId: "" })
      return
    }
    setForm({
      ...form,
      visitId,
      petId: visit.petId,
    })
  }

  function handleMarkPaid(bill: Bill, method: Bill["paymentMethod"]) {
    updateBill(bill.id, { status: "Paid", paymentMethod: method })
    setBills(getBills())
    setSelectedBill(getBills().find(b => b.id === bill.id) || null)
  }

  function handlePrint() {
    const content = printRef.current
    if (!content) return
    const printWindow = window.open("", "_blank")
    if (!printWindow) return
    printWindow.document.write(`<html><head><title>Invoice ${selectedBill?.id}</title><style>
      body { font-family: system-ui, sans-serif; padding: 40px; color: #1a1a2e; }
      table { width: 100%; border-collapse: collapse; margin: 24px 0; }
      th { background: #f0fdfa; padding: 10px; text-align: left; font-size: 13px; font-weight: 600; border-bottom: 2px solid #0d9488; }
      td { padding: 10px; font-size: 13px; border-bottom: 1px solid #e5e7eb; }
    </style></head><body>${content.innerHTML}</body></html>`)
    printWindow.document.close()
    printWindow.print()
  }

  const subtotal = form.items.reduce((s, i) => s + i.total, 0)
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
              {pendingVisits.map(v => (
                <div key={v.id} className="flex items-center gap-2">
                  <Link to={`/visits/${v.id}`}>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 cursor-pointer hover:bg-primary/20">
                      {v.id} - {v.petName}
                    </Badge>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() => handleCreateFromVisit(v.id)}
                  >
                    Bill Now
                  </Button>
                </div>
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
                filtered.map(bill => (
                  <TableRow key={bill.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{bill.id}</TableCell>
                    <TableCell className="font-medium text-foreground">{bill.petName}</TableCell>
                    <TableCell className="hidden sm:table-cell">{bill.ownerName}</TableCell>
                    <TableCell>{bill.date}</TableCell>
                    <TableCell className="hidden md:table-cell">{bill.items.length}</TableCell>
                    <TableCell className="font-semibold text-foreground">${bill.total.toFixed(2)}</TableCell>
                    <TableCell><Badge variant="outline" className={statusColors[bill.status] || ""}>{bill.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedBill(bill); setViewOpen(true) }} className="text-primary hover:text-primary"><Eye className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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
                <SelectTrigger><SelectValue placeholder="Select visit sent to billing" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked visit</SelectItem>
                  {pendingVisits.map((visit) => (
                    <SelectItem key={visit.id} value={visit.id}>
                      {visit.id} - {visit.petName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 mb-4">
              <Label>Patient</Label>
              <Select value={form.petId} onValueChange={(v) => setForm({ ...form, petId: v })}>
                <SelectTrigger><SelectValue placeholder="Select a patient" /></SelectTrigger>
                <SelectContent>{pets.filter((p: Pet) => p.status === "Active").map((p: Pet) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.ownerName})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between"><Label>Line Items</Label><Button variant="outline" size="sm" onClick={addLineItem}><Plus className="w-3 h-3 mr-1" /> Add Item</Button></div>
              {form.items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">{i === 0 && <Label className="text-xs text-muted-foreground mb-1">Description</Label>}<Input placeholder="Service" value={item.description} onChange={(e) => updateLineItem(i, "description", e.target.value)} /></div>
                  <div className="col-span-2">{i === 0 && <Label className="text-xs text-muted-foreground mb-1">Qty</Label>}<Input type="number" min={1} value={item.quantity} onChange={(e) => updateLineItem(i, "quantity", e.target.value)} /></div>
                  <div className="col-span-2">{i === 0 && <Label className="text-xs text-muted-foreground mb-1">Price</Label>}<Input type="number" min={0} value={item.unitPrice} onChange={(e) => updateLineItem(i, "unitPrice", e.target.value)} /></div>
                  <div className="col-span-2">{i === 0 && <Label className="text-xs text-muted-foreground mb-1">Total</Label>}<Input value={`$${item.total.toFixed(2)}`} disabled className="bg-muted" /></div>
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
            <Button onClick={handleCreate} disabled={!form.petId || form.items.some(i => !i.description || i.unitPrice <= 0)} className="bg-primary text-primary-foreground hover:bg-primary/90">Create Bill</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Invoice {selectedBill?.id}
              {selectedBill && <Badge variant="outline" className={statusColors[selectedBill.status] || ""}>{selectedBill.status}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {selectedBill && (
            <>
              <div ref={printRef}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24, borderBottom: "2px solid #0d9488", paddingBottom: 12 }}>
                  <div><div style={{ fontSize: 20, fontWeight: 700, color: "#0d9488" }}>VetCare Clinic</div><div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>123 Animal Care Blvd</div></div>
                  <div style={{ textAlign: "right", fontSize: 13 }}><div style={{ fontWeight: 600 }}>Invoice #{selectedBill.id}</div><div style={{ color: "#666" }}>Date: {selectedBill.date}</div></div>
                </div>
                <div style={{ marginBottom: 20 }}><p style={{ fontSize: 12, color: "#999", textTransform: "uppercase" }}>Bill To</p><p style={{ fontWeight: 600, fontSize: 14 }}>{selectedBill.ownerName}</p><p style={{ fontSize: 13, color: "#666" }}>Patient: {selectedBill.petName}</p></div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={{ background: "#f0fdfa", padding: 10, textAlign: "left", fontSize: 13, fontWeight: 600, borderBottom: "2px solid #0d9488" }}>Description</th><th style={{ background: "#f0fdfa", padding: 10, textAlign: "center", fontSize: 13, fontWeight: 600, borderBottom: "2px solid #0d9488" }}>Qty</th><th style={{ background: "#f0fdfa", padding: 10, textAlign: "right", fontSize: 13, fontWeight: 600, borderBottom: "2px solid #0d9488" }}>Price</th><th style={{ background: "#f0fdfa", padding: 10, textAlign: "right", fontSize: 13, fontWeight: 600, borderBottom: "2px solid #0d9488" }}>Total</th></tr></thead>
                  <tbody>{selectedBill.items.map((item, i) => (<tr key={i}><td style={{ padding: 10, fontSize: 13, borderBottom: "1px solid #e5e7eb" }}>{item.description}</td><td style={{ padding: 10, fontSize: 13, textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>{item.quantity}</td><td style={{ padding: 10, fontSize: 13, textAlign: "right", borderBottom: "1px solid #e5e7eb" }}>${item.unitPrice.toFixed(2)}</td><td style={{ padding: 10, fontSize: 13, textAlign: "right", borderBottom: "1px solid #e5e7eb" }}>${item.total.toFixed(2)}</td></tr>))}</tbody>
                </table>
                <div style={{ textAlign: "right", marginTop: 16 }}>
                  <p style={{ margin: "4px 0", fontSize: 14 }}>Subtotal: ${selectedBill.subtotal.toFixed(2)}</p>
                  <p style={{ margin: "4px 0", fontSize: 14 }}>Tax: ${selectedBill.tax.toFixed(2)}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: "#0d9488", marginTop: 8 }}>Total: ${selectedBill.total.toFixed(2)}</p>
                </div>
                {selectedBill.paymentMethod && <p style={{ fontSize: 13, color: "#666", marginTop: 12 }}>Payment Method: {selectedBill.paymentMethod}</p>}
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
