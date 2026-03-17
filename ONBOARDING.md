# 🎓 Veterinary Management System - Developer Onboarding

Welcome to the team! This document will help you get up and running with the Veterinary Clinic Management System.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [System Requirements](#system-requirements)
3. [Quick Setup (30 minutes)](#quick-setup)
4. [Architecture Overview](#architecture-overview)
5. [Project Structure](#project-structure)
6. [Development Workflow](#development-workflow)
7. [Key Concepts](#key-concepts)
8. [Common Tasks](#common-tasks)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Resources & Documentation](#resources--documentation)
12. [Getting Help](#getting-help)

---

## 🎯 Project Overview

### What We're Building

A full-stack veterinary clinic management system that handles:
- Patient (pet) records management
- Appointment scheduling
- Visit workflows (6-step process for consultations)
- Billing and invoicing with PDF generation
- Prescription management with PDF generation
- Medical records (OPD/IPD)
- File uploads for visit images
- Dashboard analytics

### Tech Stack

**Frontend:**
- React 19 + TypeScript
- Vite (build tool)
- Tailwind CSS v4 + Radix UI (components)
- React Router v7 (routing)
- React Hook Form + Zod (forms)
- @tanstack/react-query (server state, TODO)
- Axios (HTTP client, TODO)

**Backend:**
- Go 1.21+
- Fiber v3 (web framework)
- PostgreSQL 15 (database)
- pgx v5 (PostgreSQL driver)
- JWT (authentication)
- Docker (containerization)

### Current Status

✅ **Phase 1 Complete (35%):**
- Backend infrastructure
- Authentication system
- Patient management (reference implementation)
- Database schema (all tables)
- Docker development environment

⏳ **In Progress:**
- Remaining backend modules (appointments, visits, bills, prescriptions)
- Frontend API integration
- File upload system

---

## 💻 System Requirements

### Required Software

| Software | Minimum Version | Download |
|----------|----------------|----------|
| **Go** | 1.21+ | https://go.dev/dl/ |
| **Node.js** | 18+ | https://nodejs.org/ |
| **PostgreSQL** | 15+ | https://postgresql.org/download/ |
| **Docker** | 20+ | https://docker.com/get-started |
| **Docker Compose** | 2.0+ | Included with Docker Desktop |
| **Git** | 2.30+ | https://git-scm.com/ |

### Optional Tools

- **Visual Studio Code** - Recommended IDE
- **Postman** / **Insomnia** - API testing
- **pgAdmin** / **DBeaver** - Database management
- **Go extension** for VS Code
- **ESLint** + **Prettier** extensions for VS Code

### VS Code Extensions (Recommended)

```json
{
  "recommendations": [
    "golang.go",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-azuretools.vscode-docker",
    "ckolkman.vscode-postgres"
  ]
}
```

---

## 🚀 Quick Setup (30 minutes)

### Step 1: Clone & Install (5 minutes)

```bash
# Clone the repository (replace with actual URL when available)
git clone <repository-url>
cd vet-app

# Install frontend dependencies
npm install

# Install Go dependencies
cd backend
go mod download
go mod tidy
cd ..
```

### Step 2: Environment Setup (5 minutes)

```bash
# Backend environment
cd backend
cp .env.example .env
# Edit .env if needed (default values work for development)

# Frontend environment (create when needed)
cd ..
echo 'VITE_API_URL=http://localhost:8080/api/v1' > .env.local
```

### Step 3: Database Setup (10 minutes)

```bash
cd backend

# Start PostgreSQL with Docker
docker-compose up -d postgres

# Wait for PostgreSQL to be ready (check health)
docker-compose ps

# Install migration tool (one-time)
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# Run migrations
migrate -path migrations \
  -database "postgresql://vetuser:vetpass@localhost:5432/vetclinic?sslmode=disable" \
  up

# Load seed data
psql postgresql://vetuser:vetpass@localhost:5432/vetclinic < scripts/seed.sql

# Verify data loaded
psql postgresql://vetuser:vetpass@localhost:5432/vetclinic -c "SELECT COUNT(*) FROM users;"
```

Expected output: `count = 4`

### Step 4: Start Backend (5 minutes)

```bash
# From backend directory
go run cmd/api/main.go
```

You should see:
```
Database connected successfully
Starting server on 0.0.0.0:8080
```

Test it:
```bash
# In a new terminal
curl http://localhost:8080/health
# Expected: {"status":"ok","env":"development"}
```

### Step 5: Start Frontend (5 minutes)

```bash
# In a new terminal, from project root
npm run dev
```

You should see:
```
VITE v7.3.1  ready in XXX ms

➜  Local:   http://localhost:5173/
```

Visit http://localhost:5173 in your browser.

### Step 6: Test Authentication (5 minutes)

**Option A: Using the UI**
1. Open http://localhost:5173
2. Currently uses in-memory data (no login yet)
3. You can browse patients, create appointments, etc.

**Option B: Using curl (test backend)**
```bash
# Login
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@happypaws.vet",
    "password": "admin123"
  }' | jq

# Save the accessToken from response
export TOKEN="<your-access-token>"

# Get patients
curl http://localhost:8080/api/v1/patients \
  -H "Authorization: Bearer $TOKEN" | jq
```

✅ **If all steps work, you're ready to code!**

---

## 🏗️ Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Components  │  │    Pages     │  │   Routing    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │   Store.ts   │  │     UI       │  (Radix + Tailwind)    │
│  │ (in-memory)  │  │  Components  │                         │
│  └──────────────┘  └──────────────┘                         │
│                                                               │
│  TODO: Replace store with API calls via React Query         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTP + JSON
                     │ JWT Bearer Token
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     BACKEND (Go)                             │
│                                                               │
│  ┌─────────────────────────────────────────────────┐        │
│  │               main.go (Entry Point)              │        │
│  │          Routes + Middleware Registration        │        │
│  └────────────────────┬────────────────────────────┘        │
│                       │                                       │
│         ┌─────────────┴─────────────┐                        │
│         ▼                           ▼                        │
│  ┌─────────────┐            ┌─────────────┐                 │
│  │ Middleware  │            │  Handlers   │                 │
│  │             │            │             │                 │
│  │ • Auth      │───────────▶│ • Auth      │                 │
│  │ • CORS      │            │ • Patients  │                 │
│  │ • Logger    │            │ • TODO      │                 │
│  └─────────────┘            └──────┬──────┘                 │
│                                    │                         │
│                                    ▼                         │
│                             ┌─────────────┐                  │
│                             │  Services   │                  │
│                             │             │                  │
│                             │ Business    │                  │
│                             │ Logic       │                  │
│                             └──────┬──────┘                  │
│                                    │                         │
│                                    ▼                         │
│                             ┌─────────────┐                  │
│                             │ Repositories│                  │
│                             │             │                  │
│                             │ Database    │                  │
│                             │ Operations  │                  │
│                             └──────┬──────┘                  │
└────────────────────────────────────┼──────────────────────────┘
                                     │
                                     │ SQL Queries
                                     ▼
                          ┌─────────────────────┐
                          │   PostgreSQL DB     │
                          │                     │
                          │  • 13 Tables        │
                          │  • JSON Support     │
                          │  • Full-text Search │
                          └─────────────────────┘
```

### Backend Layer Architecture

```
Request Flow:
  HTTP Request
      ↓
  Middleware (Auth, CORS, Logger)
      ↓
  Handler (Parse request, validate)
      ↓
  Service (Business logic, validation)
      ↓
  Repository (Database operations)
      ↓
  PostgreSQL
      ↓
  Repository (Map to models)
      ↓
  Service (Transform data)
      ↓
  Handler (Format response)
      ↓
  HTTP Response
```

**Example Flow - Get Patient:**
```
GET /api/v1/patients/1
  ↓
Middleware: Check JWT → Extract userID
  ↓
PatientHandler.Get() → Validate ID
  ↓
PatientService.Get() → Check permissions
  ↓
PatientRepository.GetByID() → SELECT query
  ↓
PostgreSQL: Return row
  ↓
Repository: Map to Pet struct
  ↓
Service: Return Pet
  ↓
Handler: JSON response
```

---

## 📁 Project Structure

### Frontend Structure

```
src/
├── components/           # Reusable UI components
│   ├── ui/              # Radix UI component wrappers
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   └── ...
│   ├── app-sidebar.tsx  # Main navigation
│   └── mobile-nav.tsx   # Mobile navigation
│
├── pages/               # Route pages
│   ├── Dashboard.tsx    # Main dashboard
│   ├── Patients.tsx     # Patient list/management
│   ├── Appointments.tsx # Appointment scheduling
│   ├── Visits.tsx       # Visit list
│   ├── VisitDetail.tsx  # Visit workflow (6 steps)
│   ├── Queue.tsx        # Patient queue
│   ├── Billing.tsx      # Billing & invoices
│   ├── Prescriptions.tsx# Prescription management
│   └── MedicalRecords.tsx # OPD/IPD records
│
├── lib/                 # Utilities & state
│   ├── store.ts        # In-memory state (TODO: replace)
│   └── utils.ts        # Helper functions
│
├── hooks/               # Custom React hooks
│   └── use-mobile.tsx
│
├── App.tsx             # Main app with routing
├── main.tsx            # Entry point
└── index.css           # Global styles
```

### Backend Structure

```
backend/
├── cmd/
│   └── api/
│       └── main.go                    # 🚪 Entry point
│
├── internal/
│   ├── config/
│   │   └── config.go                  # ⚙️ Configuration management
│   │
│   ├── handlers/                      # 🎯 HTTP Handlers (Controllers)
│   │   ├── auth_handler.go           # Login, register, profile
│   │   ├── patient_handler.go        # Patient CRUD
│   │   └── [TODO: other handlers]
│   │
│   ├── middleware/                    # 🔒 HTTP Middleware
│   │   ├── auth.go                   # JWT authentication
│   │   ├── cors.go                   # CORS configuration
│   │   └── logger.go                 # Request logging
│   │
│   ├── models/                        # 📦 Data Models
│   │   ├── user.go                   # User, Login, CreateUser DTOs
│   │   ├── patient.go                # Pet, CreatePet, UpdatePet DTOs
│   │   ├── appointment.go
│   │   ├── visit.go
│   │   ├── bill.go
│   │   ├── prescription.go
│   │   └── common.go                 # ErrorResponse, PaginationMeta
│   │
│   ├── repository/                    # 🗄️ Database Layer
│   │   ├── user_repository.go        # User DB operations
│   │   ├── patient_repository.go     # Patient DB operations
│   │   └── [TODO: other repos]
│   │
│   ├── service/                       # 💼 Business Logic Layer
│   │   ├── auth_service.go           # Authentication logic
│   │   ├── patient_service.go        # Patient business rules
│   │   └── [TODO: other services]
│   │
│   └── utils/                         # 🛠️ Utilities
│       ├── jwt.go                    # JWT generation/validation
│       ├── password.go               # Password hashing
│       ├── database.go               # DB connection pooling
│       └── response.go               # Response helpers
│
├── migrations/                        # 📊 Database Migrations
│   ├── 000001_init_schema.up.sql    # Create tables
│   └── 000001_init_schema.down.sql  # Drop tables
│
├── scripts/
│   └── seed.sql                      # 🌱 Sample data
│
├── docker-compose.yml                # 🐳 Development environment
├── Dockerfile                        # 🐳 Production container
├── .env                              # 🔐 Environment variables
└── go.mod                            # 📦 Go dependencies
```

### Key Files Explained

**Frontend:**
- `App.tsx` - Main component with routing
- `lib/store.ts` - Current in-memory state (will be replaced)
- `pages/VisitDetail.tsx` - Complex 6-step workflow
- `components/ui/*` - Radix UI wrapper components

**Backend:**
- `cmd/api/main.go` - Entry point, route registration
- `internal/config/config.go` - Viper configuration
- `internal/middleware/auth.go` - JWT validation
- `internal/handlers/patient_handler.go` - Reference implementation
- `internal/repository/patient_repository.go` - Database queries
- `internal/service/patient_service.go` - Business logic

---

## 🔄 Development Workflow

### Daily Development Process

1. **Start Development Environment**
   ```bash
   # Terminal 1: Database
   cd backend && docker-compose up postgres

   # Terminal 2: Backend API
   cd backend && go run cmd/api/main.go

   # Terminal 3: Frontend
   npm run dev
   ```

2. **Make Changes**
   - Frontend: Hot reload automatically (Vite)
   - Backend: Restart `go run cmd/api/main.go` after changes
   - Database: Apply migrations if schema changes

3. **Test Your Changes**
   - Frontend: Check browser at http://localhost:5173
   - Backend: Use curl/Postman to test API
   - Database: Use psql or pgAdmin

4. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add appointment management"
   git push origin feature/appointments
   ```

### Git Workflow

**Branch Naming:**
- `feature/appointment-scheduling` - New features
- `fix/patient-search-bug` - Bug fixes
- `refactor/auth-service` - Code improvements
- `docs/api-documentation` - Documentation

**Commit Messages:**
```
feat: add appointment scheduling endpoint
fix: resolve patient search pagination issue
refactor: improve error handling in auth service
docs: update API documentation for visits
test: add unit tests for patient service
```

---

## 🔑 Key Concepts

### Backend Concepts

#### 1. **Repository Pattern**
Repositories handle all database operations. They don't contain business logic.

```go
// repository/patient_repository.go
func (r *PatientRepository) GetByID(ctx context.Context, id int) (*models.Pet, error) {
    query := `SELECT id, name, species, ... FROM pets WHERE id = $1`
    err := r.db.QueryRow(ctx, query, id).Scan(...)
    return pet, err
}
```

#### 2. **Service Pattern**
Services contain business logic and orchestrate repositories.

```go
// service/patient_service.go
func (s *PatientService) Create(ctx context.Context, clinicID int, req models.CreatePetRequest) (*models.Pet, error) {
    // Validation
    if req.Name == "" {
        return nil, errors.New("name is required")
    }

    // Business logic
    pet := &models.Pet{
        Name: req.Name,
        // ... transform request to model
    }

    // Call repository
    return s.repo.Create(ctx, clinicID, pet)
}
```

#### 3. **Handler Pattern**
Handlers process HTTP requests and responses.

```go
// handlers/patient_handler.go
func (h *PatientHandler) Create(c fiber.Ctx) error {
    var req models.CreatePetRequest
    if err := c.Bind().Body(&req); err != nil {
        return utils.ErrorResponse(c, 400, "invalid_request", "Invalid body")
    }

    pet, err := h.service.Create(c.Context(), 1, req)
    if err != nil {
        return utils.ErrorResponse(c, 500, "creation_failed", err.Error())
    }

    return c.Status(201).JSON(pet)
}
```

#### 4. **JWT Authentication**
```go
// Generate token
token, _ := utils.GenerateToken(user.ID, user.Email, user.Role, secret, expiry)

// Validate token (in middleware)
claims, _ := utils.ValidateToken(tokenString, secret)
c.Locals("userID", claims.UserID)

// Use in handlers
userID := middleware.GetUserID(c)
```

#### 5. **Database Migrations**
```sql
-- migrations/000002_add_column.up.sql
ALTER TABLE pets ADD COLUMN microchip_id VARCHAR(50);

-- migrations/000002_add_column.down.sql
ALTER TABLE pets DROP COLUMN microchip_id;
```

### Frontend Concepts

#### 1. **Component Structure**
```tsx
// Presentational component
export function PatientCard({ patient }: { patient: Patient }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{patient.name}</CardTitle>
      </CardHeader>
    </Card>
  )
}
```

#### 2. **State Management (Current)**
```tsx
// lib/store.ts - In-memory state
const patients = ref<Patient[]>([])

export const addPatient = (patient: Patient) => {
  patients.value.push(patient)
}

// TODO: Replace with React Query
```

#### 3. **Forms with React Hook Form**
```tsx
const form = useForm<FormData>({
  resolver: zodResolver(schema),
})

const onSubmit = form.handleSubmit((data) => {
  // Handle submission
})
```

#### 4. **Routing**
```tsx
// App.tsx
<Routes>
  <Route path="/" element={<Dashboard />} />
  <Route path="/patients" element={<Patients />} />
  <Route path="/visits/:id" element={<VisitDetail />} />
</Routes>
```

---

## 🔨 Common Tasks

### Backend Tasks

#### Add a New Endpoint

1. **Define Model** (`internal/models/your_model.go`)
```go
type YourModel struct {
    ID        int       `json:"id"`
    Name      string    `json:"name"`
    CreatedAt time.Time `json:"createdAt"`
}

type CreateYourModelRequest struct {
    Name string `json:"name" validate:"required"`
}
```

2. **Create Repository** (`internal/repository/your_repository.go`)
```go
type YourRepository struct {
    db *pgxpool.Pool
}

func NewYourRepository(db *pgxpool.Pool) *YourRepository {
    return &YourRepository{db: db}
}

func (r *YourRepository) Create(ctx context.Context, model *YourModel) error {
    query := `INSERT INTO your_table (name) VALUES ($1) RETURNING id, created_at`
    return r.db.QueryRow(ctx, query, model.Name).Scan(&model.ID, &model.CreatedAt)
}
```

3. **Create Service** (`internal/service/your_service.go`)
```go
type YourService struct {
    repo *repository.YourRepository
}

func NewYourService(repo *repository.YourRepository) *YourService {
    return &YourService{repo: repo}
}

func (s *YourService) Create(ctx context.Context, req CreateYourModelRequest) (*YourModel, error) {
    model := &YourModel{Name: req.Name}
    err := s.repo.Create(ctx, model)
    return model, err
}
```

4. **Create Handler** (`internal/handlers/your_handler.go`)
```go
type YourHandler struct {
    service   *service.YourService
    validator *validator.Validate
}

func NewYourHandler(service *service.YourService) *YourHandler {
    return &YourHandler{service: service, validator: validator.New()}
}

func (h *YourHandler) Create(c fiber.Ctx) error {
    var req models.CreateYourModelRequest
    if err := c.Bind().Body(&req); err != nil {
        return utils.ErrorResponse(c, 400, "invalid_request", err.Error())
    }

    model, err := h.service.Create(c.Context(), req)
    if err != nil {
        return utils.ErrorResponse(c, 500, "creation_failed", err.Error())
    }

    return c.Status(201).JSON(model)
}
```

5. **Register Routes** (`cmd/api/main.go`)
```go
// Initialize
yourRepo := repository.NewYourRepository(db)
yourService := service.NewYourService(yourRepo)
yourHandler := handlers.NewYourHandler(yourService)

// Add routes
yours := protected.Group("/yours")
yours.Post("/", yourHandler.Create)
yours.Get("/", yourHandler.List)
yours.Get("/:id", yourHandler.Get)
```

#### Run Database Migration

```bash
# Create new migration
migrate create -ext sql -dir migrations -seq add_new_table

# Apply migrations
migrate -path migrations -database $DATABASE_URL up

# Rollback last migration
migrate -path migrations -database $DATABASE_URL down 1

# Check version
migrate -path migrations -database $DATABASE_URL version
```

#### Test an Endpoint

```bash
# Get token
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@happypaws.vet","password":"admin123"}' \
  | jq -r '.accessToken')

# Use token
curl http://localhost:8080/api/v1/patients \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Frontend Tasks

#### Add a New Page

1. **Create Page Component** (`src/pages/YourPage.tsx`)
```tsx
export default function YourPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Your Page</h1>
      {/* Content */}
    </div>
  )
}
```

2. **Add Route** (`src/App.tsx`)
```tsx
import YourPage from "@/pages/YourPage"

// In Routes
<Route path="/your-path" element={<YourPage />} />
```

3. **Add Navigation** (`src/components/app-sidebar.tsx`)
```tsx
{
  title: "Your Page",
  url: "/your-path",
  icon: YourIcon,
}
```

#### Create a Form

```tsx
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
})

export function YourForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "" },
  })

  const onSubmit = form.handleSubmit((data) => {
    console.log(data)
    // TODO: Send to API
  })

  return (
    <form onSubmit={onSubmit}>
      <input {...form.register("name")} />
      {form.formState.errors.name && <span>{form.formState.errors.name.message}</span>}
      <button type="submit">Submit</button>
    </form>
  )
}
```

---

## 🧪 Testing

### Backend Testing

#### Manual Testing with curl

```bash
# Health check
curl http://localhost:8080/health

