import { useState } from "react"
import { usePatients, useCreatePatient, useUpdatePatient } from "@/hooks/use-queries"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Plus, Search, PawPrint } from "lucide-react"

const speciesOptions = ["Dog", "Cat", "Bird", "Rabbit", "Reptile", "Other"] as const

const emptyForm = {
  name: "", species: "Dog", breed: "", age: "", weight: "",
  ownerName: "", ownerPhone: "", ownerEmail: "", ownerNationalId: "", ownerNotes: "", ownerLabel: "",
  status: "Active",
}

export default function PatientsPage() {
  const [search, setSearch] = useState("")
  const [filterSpecies, setFilterSpecies] = useState("all")
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...emptyForm })

  const { data, isLoading } = usePatients({
    page,
    limit: 50,
    search: search || undefined,
    species: filterSpecies !== "all" ? filterSpecies : undefined,
  })
  const createMutation = useCreatePatient()
  const updateMutation = useUpdatePatient()

  const pets = data?.data ?? []

  function openAdd() {
    setEditingId(null)
    setForm({ ...emptyForm })
    setDialogOpen(true)
  }

  function openEdit(pet: Record<string, unknown>) {
    setEditingId(pet.id as number)
    setForm({
      name: (pet.name as string) || "",
      species: (pet.species as string) || "Dog",
      breed: (pet.breed as string) || "",
      age: pet.age ? String(pet.age) : "",
      weight: pet.weight ? String(pet.weight) : "",
      ownerName: (pet.ownerName as string) || "",
      ownerPhone: (pet.ownerPhone as string) || "",
      ownerEmail: (pet.ownerEmail as string) || "",
      ownerNationalId: (pet.ownerNationalId as string) || "",
      ownerNotes: (pet.ownerNotes as string) || "",
      ownerLabel: (pet.ownerLabel as string) || "",
      status: (pet.status as string) || "Active",
    })
    setDialogOpen(true)
  }

  function handleSave() {
    const payload = {
      name: form.name,
      species: form.species,
      breed: form.breed,
      age: Number(form.age) || 0,
      weight: Number(form.weight) || 0,
      ownerName: form.ownerName,
      ownerPhone: form.ownerPhone,
      ownerEmail: form.ownerEmail,
      ownerNationalId: form.ownerNationalId,
      ownerNotes: form.ownerNotes,
      ownerLabel: form.ownerLabel,
      status: form.status,
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload }, { onSuccess: () => setDialogOpen(false) })
    } else {
      createMutation.mutate(payload, { onSuccess: () => setDialogOpen(false) })
    }
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground text-balance">Patients</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all registered pets and their owner information.</p>
        </div>
        <Button onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" /> Add Patient
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name, owner, or breed..." className="pl-10" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
            </div>
            <Select value={filterSpecies} onValueChange={(v) => { setFilterSpecies(v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All species" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All species</SelectItem>
                {speciesOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>ID</TableHead>
                  <TableHead>Pet Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Species</TableHead>
                  <TableHead className="hidden md:table-cell">Breed</TableHead>
                  <TableHead className="hidden lg:table-cell">Age</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="hidden md:table-cell">Phone</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <PawPrint className="w-8 h-8" />
                        <p>No patients found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  pets.map((pet: Record<string, unknown>) => (
                    <TableRow key={pet.id as number} className="cursor-pointer hover:bg-muted/30" onClick={() => openEdit(pet)}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{pet.customId as string}</TableCell>
                      <TableCell className="font-medium text-foreground">{pet.name as string}</TableCell>
                      <TableCell className="hidden sm:table-cell">{pet.species as string}</TableCell>
                      <TableCell className="hidden md:table-cell">{(pet.breed as string) || "-"}</TableCell>
                      <TableCell className="hidden lg:table-cell">{pet.age ? `${pet.age} yrs` : "-"}</TableCell>
                      <TableCell>
                        <span>{pet.ownerName as string}</span>
                        {pet.ownerLabel && (
                          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">{pet.ownerLabel as string}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">{pet.ownerPhone as string}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          pet.status === "Active" ? "bg-success/10 text-success border-success/20"
                          : "bg-muted text-muted-foreground border-border"
                        }>{pet.status as string}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
          {data?.meta && data.meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {page} of {data.meta.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Patient" : "Add New Patient"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-6 py-4">
            <div>
              <p className="text-sm font-medium text-foreground mb-3">Pet Information</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="petName">Pet Name</Label>
                  <Input id="petName" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Species</Label>
                  <Select value={form.species} onValueChange={(v) => setForm({ ...form, species: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{speciesOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="breed">Breed</Label>
                  <Input id="breed" value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="age">Age (years)</Label>
                  <Input id="age" type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <Input id="weight" type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                      <SelectItem value="Deceased">Deceased</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-3">Owner Information</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ownerName">Owner Name</Label>
                  <Input id="ownerName" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ownerPhone">Phone</Label>
                  <Input id="ownerPhone" value={form.ownerPhone} onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ownerEmail">Email</Label>
                  <Input id="ownerEmail" type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ownerNationalId">National ID</Label>
                  <Input id="ownerNationalId" value={form.ownerNationalId} onChange={(e) => setForm({ ...form, ownerNationalId: e.target.value })} placeholder="ID number" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ownerLabel">Owner Label</Label>
                  <Input id="ownerLabel" value={form.ownerLabel} onChange={(e) => setForm({ ...form, ownerLabel: e.target.value })} placeholder="e.g. VIP, Caution" />
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="ownerNotes">Owner Notes</Label>
                  <Textarea id="ownerNotes" value={form.ownerNotes} onChange={(e) => setForm({ ...form, ownerNotes: e.target.value })} rows={2} placeholder="Additional notes about the owner..." />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.ownerName || !form.ownerPhone || createMutation.isPending || updateMutation.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {editingId ? "Save Changes" : "Add Patient"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
