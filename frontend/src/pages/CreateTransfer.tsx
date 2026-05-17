import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useCreateTransfer } from "@/hooks/use-queries"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Copy } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function CreateTransfer() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const createMutation = useCreateTransfer()
  const [referralClinic, setReferralClinic] = useState("")
  const [referralReason, setReferralReason] = useState("")
  const [createdToken, setCreatedToken] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!referralClinic || !referralReason) return
    createMutation.mutate(
      {
        petId: Number(id),
        sourceVisitId: Number(id),
        referralClinic,
        referralReason,
      },
      {
        onSuccess: (data: Record<string, unknown>) => {
          setCreatedToken(data.shareToken as string)
          toast({ title: "Transfer created!", description: "Share link generated" })
        },
      },
    )
  }

  function copyLink() {
    if (!createdToken) return
    const link = `${window.location.origin}/share/${createdToken}`
    navigator.clipboard.writeText(link)
    toast({ title: "Copied!", description: "Share link copied" })
  }

  return (
    <div className="p-4 lg:p-6">
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      <h1 className="text-2xl font-semibold text-foreground mb-6">Create Case Transfer</h1>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Referral Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="clinic">Referral Clinic / โรงพยาบาลที่ส่งต่อ</Label>
              <Input
                id="clinic"
                value={referralClinic}
                onChange={(e) => setReferralClinic(e.target.value)}
                placeholder="e.g. Chulalongkorn Veterinary Hospital"
                required
              />
            </div>
            <div>
              <Label htmlFor="reason">Referral Reason / เหตุผลที่ส่งต่อ</Label>
              <Textarea
                id="reason"
                value={referralReason}
                onChange={(e) => setReferralReason(e.target.value)}
                placeholder="Describe why this case needs referral..."
                rows={4}
                required
              />
            </div>
            <Button type="submit" disabled={createMutation.isPending} className="w-full">
              {createMutation.isPending ? "Creating..." : "Create Transfer"}
            </Button>
          </form>

          {createdToken && (
            <div className="mt-6 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">Transfer created successfully!</p>
              <div className="flex gap-2">
                <Input readOnly value={`${window.location.origin}/share/${createdToken}`} className="text-xs" />
                <Button size="sm" variant="outline" onClick={copyLink}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Share this link with the receiving clinic.</p>
              <Button size="sm" className="mt-3" onClick={() => navigate("/transfers")}>
                View All Transfers
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
