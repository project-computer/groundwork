import { useState, useMemo } from "react"
import { getPets, addPet, updatePet, getNextPetId, getTodayISO } from "@/lib/store"
import type { Pet } from "@/lib/store"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Plus, Search, PawPrint, ChevronUp, ChevronDown, Filter } from "lucide-react"

const speciesOptions = ["Dog", "Cat", "Bird", "Rabbit", "Reptile", "Other"] as const
type SortKey = "name" | "species" | "ownerName" | "createdAt" | "status" | "age"

const emptyForm = {
  name: "", species: "Dog" as Pet["species"], breed: "", age: "", weight: "",
  ownerName: "", ownerPhone: "", ownerEmail: "", ownerNationalId: "", ownerNotes: "", ownerLabel: "",
  status: "Active" as Pet["status"],
}

export default function PatientsPage() {
  const [pets, setPets] = useState(getPets())
  const [search, setSearch] = useState("")
  const [filterSpecies, setFilterSpecies] = useState("all")
  const [showFilters, setShowFilters] = useState(false)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const filtered = useMemo(() => {
    let result = pets.filter((p) => {
      const q = search.toLowerCase()
      const matchesSearch = p.name.toLowerCase().includes(q) || p.ownerName.toLowerCase().includes(q) || p.breed.toLowerCase().includes(q)
      const matchesSpecies = filterSpecies === "all" || p.species === filterSpecies
      const matchesDateFrom = !dateFrom || p.createdAt >= dateFrom
      const matchesDateTo = !dateTo || p.createdAt <= dateTo
      return matchesSearch && matchesSpecies && matchesDateFrom && matchesDateTo
    })
    result.sort((a, b) => {
      const aVal = a[sortKey] ?? ""
      const bVal = b[sortKey] ?? ""
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
      return sortDir === "asc" ? cmp : -cmp
    })
    return result
  }, [pets, search, filterSpecies, dateFrom, dateTo, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />
  }

  function openAdd() {
    setEditingId(null)
    setForm({ ...emptyForm })
    setDialogOpen(true)
  }

  function openEdit(pet: Pet) {
    setEditingId(pet.id)
    setForm({
      name: pet.name, species: pet.species, breed: pet.breed,
      age: String(pet.age), weight: String(pet.weight),
      ownerName: pet.ownerName, ownerPhone: pet.ownerPhone, ownerEmail: pet.ownerEmail,
      ownerNationalId: pet.ownerNationalId, ownerNotes: pet.ownerNotes, ownerLabel: pet.ownerLabel,
      status: pet.status,
    })
    setDialogOpen(true)
  }

  function handleSave() {
    if (editingId) {
      updatePet(editingId, {
        name: form.name, species: form.species, breed: form.breed,
        age: Number(form.age), weight: Number(form.weight),
        ownerName: form.ownerName, ownerPhone: form.ownerPhone, ownerEmail: form.ownerEmail,
        ownerNationalId: form.ownerNationalId, ownerNotes: form.ownerNotes, ownerLabel: form.ownerLabel,
        status: form.status,
      })
    } else {
      const newPet: Pet = {
        id: getNextPetId(), name: form.name, species: form.species, breed: form.breed,
        age: Number(form.age), weight: Number(form.weight),
        ownerName: form.ownerName, ownerPhone: form.ownerPhone, ownerEmail: form.ownerEmail,
        ownerNationalId: form.ownerNationalId, ownerNotes: form.ownerNotes, ownerLabel: form.ownerLabel,
        status: form.status,
        createdAt: getTodayISO(),
        updatedAt: getTodayISO(),
      }
      addPet(newPet)
    }
    setPets(getPets())
    setDialogOpen(false)
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
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search by name, owner, or breed..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={filterSpecies} onValueChange={setFilterSpecies}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All species" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All species</SelectItem>
                  {speciesOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => setShowFilters(!showFilters)}>
                <Filter className="w-4 h-4" />
              </Button>
            </div>
            {showFilters && (
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Register date from</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-40" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Register date to</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-40" />
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>ID</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>Pet Name<SortIcon col="name" /></TableHead>
                <TableHead className="hidden sm:table-cell cursor-pointer select-none" onClick={() => toggleSort("species")}>Species<SortIcon col="species" /></TableHead>
                <TableHead className="hidden md:table-cell">Breed</TableHead>
                <TableHead className="hidden lg:table-cell cursor-pointer select-none" onClick={() => toggleSort("age")}>Age<SortIcon col="age" /></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("ownerName")}>Owner<SortIcon col="ownerName" /></TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="hidden lg:table-cell">Next Appt</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>Status<SortIcon col="status" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <PawPrint className="w-8 h-8" />
                      <p>No patients found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((pet) => (
                  <TableRow key={pet.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openEdit(pet)}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{pet.id}</TableCell>
                    <TableCell className="font-medium text-foreground">{pet.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">{pet.species}</TableCell>
                    <TableCell className="hidden md:table-cell">{pet.breed}</TableCell>
                    <TableCell className="hidden lg:table-cell">{pet.age} yrs</TableCell>
                    <TableCell>
                      <span>{pet.ownerName}</span>
                      {pet.ownerLabel && (
                        <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">{pet.ownerLabel}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{pet.ownerPhone}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">{pet.nextAppointment || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        pet.status === "Active" ? "bg-success/10 text-success border-success/20"
                        : pet.status === "Deceased" ? "bg-muted text-muted-foreground border-border"
                        : "bg-muted text-muted-foreground border-border"
                      }>{pet.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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
                  <Select value={form.species} onValueChange={(v) => setForm({ ...form, species: v as Pet["species"] })}>
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
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Pet["status"] })}>
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
            <Button onClick={handleSave} disabled={!form.name || !form.ownerName} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {editingId ? "Save Changes" : "Add Patient"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
