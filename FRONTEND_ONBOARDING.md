# 🎨 Frontend Developer Onboarding Guide

This guide is specifically for frontend developers working on the React application.

---

## 📋 Table of Contents

1. [Frontend Architecture](#frontend-architecture)
2. [Tech Stack Deep Dive](#tech-stack-deep-dive)
3. [Project Structure](#project-structure)
4. [Component Patterns](#component-patterns)
5. [State Management](#state-management)
6. [Styling with Tailwind](#styling-with-tailwind)
7. [Forms & Validation](#forms--validation)
8. [Routing](#routing)
9. [API Integration (TODO)](#api-integration-todo)
10. [Common Tasks](#common-tasks)
11. [Best Practices](#best-practices)
12. [Performance Optimization](#performance-optimization)

---

## 🏗️ Frontend Architecture

### Current State

The frontend currently operates as a **standalone application** with in-memory state:

```
┌─────────────────────────────────────────────────┐
│              React Application                   │
│                                                  │
│  ┌────────────┐        ┌────────────┐          │
│  │   Pages    │◄──────►│  Store.ts  │          │
│  │            │        │ (in-memory)│          │
│  └────────────┘        └────────────┘          │
│                                                  │
│  ┌────────────┐        ┌────────────┐          │
│  │ Components │        │   Hooks    │          │
│  │            │        │            │          │
│  └────────────┘        └────────────┘          │
│                                                  │
│          All data lost on refresh!              │
└─────────────────────────────────────────────────┘
```

### Target Architecture

We're transitioning to a **backend-connected architecture**:

```
┌─────────────────────────────────────────────────┐
│              React Application                   │
│                                                  │
│  ┌────────────┐        ┌──────────────┐        │
│  │   Pages    │◄──────►│ React Query  │        │
│  │            │        │    Hooks     │        │
│  └────────────┘        └──────┬───────┘        │
│                                │                 │
│  ┌────────────┐                │                 │
│  │ Components │                │                 │
│  └────────────┘                │                 │
│                                 │                 │
│  ┌─────────────────────────────▼──────┐         │
│  │         Auth Context                │         │
│  │    (JWT tokens, user state)         │         │
│  └─────────────────────────────────────┘         │
│                                                   │
│  ┌─────────────────────────────────────┐         │
│  │         Axios API Client            │         │
│  │  • Base URL configuration           │         │
│  │  • Request/Response interceptors    │         │
│  │  • Token injection                  │         │
│  └─────────────┬───────────────────────┘         │
└────────────────┼─────────────────────────────────┘
                 │ HTTP + JWT
                 ▼
┌─────────────────────────────────────────────────┐
│            Go Backend API                        │
│        (Port 8080, RESTful JSON)                │
└─────────────────────────────────────────────────┘
```

### Data Flow

**Current (In-Memory):**
```
User Action → Page Component → store.ts → Update UI
```

**Target (API-Connected):**
```
User Action
  ↓
Page Component
  ↓
React Query Hook (useMutation/useQuery)
  ↓
Axios API Call → Backend
  ↓              ↓
  ↓            Database
  ↓              ↓
  ↓            Response
  ↓              ↓
React Query updates cache
  ↓
Component re-renders
  ↓
UI updates
```

---

## 🛠️ Tech Stack Deep Dive

### Core Technologies

#### React 19
- **Features Used:**
  - Function components with hooks
  - Context API for global state
  - Suspense for loading states
  - Error boundaries

```tsx
// Modern React component
export function PatientCard({ patient }: { patient: Patient }) {
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    // Side effects
  }, [patient.id])

  return <div>{patient.name}</div>
}
```

#### TypeScript
- **Strict mode enabled**
- Type-safe API calls
- Prop type checking
- IDE autocomplete

```tsx
// Type-safe props
interface PatientCardProps {
  patient: Patient
  onEdit?: (id: string) => void
  className?: string
}

export function PatientCard({ patient, onEdit, className }: PatientCardProps) {
  // TypeScript knows patient has .id, .name, etc.
}
```

#### Vite
- **Lightning-fast development server**
- Hot Module Replacement (HMR)
- Optimized production builds
- TypeScript support out of the box

```bash
# Development (with HMR)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

### UI Layer

#### Tailwind CSS v4
- **Utility-first CSS**
- Responsive design with breakpoints
- Dark mode support (optional)
- Custom configuration

```tsx
// Tailwind classes
<div className="flex items-center justify-between p-4 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">
  <h2 className="text-xl font-bold text-gray-900">Title</h2>
  <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
    Click
  </button>
</div>
```

**Common Patterns:**
- `flex` / `grid` - Layout
- `p-4` `m-2` - Padding/Margin
- `text-xl` `font-bold` - Typography
- `bg-blue-600` `text-white` - Colors
- `rounded-lg` `shadow-md` - Borders/Shadows
- `hover:` `focus:` - State variants
- `md:` `lg:` - Responsive breakpoints

#### Radix UI
- **Unstyled, accessible components**
- Full keyboard navigation
- ARIA attributes included
- Customizable with Tailwind

```tsx
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog"

// Pre-styled, accessible components
<Button variant="default" size="lg">Click Me</Button>

<Dialog>
  <DialogTrigger>Open</DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Are you sure?</DialogTitle>
    </DialogHeader>
  </DialogContent>
</Dialog>
```

**Available Components:**
- Button, Card, Dialog, Sheet (drawer)
- Select, Input, Textarea, Checkbox
- Tabs, Accordion, Popover, Tooltip
- Table, Pagination, Alert
- And many more in `src/components/ui/`

### Routing

#### React Router v7
- **Client-side routing**
- Nested routes
- URL parameters
- Protected routes (TODO)

```tsx
// App.tsx
<Routes>
  <Route path="/" element={<Dashboard />} />
  <Route path="/patients" element={<Patients />} />
  <Route path="/visits/:id" element={<VisitDetail />} />
</Routes>

// Navigate programmatically
const navigate = useNavigate()
navigate('/patients/123')

// Get URL params
const { id } = useParams()
```

### Forms

#### React Hook Form + Zod
- **Performance:** Only re-renders changed fields
- **Validation:** Schema-based with Zod
- **TypeScript:** Full type inference

```tsx
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

const patientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  species: z.string().min(1, "Species is required"),
  age: z.number().min(0).optional(),
  ownerPhone: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone"),
})

type PatientForm = z.infer<typeof patientSchema>

function PatientForm() {
  const form = useForm<PatientForm>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      name: "",
      species: "",
    },
  })

  const onSubmit = form.handleSubmit((data) => {
    console.log(data) // Type-safe!
  })

  return (
    <form onSubmit={onSubmit}>
      <input {...form.register("name")} />
      {form.formState.errors.name && (
        <span className="text-red-600">
          {form.formState.errors.name.message}
        </span>
      )}
      <button type="submit">Submit</button>
    </form>
  )
}
```

### State Management

#### Current: In-Memory Store

Located in `src/lib/store.ts`:

```tsx
// Reactive references
const patients = ref<Patient[]>([])

// Actions
export const addPatient = (patient: Patient) => {
  patients.value.push(patient)
}

export const getPatients = () => patients.value

// Usage in components
import { getPatients, addPatient } from "@/lib/store"

function Patients() {
  const [patients, setPatients] = useState(getPatients())

  useEffect(() => {
    // Subscribe to updates
    const unsubscribe = store.subscribe(() => {
      setPatients(getPatients())
    })
    return unsubscribe
  }, [])
}
```

**Problems with current approach:**
- Data lost on refresh
- No persistence
- Manual synchronization
- No caching
- No optimistic updates

#### Target: React Query

**Installation:**
```bash
npm install @tanstack/react-query
```

**Setup:**
```tsx
// main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
)
```

**Usage:**
```tsx
// hooks/usePatients.ts
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function usePatients(filters) {
  return useQuery({
    queryKey: ['patients', filters],
    queryFn: () => api.patients.list(filters),
  })
}

export function useCreatePatient() {
  return useMutation({
    mutationFn: (data) => api.patients.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] })
    },
  })
}

// Component
function Patients() {
  const { data, isLoading, error } = usePatients({ status: 'Active' })
  const createPatient = useCreatePatient()

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      {data.patients.map(patient => (
        <PatientCard key={patient.id} patient={patient} />
      ))}
    </div>
  )
}
```

**Benefits:**
- Automatic caching
- Background refetching
- Optimistic updates
- Loading/error states
- Pagination support
- Stale data management

---

## 📁 Project Structure

```
src/
├── components/              # Reusable components
│   ├── ui/                 # Radix UI wrappers (styled)
│   │   ├── button.tsx      # Button component
│   │   ├── card.tsx        # Card component
│   │   ├── dialog.tsx      # Modal dialog
│   │   ├── input.tsx       # Form input
│   │   ├── select.tsx      # Dropdown select
│   │   └── ...             # 40+ components
│   │
│   ├── app-sidebar.tsx     # Main navigation sidebar
│   ├── mobile-nav.tsx      # Mobile navigation
│   └── [feature].tsx       # Feature-specific components
│
├── pages/                   # Route pages
│   ├── Dashboard.tsx       # / - Main dashboard
│   ├── Patients.tsx        # /patients - Patient list
│   ├── Appointments.tsx    # /appointments - Scheduling
│   ├── Visits.tsx          # /visits - Visit list
│   ├── VisitDetail.tsx     # /visits/:id - Visit workflow
│   ├── Queue.tsx           # /queue - Patient queue
│   ├── Billing.tsx         # /billing - Bills & invoices
│   ├── Prescriptions.tsx   # /prescriptions - Rx management
│   └── MedicalRecords.tsx  # /records - OPD/IPD records
│
├── lib/                     # Utilities & config
│   ├── store.ts            # Current: In-memory state
│   ├── utils.ts            # Helper functions (cn, etc.)
│   ├── api/                # TODO: API client
│   │   ├── client.ts       # Axios instance
│   │   ├── auth.ts         # Auth API calls
│   │   ├── patients.ts     # Patient API calls
│   │   └── ...
│   └── types.ts            # Shared TypeScript types
│
├── hooks/                   # Custom React hooks
│   ├── use-mobile.tsx      # Mobile detection
│   ├── use-patients.ts     # TODO: Patient queries
│   ├── use-appointments.ts # TODO: Appointment queries
│   └── ...
│
├── contexts/                # React Context providers
│   └── AuthContext.tsx     # TODO: Auth state
│
├── App.tsx                 # Main app with routing
├── main.tsx                # Entry point
├── index.css               # Global styles + Tailwind
└── vite-env.d.ts           # Vite types
```

### File Naming Conventions

- **Components:** PascalCase - `PatientCard.tsx`, `AppSidebar.tsx`
- **Hooks:** camelCase with `use` prefix - `usePatients.ts`, `useMobile.tsx`
- **Utils:** camelCase - `api.ts`, `utils.ts`
- **Types:** PascalCase - `Patient`, `Appointment`
- **Constants:** UPPER_SNAKE_CASE - `API_BASE_URL`

---

## 🧩 Component Patterns

### Component Types

#### 1. Page Components
Full-page views that correspond to routes.

```tsx
// src/pages/Patients.tsx
export default function Patients() {
  const [patients, setPatients] = useState(getPatients())
  const [search, setSearch] = useState("")

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Patients</h1>
        <Button>Add Patient</Button>
      </div>

      <Input
        placeholder="Search patients..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="grid gap-4 mt-4">
        {filteredPatients.map(patient => (
          <PatientCard key={patient.id} patient={patient} />
        ))}
      </div>
    </div>
  )
}
```

#### 2. Presentational Components
Display data without business logic.

```tsx
// components/PatientCard.tsx
interface PatientCardProps {
  patient: Patient
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}

