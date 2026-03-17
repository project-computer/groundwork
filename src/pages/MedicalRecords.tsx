import { useMemo, useState } from "react"
import { getOpdRecords, getIpdRecords } from "@/lib/store"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileHeart, Search } from "lucide-react"

const opdStatusColors: Record<string, string> = {
  Ongoing: "bg-warning/10 text-warning border-warning/20",
  Resolved: "bg-success/10 text-success border-success/20",
  "Referred to IPD": "bg-primary/10 text-primary border-primary/20",
}

const ipdStatusColors: Record<string, string> = {
  Admitted: "bg-primary/10 text-primary border-primary/20",
  "Under Observation": "bg-warning/10 text-warning border-warning/20",
  Recovering: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  Discharged: "bg-success/10 text-success border-success/20",
}

export default function MedicalRecordsPage() {
  const [search, setSearch] = useState("")
  const opdRecords = getOpdRecords()
  const ipdRecords = getIpdRecords()

  const filteredOpd = useMemo(() => {
    const q = search.toLowerCase()
    return opdRecords.filter((record) =>
      record.id.toLowerCase().includes(q) ||
      record.petName.toLowerCase().includes(q) ||
      record.ownerName.toLowerCase().includes(q) ||
      record.diagnosis.toLowerCase().includes(q) ||
      record.veterinarian.toLowerCase().includes(q),
    )
  }, [opdRecords, search])

  const filteredIpd = useMemo(() => {
    const q = search.toLowerCase()
    return ipdRecords.filter((record) =>
      record.id.toLowerCase().includes(q) ||
      record.petName.toLowerCase().includes(q) ||
      record.ownerName.toLowerCase().includes(q) ||
      record.diagnosisOnAdmission.toLowerCase().includes(q) ||
      record.veterinarian.toLowerCase().includes(q),
    )
  }, [ipdRecords, search])

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground text-balance">Medical Records</h1>
          <p className="text-sm text-muted-foreground mt-1">Clinical OPD and IPD history for all patients.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by ID, pet, owner, diagnosis, or vet..."
              className="pl-10"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs defaultValue="opd">
            <TabsList>
              <TabsTrigger value="opd">OPD ({filteredOpd.length})</TabsTrigger>
              <TabsTrigger value="ipd">IPD ({filteredIpd.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="opd" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>ID</TableHead>
                    <TableHead>Pet</TableHead>
                    <TableHead className="hidden sm:table-cell">Owner</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="hidden md:table-cell">Vet</TableHead>
                    <TableHead className="hidden lg:table-cell">Diagnosis</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOpd.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <FileHeart className="w-8 h-8" />
                          <p>No OPD records found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOpd.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{record.id}</TableCell>
                        <TableCell className="font-medium text-foreground">{record.petName}</TableCell>
                        <TableCell className="hidden sm:table-cell">{record.ownerName}</TableCell>
                        <TableCell>{record.date}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">{record.veterinarian}</TableCell>
                        <TableCell className="hidden lg:table-cell">{record.diagnosis}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={opdStatusColors[record.status]}>
                            {record.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="ipd" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>ID</TableHead>
                    <TableHead>Pet</TableHead>
                    <TableHead className="hidden sm:table-cell">Owner</TableHead>
                    <TableHead>Admission</TableHead>
                    <TableHead className="hidden md:table-cell">Ward/Bed</TableHead>
                    <TableHead className="hidden lg:table-cell">Diagnosis</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredIpd.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <FileHeart className="w-8 h-8" />
                          <p>No IPD records found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredIpd.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{record.id}</TableCell>
                        <TableCell className="font-medium text-foreground">{record.petName}</TableCell>
                        <TableCell className="hidden sm:table-cell">{record.ownerName}</TableCell>
                        <TableCell>{record.admissionDate}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">{record.ward} / {record.bedNumber}</TableCell>
                        <TableCell className="hidden lg:table-cell">{record.diagnosisOnAdmission}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ipdStatusColors[record.status]}>
                            {record.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
