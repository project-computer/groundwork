import { useState } from "react"
import { useTransfers, useMarkTransferSent, useMarkTransferReceived } from "@/hooks/use-queries"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Mail, Eye, Copy, Check, ExternalLink, FileDown } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

export default function Transfers() {
  const { data: transfersData } = useTransfers({ limit: 100 })
  const sentMutation = useMarkTransferSent()
  const receivedMutation = useMarkTransferReceived()
  const { toast } = useToast()
  const [selectedTransfer, setSelectedTransfer] = useState<Record<string, unknown> | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const transfers = transfersData?.data ?? []

  function copyShareLink(token: string, id: string) {
    const link = `${window.location.origin}/share/${token}`
    navigator.clipboard.writeText(link)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    toast({ title: "Copied!", description: "Share link copied to clipboard" })
  }

  function markSent(id: number) {
    sentMutation.mutate(id, { onSuccess: () => toast({ title: "Marked as sent" }) })
  }

  function markReceived(id: number) {
    receivedMutation.mutate(id, { onSuccess: () => toast({ title: "Marked as received" }) })
  }

  function statusBadge(status: string) {
    const variants: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      received: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    }
    const labels: Record<string, string> = {
      pending: "รอส่ง",
      sent: "ส่งแล้ว",
      received: "รับแล้ว",
    }
    return <Badge className={variants[status] || ""}>{labels[status] || status}</Badge>
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">ส่งต่อผู้ป่วย (Case Transfer)</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage patient referrals and case transfers.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transfer History</CardTitle>
        </CardHeader>
        <CardContent>
          {transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No transfers yet. Create one from a visit.</p>
          ) : (
            <div className="space-y-3">
              {transfers.map((t: Record<string, unknown>) => (
                <div key={t.id as string} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-xs text-muted-foreground">{t.customId as string}</span>
                      {statusBadge(t.status as string)}
                    </div>
                    <p className="text-sm font-medium">{t.petName as string} — {t.ownerName as string}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      To: {t.referralClinic as string}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => copyShareLink(t.shareToken as string, t.id as string)}>
                      {copiedId === t.id ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                      {copiedId === t.id ? "Copied" : "Copy Link"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => window.open(`/api/v1/transfers/${t.id}/pdf`, "_blank")}>
                      <FileDown className="w-3 h-3 mr-1" /> PDF
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSelectedTransfer(t as Record<string, unknown>)}>
                      <Eye className="w-3 h-3 mr-1" /> View
                    </Button>
                    {t.status === "pending" && (
                      <Button size="sm" onClick={() => markSent(t.id as number)}>
                        <Mail className="w-3 h-3 mr-1" /> Mark Sent
                      </Button>
                    )}
                    {t.status === "sent" && (
                      <Button size="sm" variant="secondary" onClick={() => markReceived(t.id as number)}>
                        <Check className="w-3 h-3 mr-1" /> Mark Received
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedTransfer} onOpenChange={() => setSelectedTransfer(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transfer Details — {selectedTransfer?.customId}</DialogTitle>
          </DialogHeader>
          {selectedTransfer && <TransferDetail transfer={selectedTransfer} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TransferDetail({ transfer }: { transfer: Record<string, unknown> }) {
  const data = transfer.transferData as Record<string, unknown> | undefined
  const petInfo = data?.petInfo as Record<string, unknown> | undefined
  const visitInfo = data?.visitInfo as Record<string, unknown> | undefined
  const vitals = data?.vitals as Record<string, unknown> | undefined
  const medications = data?.medications as Array<Record<string, unknown>> | undefined
  const history = data?.history as Array<Record<string, unknown>> | undefined

  return (
    <div className="space-y-6 text-sm">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="font-semibold mb-2">Pet Info</h3>
          <p><span className="text-muted-foreground">Name:</span> {petInfo?.name as string}</p>
          <p><span className="text-muted-foreground">Species:</span> {petInfo?.species as string}</p>
          {petInfo?.breed && <p><span className="text-muted-foreground">Breed:</span> {petInfo.breed as string}</p>}
          {petInfo?.age && <p><span className="text-muted-foreground">Age:</span> {petInfo.age as string} years</p>}
          {petInfo?.weight && <p><span className="text-muted-foreground">Weight:</span> {petInfo.weight as string} kg</p>}
        </div>
        <div>
          <h3 className="font-semibold mb-2">Owner</h3>
          <p>{transfer.ownerName as string}</p>
          {transfer.ownerPhone && <p className="text-muted-foreground">{transfer.ownerPhone as string}</p>}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2">Visit Info</h3>
        <p><span className="text-muted-foreground">Date:</span> {visitInfo?.date as string}</p>
        <p><span className="text-muted-foreground">Type:</span> {visitInfo?.type as string}</p>
        <p><span className="text-muted-foreground">Purpose:</span> {visitInfo?.purpose as string}</p>
        {visitInfo?.chiefComplaint && <p><span className="text-muted-foreground">Complaint:</span> {visitInfo.chiefComplaint as string}</p>}
        {visitInfo?.examination && <p><span className="text-muted-foreground">Exam:</span> {visitInfo.examination as string}</p>}
        {visitInfo?.assignedVet && <p><span className="text-muted-foreground">Vet:</span> {visitInfo.assignedVet as string}</p>}
      </div>

      {vitals && Object.keys(vitals).length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Vitals</h3>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(vitals).map(([key, value]) => (
              <div key={key} className="bg-muted p-2 rounded">
                <span className="text-xs text-muted-foreground capitalize">{key}</span>
                <p className="font-medium">{String(value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {transfer.diagnosis && (
        <div>
          <h3 className="font-semibold mb-1">Diagnosis</h3>
          <p>{transfer.diagnosis as string}</p>
        </div>
      )}

      {transfer.treatment && (
        <div>
          <h3 className="font-semibold mb-1">Treatment</h3>
          <p>{transfer.treatment as string}</p>
        </div>
      )}

      {medications && medications.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Medications</h3>
          <div className="space-y-2">
            {medications.map((med, i) => (
              <div key={i} className="bg-muted p-3 rounded">
                <p className="font-medium">{med.name as string}</p>
                <p className="text-muted-foreground">{med.dosage as string} — {med.frequency as string}</p>
                {med.notes && <p className="text-xs text-muted-foreground mt-1">{med.notes as string}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {history && history.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Visit History</h3>
          <div className="space-y-2">
            {history.map((h, i) => (
              <div key={i} className="border-l-2 border-muted pl-3 py-1">
                <p className="text-xs text-muted-foreground">{h.date as string} — {h.clinic as string}</p>
                {h.diagnosis && <p className="font-medium">{h.diagnosis as string}</p>}
                {h.treatment && <p className="text-muted-foreground">{h.treatment as string}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-4 border-t">
        <h3 className="font-semibold mb-1">Referral Reason</h3>
        <p className="text-muted-foreground">{transfer.referralReason as string}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Referral to: {transfer.referralClinic as string}
        </p>
      </div>

      <div className="flex gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={() => window.open(`/share/${transfer.shareToken}`, "_blank")}>
          <ExternalLink className="w-3 h-3 mr-1" /> Open Share Page
        </Button>
      </div>
    </div>
  )
}