export function PatientCard({ patient, onEdit, onDelete }: PatientCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{patient.name}</CardTitle>
        <CardDescription>
          {patient.species} • {patient.breed}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p>Owner: {patient.ownerName}</p>
        <p>Phone: {patient.ownerPhone}</p>
      </CardContent>
      <CardFooter>
        <Button onClick={() => onEdit?.(patient.id)}>Edit</Button>
        <Button variant="destructive" onClick={() => onDelete?.(patient.id)}>
          Delete
        </Button>
      </CardFooter>
    </Card>
  )
}
```

#### 3. Container Components
Handle data fetching and state management.

```tsx
// components/PatientList.tsx
export function PatientList({ filters }: { filters: PatientFilters }) {
  const { data, isLoading, error } = usePatients(filters)

  if (isLoading) return <Skeleton />
  if (error) return <ErrorAlert error={error} />

  return (
    <div className="grid gap-4">
      {data.patients.map(patient => (
        <PatientCard key={patient.id} patient={patient} />
      ))}
    </div>
  )
}
```

#### 4. Form Components
Handle user input and validation.

```tsx
// components/PatientForm.tsx
export function PatientForm({ onSubmit, defaultValues }: PatientFormProps) {
  const form = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
    defaultValues,
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...form.register("name")} />
        {form.formState.errors.name && (
          <p className="text-sm text-red-600">
            {form.formState.errors.name.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="species">Species</Label>
        <Select {...form.register("species")}>
          <SelectTrigger>
            <SelectValue placeholder="Select species" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Dog">Dog</SelectItem>
            <SelectItem value="Cat">Cat</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Saving..." : "Save"}
      </Button>
    </form>
  )
}
```

### Component Composition

Build complex UIs by composing simple components:

```tsx
// Compose smaller components
function PatientDetailPage() {
  return (
    <div className="space-y-6">
      <PatientHeader patient={patient} />
      <Tabs>
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="visits">Visits</TabsTrigger>
          <TabsTrigger value="bills">Bills</TabsTrigger>
        </TabsList>
        <TabsContent value="info">
          <PatientInfo patient={patient} />
        </TabsContent>
        <TabsContent value="visits">
          <VisitList patientId={patient.id} />
        </TabsContent>
        <TabsContent value="bills">
          <BillList patientId={patient.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

---

## 🎨 Styling with Tailwind

### Utility Classes

**Layout:**
```tsx
<div className="flex flex-col gap-4">          {/* Flexbox column with gap */}
<div className="grid grid-cols-3 gap-4">      {/* Grid 3 columns */}
<div className="container mx-auto px-4">      {/* Centered container */}
```

**Spacing:**
```tsx
<div className="p-4">        {/* padding: 1rem (all sides) */}
<div className="px-6 py-4">  {/* padding-x: 1.5rem, padding-y: 1rem */}
<div className="m-2">        {/* margin: 0.5rem */}
<div className="space-y-4">  {/* gap between children */}
```

**Typography:**
```tsx
<h1 className="text-2xl font-bold text-gray-900">Title</h1>
<p className="text-sm text-gray-600">Description</p>
<span className="font-medium">Bold text</span>
```

**Colors:**
```tsx
<div className="bg-blue-600 text-white">     {/* Background + text */}
<div className="border border-gray-200">     {/* Border */}
<button className="bg-red-600 hover:bg-red-700"> {/* Hover state */}
```

**Responsive:**
```tsx
<div className="w-full md:w-1/2 lg:w-1/3">
  {/* Full width on mobile, half on tablet, third on desktop */}
</div>

<div className="hidden md:block">
  {/* Hidden on mobile, visible on tablet+ */}
</div>
```

### Custom Utilities

Use the `cn()` helper to combine classes:

```tsx
import { cn } from "@/lib/utils"

// Conditional classes
<div className={cn(
  "p-4 rounded-lg",
  isActive && "bg-blue-600 text-white",
  isDisabled && "opacity-50 pointer-events-none"
)}>

// Component variants
<Button className={cn("px-4 py-2", size === "lg" && "px-6 py-3")}>
```

### Component Styling Pattern

```tsx
interface CardProps {
  children: React.ReactNode
  className?: string
  variant?: "default" | "outlined"
}

export function Card({ children, className, variant = "default" }: CardProps) {
  return (
    <div
      className={cn(
        // Base styles (always applied)
        "rounded-lg p-6",

        // Variant styles
        variant === "default" && "bg-white shadow-md",
        variant === "outlined" && "border border-gray-200",

        // User-provided classes (last so they can override)
        className
      )}
    >
      {children}
    </div>
  )
}

// Usage
<Card className="hover:shadow-lg"> {/* Override/extend styles */}
```

---

## 📝 Forms & Validation

### Basic Form with React Hook Form

```tsx
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

// Define schema
const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  age: z.number().min(0).max(120).optional(),
})

type FormData = z.infer<typeof schema>

export function MyForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
    },
  })

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      // TODO: API call
      console.log(data)
    } catch (error) {
      form.setError("root", {
        message: "Failed to submit form",
      })
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          {...form.register("name")}
          placeholder="Enter name"
        />
        {form.formState.errors.name && (
          <p className="text-sm text-red-600 mt-1">
            {form.formState.errors.name.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          {...form.register("email")}
          placeholder="email@example.com"
        />
        {form.formState.errors.email && (
          <p className="text-sm text-red-600 mt-1">
            {form.formState.errors.email.message}
          </p>
        )}
      </div>

      {form.formState.errors.root && (
        <Alert variant="destructive">
          {form.formState.errors.root.message}
        </Alert>
      )}

      <Button
        type="submit"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? "Saving..." : "Save"}
      </Button>
    </form>
  )
}
```

### Complex Form with Nested Fields

```tsx
const schema = z.object({
  patient: z.object({
    name: z.string().min(1),
    species: z.string(),
  }),
  owner: z.object({
    name: z.string().min(1),
    phone: z.string(),
    email: z.string().email().optional(),
  }),
  medications: z.array(z.object({
    name: z.string(),
    dosage: z.string(),
  })),
})

// Access nested fields
<Input {...form.register("patient.name")} />
<Input {...form.register("owner.phone")} />

// Array fields (use useFieldArray)
const { fields, append, remove } = useFieldArray({
  control: form.control,
  name: "medications",
})

{fields.map((field, index) => (
  <div key={field.id}>
    <Input {...form.register(`medications.${index}.name`)} />
    <Button onClick={() => remove(index)}>Remove</Button>
  </div>
))}

<Button onClick={() => append({ name: "", dosage: "" })}>
  Add Medication
</Button>
```

### Form with File Upload

```tsx
function FileUploadForm() {
  const [preview, setPreview] = useState<string>()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)

    // TODO: Upload to API
    await api.visits.uploadImage(visitId, formData)
  }

  return (
    <form onSubmit={onSubmit}>
      <input
        type="file"
        name="image"
        accept="image/*"
        onChange={handleFileChange}
      />
      {preview && <img src={preview} alt="Preview" />}
      <Button type="submit">Upload</Button>
    </form>
  )
}
```

---

## 🔀 Routing

### Route Configuration

```tsx
// App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom"

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen">
        <AppSidebar />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/patients/:id" element={<PatientDetail />} />
            <Route path="/visits" element={<Visits />} />
            <Route path="/visits/:id" element={<VisitDetail />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
```

### Navigation

```tsx
import { useNavigate, useParams, Link } from "react-router-dom"

function MyComponent() {
  const navigate = useNavigate()
  const { id } = useParams()

  // Programmatic navigation
  const handleClick = () => {
    navigate('/patients')
    navigate('/patients/123')
    navigate(-1) // Go back
  }

  // Declarative navigation
  return (
    <>
      <Link to="/patients">View Patients</Link>
      <Link to={`/visits/${id}`}>View Visit</Link>
    </>
  )
}
```

### Protected Routes (TODO)

```tsx
// contexts/AuthContext.tsx
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return <div>Loading...</div>

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

// App.tsx
<Route
  path="/patients"
  element={
    <ProtectedRoute>
      <Patients />
    </ProtectedRoute>
  }
/>
```

---

## 🔌 API Integration (TODO)

### Setup Axios Client

```bash
npm install axios
```

```tsx
// lib/api/client.ts
import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: Add auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: Handle errors and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Token expired, try to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = localStorage.getItem('refresh_token')
        const { data } = await axios.post('/auth/refresh', { refreshToken })

        localStorage.setItem('access_token', data.accessToken)
        localStorage.setItem('refresh_token', data.refreshToken)

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        // Refresh failed, redirect to login
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default apiClient
```

### API Functions

```tsx
// lib/api/patients.ts
import apiClient from './client'

export const patientsApi = {
  list: async (params?: { page?: number; limit?: number; search?: string }) => {
    const { data } = await apiClient.get('/patients', { params })
    return data
  },

  get: async (id: string) => {
    const { data } = await apiClient.get(`/patients/${id}`)
    return data
  },

  create: async (patient: CreatePatientRequest) => {
    const { data } = await apiClient.post('/patients', patient)
    return data
  },

  update: async (id: string, patient: UpdatePatientRequest) => {
    const { data } = await apiClient.put(`/patients/${id}`, patient)
    return data
  },

  delete: async (id: string) => {
    await apiClient.delete(`/patients/${id}`)
  },
}

// lib/api/index.ts
export { patientsApi } from './patients'
export { appointmentsApi } from './appointments'
export { authApi } from './auth'
```

### React Query Hooks

```tsx
// hooks/usePatients.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { patientsApi } from '@/lib/api'

export function usePatients(filters?: PatientFilters) {
  return useQuery({
    queryKey: ['patients', filters],
    queryFn: () => patientsApi.list(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: ['patients', id],
    queryFn: () => patientsApi.get(id),
    enabled: !!id,
  })
}

export function useCreatePatient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: patientsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] })
    },
  })
}

export function useUpdatePatient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePatientRequest }) =>
      patientsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] })
      queryClient.invalidateQueries({ queryKey: ['patients', id] })
    },
  })
}

export function useDeletePatient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: patientsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] })
    },
  })
}
```

### Usage in Components

```tsx
function Patients() {
  const [search, setSearch] = useState("")

  const { data, isLoading, error } = usePatients({ search })
  const createPatient = useCreatePatient()
  const deletePatient = useDeletePatient()

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (error) {
    return <Alert variant="destructive">Error: {error.message}</Alert>
  }

  const handleCreate = () => {
    createPatient.mutate({
      name: "New Patient",
      species: "Dog",
      ownerName: "John Doe",
      ownerPhone: "+1-555-1234",
    }, {
      onSuccess: () => {
        toast.success("Patient created!")
      },
      onError: (error) => {
        toast.error(`Failed: ${error.message}`)
      },
    })
  }

  return (
    <div>
      <Input
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {data.data.map(patient => (
        <PatientCard
          key={patient.id}
          patient={patient}
          onDelete={(id) => deletePatient.mutate(id)}
        />
      ))}
    </div>
  )
}
```

---

## 🔨 Common Tasks

### Add a New Page

1. **Create page component:**
```tsx
// src/pages/NewPage.tsx
export default function NewPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">New Page</h1>
      {/* Content */}
    </div>
  )
}
```

2. **Add route:**
```tsx
// src/App.tsx
import NewPage from "@/pages/NewPage"

<Route path="/new-page" element={<NewPage />} />
```

3. **Add navigation:**
```tsx
// src/components/app-sidebar.tsx
{
  title: "New Page",
  url: "/new-page",
  icon: YourIcon,
}
```

### Create a Reusable Component

```tsx
// components/StatusBadge.tsx
interface StatusBadgeProps {
  status: "active" | "inactive" | "pending"
  children: React.ReactNode
}

export function StatusBadge({ status, children }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        status === "active" && "bg-green-100 text-green-800",
        status === "inactive" && "bg-gray-100 text-gray-800",
        status === "pending" && "bg-yellow-100 text-yellow-800"
      )}
    >
      {children}
    </span>
  )
}

// Usage
<StatusBadge status="active">Active</StatusBadge>
```

### Add Loading States

```tsx
// Using React Query
function Patients() {
  const { data, isLoading, error, isFetching } = usePatients()

  if (isLoading) {
    return <Skeleton className="h-96" />
  }

  return (
    <div>
      {isFetching && <div className="animate-pulse">Updating...</div>}
      {/* Content */}
    </div>
  )
}

// Manual loading
function MyComponent() {
  const [isLoading, setIsLoading] = useState(false)

  const handleAction = async () => {
    setIsLoading(true)
    try {
      await api.doSomething()
    } finally {
      setIsLoading(false)
    }
  }

  return <Button disabled={isLoading}>
    {isLoading ? "Loading..." : "Click Me"}
  </Button>
}
```

### Handle Errors

```tsx
import { toast } from "sonner"

// With React Query
const mutation = useMutation({
  mutationFn: api.create,
  onError: (error) => {
    toast.error(`Failed: ${error.message}`)
  },
  onSuccess: () => {
    toast.success("Created successfully!")
  },
})

// Manual error handling
try {
  await api.create(data)
  toast.success("Success!")
} catch (error) {
  if (error.response?.status === 400) {
    toast.error("Validation error")
  } else if (error.response?.status === 401) {
    toast.error("Unauthorized")
    navigate('/login')
  } else {
    toast.error("Something went wrong")
  }
}
```

---

## ✅ Best Practices

### 1. Component Structure

```tsx
// ✅ GOOD: Clear, organized component
import { useState } from "react"
import { Button } from "@/components/ui/button"

interface Props {
  patient: Patient
  onSave: (data: PatientData) => Promise<void>
}

export function PatientEditor({ patient, onSave }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [data, setData] = useState(patient)

  const handleSubmit = async () => {
    await onSave(data)
    setIsEditing(false)
  }

  return (
    <div>
      {/* Component JSX */}
    </div>
  )
}
```

### 2. State Management

```tsx
// ✅ GOOD: Use appropriate state
function MyComponent() {
  // Local UI state
  const [isOpen, setIsOpen] = useState(false)

  // Server state with React Query
  const { data } = usePatients()

  // Form state with React Hook Form
  const form = useForm()

  // Global state with Context (auth, theme, etc.)
  const { user } = useAuth()
}

// ❌ BAD: Everything in useState
const [patients, setPatients] = useState([])
useEffect(() => {
  fetch('/api/patients').then(...)
}, [])
```

### 3. Type Safety

```tsx
// ✅ GOOD: Proper TypeScript types
interface Patient {
  id: string
  name: string
  species: "Dog" | "Cat" | "Bird" | "Other"
  age?: number
}

function PatientCard({ patient }: { patient: Patient }) {
  // TypeScript knows patient.name exists
  return <div>{patient.name}</div>
}

// ❌ BAD: Using 'any'
function PatientCard({ patient }: { patient: any }) {
  // No type safety
}
```

### 4. Performance

```tsx
// ✅ GOOD: Memoize expensive computations
const filteredPatients = useMemo(() => {
  return patients.filter(p => p.name.includes(search))
}, [patients, search])

// ✅ GOOD: Memoize callback functions
const handleClick = useCallback(() => {
  doSomething(id)
}, [id])

// ❌ BAD: Computing on every render
const filteredPatients = patients.filter(...) // Runs every render!

// ❌ BAD: Creating new functions on every render
<Component onClick={() => doSomething(id)} /> // New function each render
```

### 5. Accessibility

```tsx
// ✅ GOOD: Accessible form
<form>
  <Label htmlFor="name">Name</Label>
  <Input
    id="name"
    aria-label="Patient name"
    aria-required="true"
  />
  <Button type="submit">Submit</Button>
</form>

// ✅ GOOD: Keyboard navigation
<button
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick()
    }
  }}
>
  Click
</button>
```

---

## ⚡ Performance Optimization

### 1. Code Splitting

```tsx
// Lazy load pages
import { lazy, Suspense } from "react"

const Dashboard = lazy(() => import("@/pages/Dashboard"))
const Patients = lazy(() => import("@/pages/Patients"))

<Suspense fallback={<div>Loading...</div>}>
  <Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/patients" element={<Patients />} />
  </Routes>
</Suspense>
```

### 2. Image Optimization

```tsx
// Lazy load images
<img
  src={imageUrl}
  loading="lazy"
  alt="Patient photo"
/>

// Responsive images
<picture>
  <source media="(min-width: 768px)" srcSet={largeImage} />
  <img src={smallImage} alt="..." />
</picture>
```

### 3. Virtualization (for large lists)

```bash
npm install @tanstack/react-virtual
```

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

function LargeList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
  })

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: virtualItem.size,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <ItemCard item={items[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## 🧪 Testing (Future)

### Unit Tests with Vitest

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

```tsx
// PatientCard.test.tsx
import { render, screen } from '@testing-library/react'
import { PatientCard } from './PatientCard'

test('renders patient name', () => {
  const patient = { id: '1', name: 'Buddy', species: 'Dog' }
  render(<PatientCard patient={patient} />)

  expect(screen.getByText('Buddy')).toBeInTheDocument()
})
```

---

## 📚 Learning Resources

- **React:** https://react.dev/
- **TypeScript:** https://typescriptlang.org/docs/
- **Tailwind CSS:** https://tailwindcss.com/docs
- **Radix UI:** https://radix-ui.com/
- **React Hook Form:** https://react-hook-form.com/
- **React Query:** https://tanstack.com/query/latest
- **React Router:** https://reactrouter.com/

---

**Happy coding!** 🚀 The frontend is well-structured and ready for API integration. Follow the patterns established and you'll build great features quickly.
