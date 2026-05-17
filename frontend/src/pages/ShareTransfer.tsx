import { useParams } from "react-router-dom"
import { useTransferByToken } from "@/hooks/use-queries"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Printer, Copy } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function ShareTransfer() {
  const { token } = useParams<{ token: string }>()
  const { data, isLoading } = useTransferByToken(token)
  const { toast } = useToast()

  if (isLoading) return <div className="flex items-center justify-center h-screen">Loading...</div>
  if (!data?.data) return <div className="flex items-center justify-center h-screen text-muted-foreground">Transfer not found or expired.</div>

  const t = data.data as Record<string, unknown>
  const transferData = t.transferData as Record<string, unknown> | undefined
  const petInfo = transferData?.petInfo as Record<string, unknown> | undefined
  const visitInfo = transferData?.visitInfo as Record<string, unknown> | undefined
  const vitals = transferData?.vitals as Record<string, unknown> | undefined
  const medications = transferData?.medications as Array<Record<string, unknown>> | undefined
  const history = transferData?.history as Array<Record<string, unknown>> | undefined

  function copyAll() {
    const text = `
CASE TRANSFER — ${t.customId}
Pet: ${petInfo?.name} (${petInfo?.species})
Owner: ${t.ownerName}
Referral to: ${t.referralClinic}
Reason: ${t.referralReason}
Diagnosis: ${transferData?.diagnosis || "-"}
Treatment: ${transferData?.treatment || "-"}
    `.trim()
    navigator.clipboard.writeText(text)
    toast({ title: "Copied!", description: "Transfer summary copied" })
  }

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Case Transfer</h1>
            <p className="text-sm text-muted-foreground">{t.customId as string}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={copyAll}><Copy className="w-3 h-3 mr-1" /> Copy</Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="w-3 h-3 mr-1" /> Print</Button>
          </div>
        </div>

        <div className="space-y-4 print:space-y-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Patient Info / ข้อมูลผู้ป่วย</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Name:</span> {petInfo?.name as string}</div>
              <div><span className="text-muted-foreground">Species:</span> {petInfo?.species as string}</div>
              {petInfo?.breed && <div><span className="text-muted-foreground">Breed:</span> {petInfo.breed as string}</div>}
              {petInfo?.age && <div><span className="text-muted-foreground">Age:</span> {petInfo.age as string} yrs</div>}
              {petInfo?.weight && <div><span className="text-muted-foreground">Weight:</span> {petInfo.weight as string} kg</div>}
              <div><span className="text-muted-foreground">Owner:</span> {t.ownerName as string}</div>
              {t.ownerPhone && <div><span className="text-muted-foreground">Phone:</span> {t.ownerPhone as string}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Visit Info / ข้อมูลการตรวจ</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Date:</span> {visitInfo?.date as string}</div>
                <div><span className="text-muted-foreground">Type:</span> {visitInfo?.type as string}</div>
              </div>
              <div><span className="text-muted-foreground">Purpose:</span> {visitInfo?.purpose as string}</div>
              {visitInfo?.chiefComplaint && <div><span className="text-muted-foreground">Complaint:</span> {visitInfo.chiefComplaint as string}</div>}
              {visitInfo?.examination && <div><span className="text-muted-foreground">Exam:</span> {visitInfo.examination as string}</div>}
              {visitInfo?.assignedVet && <div><span className="text-muted-foreground">Vet:</span> {visitInfo.assignedVet as string}</div>}
            </CardContent>
          </Card>

          {vitals && Object.keys(vitals).length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Vitals / สัญญาณชีพ</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {Object.entries(vitals).map(([key, value]) => (
                    <div key={key} className="bg-muted p-2 rounded">
                      <span className="text-xs text-muted-foreground capitalize">{key}</span>
                      <p className="font-medium">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(transferData?.diagnosis || transferData?.treatment) && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Diagnosis & Treatment / การวินิจฉัยและการรักษา</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {transferData?.diagnosis && <div><span className="text-muted-foreground">Diagnosis:</span> {transferData.diagnosis as string}</div>}
                {transferData?.treatment && <div><span className="text-muted-foreground">Treatment:</span> {transferData.treatment as string}</div>}
              </CardContent>
            </Card>
          )}

          {medications && medications.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Medications / ยา</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {medications.map((med, i) => (
                    <div key={i} className="border-b pb-2 last:border-0">
                      <p className="font-medium">{med.name as string}</p>
                      <p className="text-muted-foreground">{med.dosage as string} — {med.frequency as string} {med.duration ? `(${med.duration as string})` : ""}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {history && history.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">History / ประวัติการรักษา</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {history.map((h, i) => (
                    <div key={i} className="border-l-2 border-muted pl-3">
                      <p className="text-xs text-muted-foreground">{h.date as string}</p>
                      {h.diagnosis && <p className="font-medium">{h.diagnosis as string}</p>}
                      {h.treatment && <p className="text-muted-foreground">{h.treatment as string}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-2 border-primary/20">
            <CardHeader className="pb-2"><CardTitle className="text-base">Referral / การส่งต่อ</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <p><span className="text-muted-foreground">To:</span> {t.referralClinic as string}</p>
              <p className="mt-2"><span className="text-muted-foreground">Reason:</span></p>
              <p className="text-muted-foreground">{t.referralReason as string}</p>
            </CardContent>
          </Card>

          <div className="pt-4">
            <Badge variant="outline" className="text-xs">
              Status: {(t.status as string) === "pending" ? "รอส่ง" : (t.status as string) === "sent" ? "ส่งแล้ว" : "รับแล้ว"}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  )
}