# Login
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@happypaws.vet","password":"admin123"}'

# Create patient
curl -X POST http://localhost:8080/api/v1/patients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Pet",
    "species": "Dog",
    "ownerName": "Test Owner",
    "ownerPhone": "+1-555-9999"
  }'
```

#### Database Testing

```bash
# Connect to database
psql postgresql://vetuser:vetpass@localhost:5432/vetclinic

# Check data
SELECT * FROM pets;
SELECT COUNT(*) FROM appointments;

# Test queries
SELECT p.name, a.date, a.time
FROM pets p
JOIN appointments a ON p.id = a.pet_id;
```

### Frontend Testing

1. **Browser DevTools**
   - Network tab: Check API calls
   - Console: Check for errors
   - React DevTools: Inspect component state

2. **Manual Testing**
   - Create a patient
   - Schedule an appointment
   - Complete a visit workflow
   - Generate a bill

---

## 🚀 Deployment

### Development
```bash
docker-compose up --build
```

### Production (TODO)
- Docker production setup
- CI/CD pipeline with GitHub Actions
- Environment variables management
- SSL/TLS configuration

---

## 📚 Resources & Documentation

### Project Documentation
- **[QUICKSTART.md](QUICKSTART.md)** - 5-minute setup guide
- **[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)** - Current progress
- **[backend/README.md](backend/README.md)** - Backend API docs
- **[backend/IMPLEMENTATION_GUIDE.md](backend/IMPLEMENTATION_GUIDE.md)** - Module creation guide
- **[BACKEND_ONBOARDING.md](BACKEND_ONBOARDING.md)** - Backend deep dive
- **[FRONTEND_ONBOARDING.md](FRONTEND_ONBOARDING.md)** - Frontend deep dive

### External Resources
- **Go:** https://go.dev/doc/
- **Fiber:** https://docs.gofiber.io/
- **PostgreSQL:** https://postgresql.org/docs/
- **React:** https://react.dev/
- **Tailwind:** https://tailwindcss.com/
- **Radix UI:** https://radix-ui.com/

---

## 🆘 Getting Help

### Common Issues

See **Troubleshooting** sections in:
- [QUICKSTART.md](QUICKSTART.md#troubleshooting)
- [backend/README.md](backend/README.md#troubleshooting)

### Ask for Help

1. Check existing documentation
2. Search GitHub issues (when available)
3. Ask team members
4. Create a GitHub issue with:
   - What you tried
   - Expected vs actual behavior
   - Error messages
   - Environment details

---

## 🎯 Your First Task

Follow this checklist for your first day:

- [ ] Complete Quick Setup (30 min)
- [ ] Run backend and test authentication
- [ ] Run frontend and explore UI
- [ ] Read backend/IMPLEMENTATION_GUIDE.md
- [ ] Try creating a patient via API
- [ ] Browse the codebase
- [ ] Pick a small task from the backlog

**Suggested First Tasks:**
1. Add a new field to patient model (easy)
2. Implement appointments list endpoint (medium)
3. Add search to an existing page (medium)

---

Welcome aboard! 🎉 If you have questions, don't hesitate to ask the team.
