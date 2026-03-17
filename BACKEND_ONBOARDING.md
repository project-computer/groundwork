# 🔧 Backend Developer Onboarding Guide

This guide is specifically for backend developers working on the Go API.

---

## 📋 Table of Contents

1. [Backend Architecture Deep Dive](#backend-architecture-deep-dive)
2. [Code Organization & Patterns](#code-organization--patterns)
3. [Database Layer](#database-layer)
4. [Authentication & Authorization](#authentication--authorization)
5. [API Design Principles](#api-design-principles)
6. [Working with the Codebase](#working-with-the-codebase)
7. [Best Practices](#best-practices)
8. [Common Patterns & Snippets](#common-patterns--snippets)
9. [Debugging & Troubleshooting](#debugging--troubleshooting)
10. [Performance Considerations](#performance-considerations)

---

## 🏗️ Backend Architecture Deep Dive

### Layered Architecture

Our backend follows a clean, layered architecture:

```
┌─────────────────────────────────────────────────┐
│                  HTTP Layer                      │
│  • Routing (Fiber)                              │
│  • Middleware (Auth, CORS, Logging)             │
│  • Request/Response handling                     │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│               Handler Layer                      │
│  • Parse HTTP requests                          │
│  • Validate input                               │
│  • Call service methods                         │
│  • Format HTTP responses                        │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│               Service Layer                      │
│  • Business logic                               │
│  • Validation rules                             │
│  • Coordinate repositories                      │
│  • Transform data                               │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│             Repository Layer                     │
│  • Database queries (CRUD)                      │
│  • Data mapping (SQL ↔ Go structs)             │
│  • Transaction management                       │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│               Database Layer                     │
│  • PostgreSQL                                   │
│  • Connection pooling (pgxpool)                 │
└─────────────────────────────────────────────────┘
```

### Why This Architecture?

**Separation of Concerns:**
- Each layer has a single responsibility
- Easy to test each layer independently
- Changes in one layer don't affect others

**Scalability:**
- Can replace database without changing business logic
- Can add caching layer without changing handlers
- Can swap HTTP framework without changing services

**Maintainability:**
- Clear code organization
- Easy to find where logic lives
- New developers can understand quickly

---

## 📦 Code Organization & Patterns

### Directory Structure Explained

```
backend/
├── cmd/
│   └── api/
│       └── main.go              # Application entry point
│                                 # • Initialize dependencies
│                                 # • Register routes
│                                 # • Start server
│
├── internal/                    # Private application code
│   │
│   ├── config/
│   │   └── config.go           # Configuration management
│   │                            # • Load from env/files
│   │                            # • Validate settings
│   │                            # • Provide typed access
│   │
│   ├── handlers/                # HTTP request handlers
│   │   ├── auth_handler.go     # Auth endpoints
│   │   └── patient_handler.go  # Patient endpoints
│   │                            # • Parse request body
│   │                            # • Validate input
│   │                            # • Call service
│   │                            # • Return JSON response
│   │
│   ├── middleware/              # HTTP middleware
│   │   ├── auth.go             # JWT validation
│   │   ├── cors.go             # CORS headers
│   │   └── logger.go           # Request logging
│   │                            # • Run before/after handlers
│   │                            # • Modify request/response
│   │
│   ├── models/                  # Data structures
│   │   ├── user.go             # User types
│   │   └── patient.go          # Patient types
│   │                            # • Database models
│   │                            # • Request DTOs
│   │                            # • Response DTOs
│   │
│   ├── repository/              # Database layer
│   │   ├── user_repository.go
│   │   └── patient_repository.go
│   │                            # • SQL queries
│   │                            # • Data mapping
│   │                            # • Error handling
│   │
│   ├── service/                 # Business logic
│   │   ├── auth_service.go
│   │   └── patient_service.go
│   │                            # • Validation
│   │                            # • Business rules
│   │                            # • Orchestration
│   │
│   └── utils/                   # Shared utilities
│       ├── jwt.go              # Token generation
│       ├── password.go         # Hashing
│       ├── database.go         # DB connection
│       └── response.go         # Response helpers
│
├── migrations/                  # Database migrations
│   ├── 000001_init_schema.up.sql
│   └── 000001_init_schema.down.sql
│
└── scripts/
    └── seed.sql                # Sample data
```

### The Request Flow

Let's trace a complete request through the system:

**Example: Create a Patient**

```
1. Client Request:
   POST /api/v1/patients
   Headers: Authorization: Bearer <token>
   Body: {"name": "Buddy", "species": "Dog", ...}

2. Middleware Chain:
   Logger → logs request
   CORS → sets headers
   Auth → validates JWT, extracts userID

3. Router:
   Matches route: POST /patients → PatientHandler.Create()

4. Handler (patient_handler.go):
   • Binds JSON body to CreatePetRequest struct
   • Validates using validator
   • Extracts clinicID from context
   • Calls service.Create()

5. Service (patient_service.go):
   • Additional business validation
   • Transforms CreatePetRequest to Pet model
   • Sets default values
   • Calls repository.Create()

6. Repository (patient_repository.go):
   • Generates custom ID (C-1, C-2...)
   • Builds SQL INSERT query
   • Executes query
   • Scans result back to Pet struct
   • Returns Pet or error

7. Back through layers:
   Repository → Service → Handler

8. Handler:
   • Formats response
   • Sets status code 201
   • Returns JSON

9. Middleware (on the way out):
   Logger → logs response

10. Client Response:
    Status: 201 Created
    Body: {"id": 6, "customId": "C-6", "name": "Buddy", ...}
```

---

## 🗄️ Database Layer

### Connection Management

We use `pgxpool` for connection pooling:

```go
// utils/database.go
func InitDB(databaseURL string) (*pgxpool.Pool, error) {
    config, _ := pgxpool.ParseConfig(databaseURL)

    // Connection pool settings
    config.MaxConns = 25      // Maximum connections
    config.MinConns = 5       // Minimum idle connections

    pool, _ := pgxpool.NewWithConfig(context.Background(), config)

    // Test connection
    pool.Ping(context.Background())

    return pool, nil
}
```

**Key Points:**
- Pool is initialized once at startup
- Connections are reused automatically
- No need to manually open/close connections
- Thread-safe

### Repository Pattern

Repositories encapsulate all database operations:

```go
type PatientRepository struct {
    db *pgxpool.Pool
}

func NewPatientRepository(db *pgxpool.Pool) *PatientRepository {
    return &PatientRepository{db: db}
}

func (r *PatientRepository) GetByID(ctx context.Context, id int) (*models.Pet, error) {
    pet := &models.Pet{}

    query := `
        SELECT id, clinic_id, custom_id, name, species, breed, age, weight,
               owner_name, owner_phone, owner_email, owner_notes,
               status, created_at, updated_at
        FROM pets
        WHERE id = $1 AND deleted_at IS NULL
    `

    err := r.db.QueryRow(ctx, query, id).Scan(
        &pet.ID, &pet.ClinicID, &pet.CustomID, &pet.Name, &pet.Species,
        &pet.Breed, &pet.Age, &pet.Weight, &pet.OwnerName, &pet.OwnerPhone,
        &pet.OwnerEmail, &pet.OwnerNotes, &pet.Status,
        &pet.CreatedAt, &pet.UpdatedAt,
    )

    if err == pgx.ErrNoRows {
        return nil, errors.New("patient not found")
    }

    return pet, err
}
```

**Best Practices:**
- Use parameterized queries ($1, $2...) to prevent SQL injection
- Always use context for timeouts/cancellation
- Handle `pgx.ErrNoRows` separately
- Return clear error messages
- Use `sql.Null*` types for nullable columns

### Handling NULL Values

PostgreSQL NULL values need special handling:

```go
// In models
type Pet struct {
    Name       string         `json:"name"`        // NOT NULL in DB
    Breed      sql.NullString `json:"breed,omitempty"` // NULL in DB
    Age        sql.NullFloat64 `json:"age,omitempty"`
    OwnerEmail sql.NullString `json:"ownerEmail,omitempty"`
}

// Scanning from database
err := rows.Scan(&pet.Name, &pet.Breed, &pet.Age, &pet.OwnerEmail)

// Inserting to database
_, err := db.Exec(query, pet.Name, pet.Breed, pet.Age, pet.OwnerEmail)

// Setting values
pet.Breed = sql.NullString{String: "Labrador", Valid: true}

// Checking if NULL
if pet.Breed.Valid {
    fmt.Println(pet.Breed.String)
}
```

### JSON Fields

We store complex data as JSON in PostgreSQL:

```go
// In models
type Visit struct {
    Vitals      json.RawMessage `json:"vitals"`      // {"temperature": 38.5, ...}
    Steps       json.RawMessage `json:"steps"`       // {"basicInfo": true, ...}
    Medications json.RawMessage `json:"medications"` // [{"name": "...", ...}]
}

// Reading from DB
err := rows.Scan(&visit.Vitals, &visit.Steps, &visit.Medications)

// Writing to DB
vitalsJSON, _ := json.Marshal(vitalsMap)
_, err := db.Exec(query, vitalsJSON, ...)

// Using in handler
var vitals map[string]interface{}
json.Unmarshal(visit.Vitals, &vitals)
```

### Pagination Pattern

All list endpoints should support pagination:

```go
func (r *PatientRepository) List(ctx context.Context, clinicID int, query models.PetListQuery) ([]*models.Pet, int, error) {
    // Set defaults
    if query.Page < 1 { query.Page = 1 }
    if query.Limit < 1 || query.Limit > 100 { query.Limit = 20 }

    offset := (query.Page - 1) * query.Limit

    // Build WHERE clause
    whereClauses := []string{"clinic_id = $1", "deleted_at IS NULL"}
    args := []interface{}{clinicID}
    argIdx := 2

    if query.Search != "" {
        whereClauses = append(whereClauses,
            fmt.Sprintf("(name ILIKE $%d OR owner_name ILIKE $%d)", argIdx, argIdx))
        args = append(args, "%"+query.Search+"%")
        argIdx++
    }

    whereSQL := strings.Join(whereClauses, " AND ")

    // Get total count
    var total int
    countQuery := fmt.Sprintf("SELECT COUNT(*) FROM pets WHERE %s", whereSQL)
    r.db.QueryRow(ctx, countQuery, args...).Scan(&total)

    // Get paginated results
    listQuery := fmt.Sprintf(`
        SELECT * FROM pets
        WHERE %s
        ORDER BY created_at DESC
        LIMIT $%d OFFSET $%d
    `, whereSQL, argIdx, argIdx+1)
    args = append(args, query.Limit, offset)

    rows, _ := r.db.Query(ctx, listQuery, args...)
    defer rows.Close()

    var pets []*models.Pet
    for rows.Next() {
        pet := &models.Pet{}
        rows.Scan(...)
        pets = append(pets, pet)
    }

    return pets, total, nil
}
```

### Transactions

For operations that modify multiple tables:

```go
func (r *Repository) CompleteVisitAndCreateRecords(ctx context.Context, visitID int) error {
    // Begin transaction
    tx, err := r.db.Begin(ctx)
    if err != nil {
        return err
    }
    defer tx.Rollback(ctx) // Rollback if not committed

    // Update visit status
    _, err = tx.Exec(ctx, "UPDATE visits SET status = 'Complete' WHERE id = $1", visitID)
    if err != nil {
        return err
    }

    // Create OPD record
    _, err = tx.Exec(ctx, "INSERT INTO opd_records (...) VALUES (...)")
    if err != nil {
        return err
    }

    // Commit transaction
    return tx.Commit(ctx)
}
```

---

## 🔐 Authentication & Authorization

### JWT Flow

```
1. User Login:
   POST /auth/login
   Body: {email, password}

2. Backend validates credentials:
   • Check email exists
   • Verify password hash

3. Generate tokens:
   • Access token (15 min expiry)
   • Refresh token (7 days expiry)

4. Return tokens to client:
   Response: {accessToken, refreshToken, user}

5. Client stores tokens:
   • localStorage or memory
   • Sends in Authorization header

6. Subsequent requests:
   Header: Authorization: Bearer <access-token>

7. Middleware validates:
   • Extract token from header
   • Verify signature
   • Check expiry
   • Extract claims (userID, role)
   • Store in context

8. Handler uses claims:
   userID := middleware.GetUserID(c)
```

### JWT Implementation

**Generate Token:**
```go
// utils/jwt.go
func GenerateToken(userID int, email, role string, secret string, expiry time.Duration) (string, error) {
    claims := Claims{
        UserID: userID,
        Email:  email,
        Role:   role,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
        },
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString([]byte(secret))
}
```

**Validate Token:**
```go
func ValidateToken(tokenString, secret string) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
        // Verify signing method
        if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, fmt.Errorf("unexpected signing method")
        }
        return []byte(secret), nil
    })

    if err != nil {
        return nil, err
    }

    if claims, ok := token.Claims.(*Claims); ok && token.Valid {
        return claims, nil
    }

    return nil, fmt.Errorf("invalid token")
}
```

### Auth Middleware

```go
// middleware/auth.go
func (m *AuthMiddleware) Protected() fiber.Handler {
    return func(c fiber.Ctx) error {
        // Extract token from header
        authHeader := c.Get("Authorization")
        if authHeader == "" {
            return c.Status(401).JSON(fiber.Map{"error": "Missing authorization header"})
        }

        parts := strings.Split(authHeader, " ")
        if len(parts) != 2 || parts[0] != "Bearer" {
            return c.Status(401).JSON(fiber.Map{"error": "Invalid authorization format"})
        }

        tokenString := parts[1]

        // Validate token
        claims, err := utils.ValidateToken(tokenString, m.jwtSecret)
        if err != nil {
            return c.Status(401).JSON(fiber.Map{"error": "Invalid or expired token"})
        }

        // Store in context
        c.Locals("userID", claims.UserID)
        c.Locals("userEmail", claims.Email)
        c.Locals("userRole", claims.Role)

        return c.Next()
    }
}
```

### Role-Based Access Control

```go
func (m *AuthMiddleware) RequireRole(roles ...string) fiber.Handler {
    return func(c fiber.Ctx) error {
        userRole := c.Locals("userRole")
        if userRole == nil {
            return c.Status(401).JSON(fiber.Map{"error": "Unauthorized"})
        }

        role := userRole.(string)
        for _, r := range roles {
            if role == r {
                return c.Next()
            }
        }

        return c.Status(403).JSON(fiber.Map{"error": "Insufficient permissions"})
    }
}

// Usage in routes
users := protected.Group("/users", authMiddleware.RequireRole("admin"))
```

### Password Security

```go
// utils/password.go
func HashPassword(password string) (string, error) {
    // bcrypt automatically handles salting
    hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    return string(hashedBytes), err
}

func CheckPassword(password, hash string) error {
    return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}

// Usage in service
func (s *AuthService) Login(ctx context.Context, req models.LoginRequest) (*models.LoginResponse, error) {
    user, _ := s.userRepo.GetByEmail(ctx, req.Email)

    // Verify password
    if err := utils.CheckPassword(req.Password, user.PasswordHash); err != nil {
        return nil, errors.New("invalid credentials")
    }

    // Generate tokens...
}
```

---

## 🎨 API Design Principles

### RESTful Conventions

```
Resource: Patients

GET    /patients           List all patients (with pagination)
POST   /patients           Create new patient
GET    /patients/:id       Get patient by ID
PUT    /patients/:id       Update patient
DELETE /patients/:id       Delete patient (soft delete)

Nested Resources:
GET    /patients/:id/history      Get patient's medical history
GET    /visits/:id/images         List visit images
POST   /visits/:id/images         Upload visit image
DELETE /visits/:id/images/:imgId  Delete visit image

Actions (non-CRUD):
POST   /appointments/:id/checkin  Check-in appointment
POST   /bills/:id/pay             Mark bill as paid
GET    /bills/:id/pdf             Download bill PDF
POST   /visits/:id/complete       Mark visit complete
POST   /visits/:id/duplicate      Duplicate visit
```

### Request/Response Format

**Request Body (POST/PUT):**
```json
{
  "name": "Buddy",
  "species": "Dog",
  "breed": "Labrador",
  "age": 3,
  "weight": 28.5,
  "ownerName": "John Doe",
  "ownerPhone": "+1-555-1234",
  "ownerEmail": "john@example.com"
}
```

**Success Response:**
```json
{
  "id": 6,
  "customId": "C-6",
  "name": "Buddy",
  "species": "Dog",
  "breed": "Labrador",
  "age": 3,
  "weight": 28.5,
  "ownerName": "John Doe",
  "ownerPhone": "+1-555-1234",
  "ownerEmail": "john@example.com",
  "status": "Active",
  "createdAt": "2026-03-17T10:30:00Z",
  "updatedAt": "2026-03-17T10:30:00Z"
}
```

**Error Response:**
```json
{
  "error": "validation_error",
  "message": "Name is required"
}
```

**Paginated Response:**
```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 45,
    "totalPages": 3
  }
}
```

### HTTP Status Codes

```
200 OK              - Successful GET, PUT
201 Created         - Successful POST
204 No Content      - Successful DELETE
400 Bad Request     - Validation error, malformed request
401 Unauthorized    - Missing or invalid token
403 Forbidden       - Insufficient permissions
404 Not Found       - Resource doesn't exist
409 Conflict        - Duplicate resource (e.g., email exists)
500 Internal Error  - Server error
```

### Error Handling

```go
// utils/response.go
func ErrorResponse(c fiber.Ctx, status int, err string, message ...string) error {
    msg := ""
    if len(message) > 0 {
        msg = message[0]
    }
    return c.Status(status).JSON(models.ErrorResponse{
        Error:   err,
        Message: msg,
    })
}

// Usage in handlers
func (h *Handler) Create(c fiber.Ctx) error {
    var req models.CreateRequest
    if err := c.Bind().Body(&req); err != nil {
        return utils.ErrorResponse(c, 400, "invalid_request", "Invalid JSON body")
    }

    if err := h.validator.Struct(req); err != nil {
        return utils.ErrorResponse(c, 400, "validation_error", err.Error())
    }

    result, err := h.service.Create(c.Context(), req)
    if err != nil {
        if err.Error() == "already exists" {
            return utils.ErrorResponse(c, 409, "duplicate_resource", "Resource already exists")
        }
        return utils.ErrorResponse(c, 500, "creation_failed", err.Error())
    }

    return c.Status(201).JSON(result)
}
```

---

## 🔧 Working with the Codebase

### Adding a New Module (Complete Example)

Let's add an **Appointments** module step-by-step.

#### Step 1: Model (if not exists)

Model already exists in `internal/models/appointment.go`. If creating new:

```go
type Appointment struct {
    ID               int       `json:"id"`
    CustomID         string    `json:"customId"`
    PetID            int       `json:"petId"`
    PetName          string    `json:"petName"`
    Date             time.Time `json:"date"`
    Time             string    `json:"time"`
    Status           string    `json:"status"`
    VeterinarianID   int       `json:"veterinarianId,omitempty"`
    VeterinarianName string    `json:"veterinarianName,omitempty"`
    // ... more fields
}

type CreateAppointmentRequest struct {
    PetID            int    `json:"petId" validate:"required"`
    PetName          string `json:"petName" validate:"required"`
    Date             string `json:"date" validate:"required"`
    Time             string `json:"time" validate:"required"`
    Type             string `json:"type" validate:"required"`
    VeterinarianID   int    `json:"veterinarianId,omitempty"`
    VeterinarianName string `json:"veterinarianName,omitempty"`
}
```

#### Step 2: Repository

Create `internal/repository/appointment_repository.go`:

```go
package repository

import (
    "context"
    "fmt"
    "time"

    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/vet-clinic/api/internal/models"
)

type AppointmentRepository struct {
    db *pgxpool.Pool
}

func NewAppointmentRepository(db *pgxpool.Pool) *AppointmentRepository {
    return &AppointmentRepository{db: db}
}

func (r *AppointmentRepository) Create(ctx context.Context, clinicID int, apt *models.Appointment) error {
    // Generate custom ID
    var count int
    err := r.db.QueryRow(ctx,
        "SELECT COUNT(*) FROM appointments WHERE clinic_id = $1",
        clinicID,
    ).Scan(&count)
    if err != nil {
        return err
    }

    apt.CustomID = fmt.Sprintf("APT-%d", count+1)
    apt.ClinicID = clinicID

    query := `
        INSERT INTO appointments (
            clinic_id, custom_id, pet_id, pet_name, owner_name,
            date, time, type, status, veterinarian_id, veterinarian_name,
            created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, created_at, updated_at
    `

    return r.db.QueryRow(ctx, query,
        apt.ClinicID, apt.CustomID, apt.PetID, apt.PetName, apt.OwnerName,
        apt.Date, apt.Time, apt.Type, apt.Status,
        apt.VeterinarianID, apt.VeterinarianName, apt.CreatedBy,
    ).Scan(&apt.ID, &apt.CreatedAt, &apt.UpdatedAt)
}

func (r *AppointmentRepository) GetByID(ctx context.Context, id int) (*models.Appointment, error) {
    apt := &models.Appointment{}

    query := `
        SELECT id, clinic_id, custom_id, pet_id, pet_name, owner_name,
               date, time, type, status, notes,
               veterinarian_id, veterinarian_name, created_by,
               created_at, updated_at
        FROM appointments
        WHERE id = $1
    `

    err := r.db.QueryRow(ctx, query, id).Scan(
        &apt.ID, &apt.ClinicID, &apt.CustomID, &apt.PetID, &apt.PetName, &apt.OwnerName,
        &apt.Date, &apt.Time, &apt.Type, &apt.Status, &apt.Notes,
        &apt.VeterinarianID, &apt.VeterinarianName, &apt.CreatedBy,
        &apt.CreatedAt, &apt.UpdatedAt,
    )

    return apt, err
}

// Add List, Update, Delete methods...
```

#### Step 3: Service

Create `internal/service/appointment_service.go`:

```go
package service

import (
    "context"
    "time"

    "github.com/vet-clinic/api/internal/models"
    "github.com/vet-clinic/api/internal/repository"
)

type AppointmentService struct {
    repo *repository.AppointmentRepository
}

func NewAppointmentService(repo *repository.AppointmentRepository) *AppointmentService {
    return &AppointmentService{repo: repo}
}

func (s *AppointmentService) Create(ctx context.Context, clinicID, userID int, req models.CreateAppointmentRequest) (*models.Appointment, error) {
    // Parse date
    date, err := time.Parse("2006-01-02", req.Date)
    if err != nil {
        return nil, errors.New("invalid date format")
    }

    apt := &models.Appointment{
        PetID:     req.PetID,
        PetName:   req.PetName,
        OwnerName: req.OwnerName,
        Date:      date,
        Time:      req.Time,
        Type:      req.Type,
        Status:    "Scheduled",
        CreatedBy: userID,
    }

    if req.VeterinarianID > 0 {
        apt.VeterinarianID = sql.NullInt32{Int32: int32(req.VeterinarianID), Valid: true}
        apt.VeterinarianName = sql.NullString{String: req.VeterinarianName, Valid: true}
    }

    err = s.repo.Create(ctx, clinicID, apt)
    return apt, err
}

// Add Get, List, Update, Delete methods...
```

#### Step 4: Handler

Create `internal/handlers/appointment_handler.go`:

```go
package handlers

import (
    "github.com/go-playground/validator/v10"
    "github.com/gofiber/fiber/v3"
    "github.com/vet-clinic/api/internal/middleware"
    "github.com/vet-clinic/api/internal/models"
    "github.com/vet-clinic/api/internal/service"
    "github.com/vet-clinic/api/internal/utils"
)

type AppointmentHandler struct {
    service   *service.AppointmentService
    validator *validator.Validate
}

func NewAppointmentHandler(service *service.AppointmentService) *AppointmentHandler {
    return &AppointmentHandler{
        service:   service,
        validator: validator.New(),
    }
}

func (h *AppointmentHandler) Create(c fiber.Ctx) error {
    var req models.CreateAppointmentRequest
    if err := c.Bind().Body(&req); err != nil {
        return utils.ErrorResponse(c, 400, "invalid_request", "Invalid request body")
    }

    if err := h.validator.Struct(req); err != nil {
        return utils.ErrorResponse(c, 400, "validation_error", err.Error())
    }

    userID := middleware.GetUserID(c)
    clinicID := 1 // TODO: Get from user context in multi-clinic setup

    apt, err := h.service.Create(c.Context(), clinicID, userID, req)
    if err != nil {
        return utils.ErrorResponse(c, 500, "creation_failed", err.Error())
    }

    return c.Status(201).JSON(apt)
}

func (h *AppointmentHandler) Get(c fiber.Ctx) error {
    id, err := c.ParamsInt("id")
    if err != nil {
        return utils.ErrorResponse(c, 400, "invalid_id", "Invalid appointment ID")
    }

    apt, err := h.service.Get(c.Context(), id)
    if err != nil {
        return utils.ErrorResponse(c, 404, "not_found", "Appointment not found")
    }

    return c.JSON(apt)
}

// Add List, Update, Delete handlers...
```

#### Step 5: Register Routes

Update `cmd/api/main.go`:

```go
// Initialize
appointmentRepo := repository.NewAppointmentRepository(db)
appointmentService := service.NewAppointmentService(appointmentRepo)
appointmentHandler := handlers.NewAppointmentHandler(appointmentService)

// Register routes
appointments := protected.Group("/appointments")
appointments.Get("/", appointmentHandler.List)
appointments.Post("/", appointmentHandler.Create)
appointments.Get("/:id", appointmentHandler.Get)
appointments.Put("/:id", appointmentHandler.Update)
appointments.Delete("/:id", appointmentHandler.Delete)
appointments.Post("/:id/checkin", appointmentHandler.CheckIn)
```

#### Step 6: Test

```bash
# Restart API
go run cmd/api/main.go

# Get token
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@happypaws.vet","password":"admin123"}' \
  | jq -r '.accessToken')

# Create appointment
curl -X POST http://localhost:8080/api/v1/appointments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "petId": 1,
    "petName": "Max",
    "ownerName": "John Smith",
    "date": "2026-03-20",
    "time": "10:00:00",
    "type": "Checkup",
    "veterinarianId": 2,
    "veterinarianName": "Dr. Michael Chen"
  }' | jq

# Get appointments
curl http://localhost:8080/api/v1/appointments \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## ✅ Best Practices

### 1. Error Handling

**DO:**
```go
// Return meaningful errors
if user == nil {
    return nil, errors.New("user not found")
}

// Log errors before returning
if err != nil {
    log.Printf("Failed to create patient: %v", err)
    return err
}

// Use custom error types for specific cases
type NotFoundError struct {
    Resource string
    ID       int
}
```

**DON'T:**
```go
// Don't ignore errors
result, _ := someFunction()

// Don't return generic errors
return errors.New("error")

// Don't expose internal errors to clients
return c.JSON(fiber.Map{"error": err.Error()}) // Can leak DB info
```

### 2. Database Queries

**DO:**
```go
// Use parameterized queries
query := "SELECT * FROM users WHERE id = $1"
db.QueryRow(ctx, query, userID)

// Check for ErrNoRows
if err == pgx.ErrNoRows {
    return nil, errors.New("not found")
}

// Use transactions for multi-table operations
tx, _ := db.Begin(ctx)
defer tx.Rollback(ctx)
// ... operations
tx.Commit(ctx)
```

**DON'T:**
```go
// Never concatenate SQL
query := "SELECT * FROM users WHERE id = " + id // SQL INJECTION!

// Don't forget to close rows
rows, _ := db.Query(...)
// Must: defer rows.Close()

// Don't use SELECT *
query := "SELECT * FROM users" // Inefficient, breaks if columns change
```

### 3. Context Usage

**DO:**
```go
// Pass context through call chain
func (s *Service) DoSomething(ctx context.Context, id int) error {
    return s.repo.Query(ctx, id)
}

// Use context for timeouts
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

// Check context cancellation in long operations
for {
    select {
    case <-ctx.Done():
        return ctx.Err()
    default:
        // Continue work
    }
}
```

### 4. Validation

**DO:**
```go
// Use struct tags for validation
type CreateUserRequest struct {
    Email    string `json:"email" validate:"required,email"`
    Password string `json:"password" validate:"required,min=8"`
    Name     string `json:"name" validate:"required"`
}

// Validate in handler
if err := h.validator.Struct(req); err != nil {
    return utils.ErrorResponse(c, 400, "validation_error", err.Error())
}

// Add business logic validation in service
if user.Age < 0 {
    return errors.New("age cannot be negative")
}
```

### 5. Security

**DO:**
```go
// Hash passwords
hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)

// Use environment variables for secrets
jwtSecret := os.Getenv("JWT_SECRET")

// Validate and sanitize input
email = strings.TrimSpace(strings.ToLower(email))

// Set appropriate permissions
if role != "admin" {
    return errors.New("unauthorized")
}
```

**DON'T:**
```go
// Never store plain passwords
user.Password = password // NO!

// Never hardcode secrets
const jwtSecret = "my-secret-key" // NO!

// Never trust user input
query := "SELECT * FROM " + tableName // SQL injection!
```

### 6. Logging

**DO:**
```go
// Log important operations
log.Printf("User %d logged in", userID)
log.Printf("Created appointment %s", apt.CustomID)

// Log errors with context
log.Printf("Failed to create patient: %v (clinic: %d, user: %d)", err, clinicID, userID)

// Use structured logging in production
logger.Info("request completed",
    "method", c.Method(),
    "path", c.Path(),
    "status", c.Response().StatusCode(),
    "duration", duration,
)
```

---

## 🔍 Debugging & Troubleshooting

### Common Issues

**1. Database Connection Fails**
```bash
# Check if PostgreSQL is running
docker-compose ps

# View logs
docker-compose logs postgres

# Test connection
psql postgresql://vetuser:vetpass@localhost:5432/vetclinic

# Check connection string in .env
echo $DATABASE_URL
```

**2. JWT Token Invalid**
```bash
# Decode JWT to inspect claims
echo "TOKEN" | cut -d'.' -f2 | base64 -d | jq

# Check expiry
# Verify JWT_SECRET matches in .env
```

**3. SQL Query Errors**
```bash
# Test query in psql
psql postgresql://vetuser:vetpass@localhost:5432/vetclinic

# Enable query logging in PostgreSQL
# Add to postgresql.conf: log_statement = 'all'
```

**4. Panic/Crashes**
```go
// Add recover to prevent crashes
defer func() {
    if r := recover(); r != nil {
        log.Printf("Panic recovered: %v", r)
    }
}()
```

### Debugging Tips

**1. Add Debug Logging**
```go
log.Printf("[DEBUG] Request body: %+v", req)
log.Printf("[DEBUG] Query params: page=%d, limit=%d", page, limit)
log.Printf("[DEBUG] User ID from context: %d", userID)
```

**2. Use Debugger**
```bash
# Install Delve
go install github.com/go-delve/delve/cmd/dlv@latest

# Run with debugger
dlv debug cmd/api/main.go
```

**3. Test Queries Independently**
```bash
# Test in psql first
psql postgresql://vetuser:vetpass@localhost:5432/vetclinic

# Run your query
SELECT * FROM pets WHERE owner_phone = '+1-555-1001';
```

**4. Check Middleware Chain**
```go
// Add logging middleware
app.Use(func(c fiber.Ctx) error {
    log.Printf("Before: %s %s", c.Method(), c.Path())
    err := c.Next()
    log.Printf("After: %d", c.Response().StatusCode())
    return err
})
```

---

## ⚡ Performance Considerations

### 1. Database Optimization

**Use Indexes:**
```sql
-- migrations/000002_add_indexes.up.sql
CREATE INDEX idx_pets_owner_phone ON pets(owner_phone);
CREATE INDEX idx_appointments_date ON appointments(date);
CREATE INDEX idx_visits_status ON visits(status);
```

**Limit Result Sets:**
```go
// Always paginate
LIMIT $1 OFFSET $2

// Add reasonable default
if limit > 100 {
    limit = 100
}
```

**Use EXPLAIN ANALYZE:**
```sql
EXPLAIN ANALYZE
SELECT * FROM pets
WHERE owner_name ILIKE '%john%'
AND status = 'Active';
```

### 2. Connection Pooling

```go
config.MaxConns = 25      // Don't set too high
config.MinConns = 5       // Keep some connections ready
config.MaxConnLifetime = time.Hour
config.MaxConnIdleTime = 30 * time.Minute
```

### 3. Caching (Future)

```go
// Cache frequently accessed data
var userCache = make(map[int]*models.User)

func (s *Service) GetUser(ctx context.Context, id int) (*models.User, error) {
    // Check cache first
    if user, ok := userCache[id]; ok {
        return user, nil
    }

    // Fetch from DB
    user, err := s.repo.GetByID(ctx, id)
    if err == nil {
        userCache[id] = user
    }

    return user, err
}
```

### 4. Avoid N+1 Queries

**BAD:**
```go
// Fetches each patient's appointments separately
for _, pet := range pets {
    appointments, _ := appointmentRepo.GetByPetID(pet.ID) // N queries!
    pet.Appointments = appointments
}
```

**GOOD:**
```go
// Fetch all appointments in one query
petIDs := extractIDs(pets)
appointments, _ := appointmentRepo.GetByPetIDs(petIDs) // 1 query

// Map to pets
appointmentsByPet := groupBy(appointments, "PetID")
for _, pet := range pets {
    pet.Appointments = appointmentsByPet[pet.ID]
}
```

---

## 📝 Code Snippets Library

### Generate Custom ID

```go
func (r *Repository) generateCustomID(ctx context.Context, clinicID int, prefix string) (string, error) {
    var count int
    query := "SELECT COUNT(*) FROM table_name WHERE clinic_id = $1"
    err := r.db.QueryRow(ctx, query, clinicID).Scan(&count)
    if err != nil {
        return "", err
    }
    return fmt.Sprintf("%s-%d", prefix, count+1), nil
}
```

### Dynamic WHERE Clause

```go
func buildWhereClause(filters map[string]interface{}) (string, []interface{}) {
    clauses := []string{"1=1"}
    args := []interface{}{}
    argIdx := 1

    for key, value := range filters {
        if value != nil && value != "" {
            clauses = append(clauses, fmt.Sprintf("%s = $%d", key, argIdx))
            args = append(args, value)
            argIdx++
        }
    }

    return strings.Join(clauses, " AND "), args
}
```

### Batch Insert

```go
func (r *Repository) CreateMany(ctx context.Context, items []*Item) error {
    batch := &pgx.Batch{}

    for _, item := range items {
        batch.Queue(
            "INSERT INTO items (name, value) VALUES ($1, $2)",
            item.Name, item.Value,
        )
    }

    results := r.db.SendBatch(ctx, batch)
    defer results.Close()

    for range items {
        if _, err := results.Exec(); err != nil {
            return err
        }
    }

    return nil
}
```

---

## 🎓 Learning Resources

- **Go Official Tour:** https://go.dev/tour/
- **Fiber Documentation:** https://docs.gofiber.io/
- **pgx Documentation:** https://pkg.go.dev/github.com/jackc/pgx/v5
- **PostgreSQL Docs:** https://postgresql.org/docs/
- **JWT Best Practices:** https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/

---

**You're ready to code!** Refer back to this guide as you work. The patient module is your complete reference implementation. 🚀
