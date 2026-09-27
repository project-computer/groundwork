import { useState } from "react"
import { usePatients, useCreatePatient, useUpdatePatient } from "@/features/patients/api"
import { Box, Heading, Text, Button, Label, TextInput, Textarea, Select, FormControl, Dialog } from "@primer/react"
import { DataTable } from "@primer/react/experimental"
import { SearchIcon } from "@primer/octicons-react"
import { Plus, PawPrint } from "lucide-react"

const speciesOptions = ["Dog", "Cat", "Bird", "Rabbit", "Reptile", "Other"] as const

const emptyForm = {
  name: "", species: "Dog", breed: "", age: "", weight: "",
  ownerName: "", ownerPhone: "", ownerEmail: "", ownerNationalId: "", ownerNotes: "", ownerLabel: "",
  status: "Active",
}

type PetRow = {
  id: number
  customId?: string
  name?: string
  species?: string
  breed?: string
  age?: number | string
  ownerName?: string
  ownerPhone?: string
  ownerLabel?: string
  status?: string
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

  const pets: PetRow[] = (data?.data ?? []) as PetRow[]

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

  const set = (k: keyof typeof emptyForm) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [k]: e.target.value }),
  })

  return (
    <Box sx={{ p: [3, 4] }}>
      <Box sx={{ display: "flex", flexDirection: ["column", "row"], alignItems: ["stretch", "center"], justifyContent: "space-between", gap: 2, mb: 3 }}>
        <Box>
          <Heading as="h2" sx={{ fontSize: 4, fontWeight: "semibold" }}>Patients</Heading>
          <Text as="p" sx={{ fontSize: 1, color: "fg.muted", mt: 1 }}>Manage all registered pets and their owner information.</Text>
        </Box>
        <Button variant="primary" onClick={openAdd}>
          <Plus size={16} /> Add Patient
        </Button>
      </Box>

      <Box borderColor="border.default" borderWidth={1} borderStyle="solid" borderRadius={2} sx={{ p: 3 }}>
        <Box sx={{ display: "flex", flexDirection: ["column", "row"], gap: 2, mb: 3 }}>
          <Box sx={{ flexGrow: 1 }}>
            <TextInput
              leadingVisual={SearchIcon}
              placeholder="Search by name, owner, or breed..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              block
              aria-label="Search patients"
            />
          </Box>
          <Select
            value={filterSpecies}
            onChange={(e) => { setFilterSpecies(e.target.value); setPage(1) }}
            aria-label="Filter by species"
          >
            <Select.Option value="all">All species</Select.Option>
            {speciesOptions.map((s) => <Select.Option key={s} value={s}>{s}</Select.Option>)}
          </Select>
        </Box>

        {isLoading ? (
          <Text sx={{ color: "fg.muted" }}>Loading...</Text>
        ) : pets.length === 0 ? (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, py: 4, color: "fg.muted" }}>
            <PawPrint size={32} />
            <Text>No patients found</Text>
          </Box>
        ) : (
          <DataTable
            aria-labelledby="patients-table"
            data={pets}
            columns={[
              { header: "ID", field: "customId", rowHeader: true },
              { header: "Pet Name", field: "name" },
              { header: "Species", field: "species" },
              {
                header: "Breed", field: "breed",
                renderCell: (row: PetRow) => (row.breed ? String(row.breed) : "-"),
              },
              {
                header: "Age", field: "age",
                renderCell: (row: PetRow) => (row.age ? `${row.age} yrs` : "-"),
              },
              {
                header: "Owner", field: "ownerName",
                renderCell: (row: PetRow) => (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Text>{row.ownerName}</Text>
                    {row.ownerLabel ? <Label variant="accent">{row.ownerLabel}</Label> : null}
                  </Box>
                ),
              },
              { header: "Phone", field: "ownerPhone" },
              {
                header: "Status", field: "status",
                renderCell: (row: PetRow) => (
                  <Label variant={row.status === "Active" ? "success" : "default"}>{row.status}</Label>
                ),
              },
              {
                header: "Actions",
                id: "actions",
                renderCell: (row: PetRow) => (
                  <Button
                    size="small"
                    onClick={() => openEdit(row as unknown as Record<string, unknown>)}
                  >
                    Edit
                  </Button>
                ),
              },
            ]}
          />
        )}
        {data?.meta && data.meta.totalPages > 1 && (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, py: 3 }}>
            <Button size="small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Text sx={{ fontSize: 1, color: "fg.muted" }}>Page {page} of {data.meta.totalPages}</Text>
            <Button size="small" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </Box>
        )}
      </Box>

      {dialogOpen && (
        <Dialog
          title={editingId ? "Edit Patient" : "Add New Patient"}
          onClose={() => setDialogOpen(false)}
          width="xlarge"
          footerButtons={[
            { buttonType: "default", content: "Cancel", onClick: () => setDialogOpen(false) },
            {
              buttonType: "primary",
              content: editingId ? "Save Changes" : "Add Patient",
              onClick: handleSave,
              disabled: !form.name || !form.ownerName || !form.ownerPhone || createMutation.isPending || updateMutation.isPending,
            },
          ]}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Box>
              <Text as="p" sx={{ fontSize: 1, fontWeight: "semibold", mb: 2 }}>Pet Information</Text>
              <Box sx={{ display: "grid", gridTemplateColumns: ["1fr", "1fr 1fr"], gap: 2 }}>
                <FormControl>
                  <FormControl.Label>Pet Name</FormControl.Label>
                  <TextInput {...set("name")} block />
                </FormControl>
                <FormControl>
                  <FormControl.Label>Species</FormControl.Label>
                  <Select value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })} aria-label="Species">
                    {speciesOptions.map((s) => <Select.Option key={s} value={s}>{s}</Select.Option>)}
                  </Select>
                </FormControl>
                <FormControl>
                  <FormControl.Label>Breed</FormControl.Label>
                  <TextInput {...set("breed")} block />
                </FormControl>
                <FormControl>
                  <FormControl.Label>Age (years)</FormControl.Label>
                  <TextInput {...set("age")} type="number" block />
                </FormControl>
                <FormControl>
                  <FormControl.Label>Weight (kg)</FormControl.Label>
                  <TextInput {...set("weight")} type="number" block />
                </FormControl>
                <FormControl>
                  <FormControl.Label>Status</FormControl.Label>
                  <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} aria-label="Status">
                    <Select.Option value="Active">Active</Select.Option>
                    <Select.Option value="Inactive">Inactive</Select.Option>
                    <Select.Option value="Deceased">Deceased</Select.Option>
                  </Select>
                </FormControl>
              </Box>
            </Box>
            <Box>
              <Text as="p" sx={{ fontSize: 1, fontWeight: "semibold", mb: 2 }}>Owner Information</Text>
              <Box sx={{ display: "grid", gridTemplateColumns: ["1fr", "1fr 1fr"], gap: 2 }}>
                <FormControl>
                  <FormControl.Label>Owner Name</FormControl.Label>
                  <TextInput {...set("ownerName")} block />
                </FormControl>
                <FormControl>
                  <FormControl.Label>Phone</FormControl.Label>
                  <TextInput {...set("ownerPhone")} block />
                </FormControl>
                <FormControl>
                  <FormControl.Label>Email</FormControl.Label>
                  <TextInput {...set("ownerEmail")} type="email" block />
                </FormControl>
                <FormControl>
                  <FormControl.Label>National ID</FormControl.Label>
                  <TextInput {...set("ownerNationalId")} placeholder="ID number" block />
                </FormControl>
                <FormControl>
                  <FormControl.Label>Owner Label</FormControl.Label>
                  <TextInput {...set("ownerLabel")} placeholder="e.g. VIP, Caution" block />
                </FormControl>
                <Box sx={{ gridColumn: ["auto", "1 / -1"] }}>
                  <FormControl>
                    <FormControl.Label>Owner Notes</FormControl.Label>
                    <Textarea
                      value={form.ownerNotes}
                      onChange={(e) => setForm({ ...form, ownerNotes: e.target.value })}
                      rows={2}
                      placeholder="Additional notes about the owner..."
                      block
                    />
                  </FormControl>
                </Box>
              </Box>
            </Box>
          </Box>
        </Dialog>
      )}
    </Box>
  )
}
