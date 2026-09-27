import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Box, Button, FormControl, TextInput, Heading, Text, Spinner } from "@primer/react"
import { Banner } from "@primer/react/experimental"
import { useAuth } from "@/features/auth/AuthContext"
import { ApiError } from "@/shared/api/client"

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await login(email, password)
      navigate("/")
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : undefined
      setError(msg || "Invalid email or password")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", p: 3 }}>
      <Box
        sx={{
          width: "100%",
          maxWidth: 400,
          border: "1px solid var(--borderColor-default)",
          borderRadius: "12px",
          p: 4,
          bg: "canvas.default",
        }}
      >
        <Heading as="h2" sx={{ fontSize: 4, textAlign: "center" }}>VetCare Clinic</Heading>
        <Text as="p" sx={{ fontSize: 1, color: "fg.muted", textAlign: "center", mb: 3 }}>
          Sign in to your account
        </Text>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {error && <Banner variant="critical" title={error} />}
          <FormControl>
            <FormControl.Label>Email</FormControl.Label>
            <TextInput
              type="email"
              placeholder="admin@happypaws.vet"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              block
            />
          </FormControl>
          <FormControl>
            <FormControl.Label>Password</FormControl.Label>
            <TextInput
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              block
            />
          </FormControl>
          <Button type="submit" variant="primary" disabled={loading} sx={{ width: "100%" }}>
            {loading ? <Spinner size="small" /> : "Sign In"}
          </Button>
          <Text as="p" sx={{ fontSize: 0, color: "fg.muted", textAlign: "center" }}>
            Default: admin@happypaws.vet / admin123
          </Text>
        </form>
      </Box>
    </Box>
  )
}
