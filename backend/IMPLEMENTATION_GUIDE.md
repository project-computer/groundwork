## 🎯 Implementation Roadmap - Next Steps

This guide walks you through completing the remaining backend features. Each module follows the same pattern:
**Repository → Service → Handler → Routes**

---

## Pattern Reference: How to Add a New Module

Use the **Patient module** as your template. Every module follows this structure:

### Step 1: Create Repository (`internal/repository/[name]_repository.go`)
```go
type [Name]Repository struct {
    db *pgxpool.Pool
}

func New[Name]Repository(db *pgxpool.Pool) *[Name]Repository {
    return &[Name]Repository{db: db}
}

// Implement: Create, GetByID, List, Update, Delete
```

### Step 2: Create Service (`internal/service/[name]_service.go`)
```go
type [Name]Service struct {
    repo *repository.[Name]Repository
}

func New[Name]Service(repo *repository.[Name]Repository) *[Name]Service {
    return &[Name]Service{repo: repo}
}

// Business logic methods
```

### Step 3: Create Handler (`internal/handlers/[name]_handler.go`)
```go
type [Name]Handler struct {
    service   *service.[Name]Service
    validator *validator.Validate
}

// HTTP handlers: Create, Get, List, Update, Delete
```

### Step 4: Register Routes (`cmd/api/main.go`)
```go
// Initialize
[name]Repo := repository.New[Name]Repository(db)
[name]Service := service.New[Name]Service([name]Repo)
[name]Handler := handlers.New[Name]Handler([name]Service)

// Add routes
[name]s := protected.Group("/[names]")
[name]s.Get("/", [name]Handler.List)
[name]s.Post("/", [name]Handler.Create)
// ... etc
```

---

## Module 1: Appointments 🗓️

### Files to Create:
1. `internal/repository/appointment_repository.go`
2. `internal/service/appointment_service.go`
3. `internal/handlers/appointment_handler.go`

### Key Features:
- Generate custom ID (APT-1, APT-2, ...)
- Filter by date, status, veterinarian
- Update appointment status
- Associate with visits

### Routes to Add (in main.go):
```go
appointments := protected.Group("/appointments")
appointments.Get("/", appointmentHandler.List)
appointments.Post("/", appointmentHandler.Create)
appointments.Get("/:id", appointmentHandler.Get)
appointments.Put("/:id", appointmentHandler.Update)
appointments.Delete("/:id", appointmentHandler.Delete)
appointments.Post("/:id/checkin", appointmentHandler.CheckIn) // Creates a visit
```

### Repository Methods:
```go
Create(ctx, clinicID, appointment) error
GetByID(ctx, id) (*Appointment, error)
List(ctx, clinicID, query) ([]*Appointment, int, error)
Update(ctx, id, updates) error
Delete(ctx, id) error
GetByDate(ctx, clinicID, date) ([]*Appointment, error)
```

---

## Module 2: Visits 🏥

### Files to Create:
1. `internal/repository/visit_repository.go`
2. `internal/service/visit_service.go`
3. `internal/handlers/visit_handler.go`

### Key Features:
- Generate custom ID (V-1, V-2, ...)
- Handle JSON fields (steps, vitals, medications)
- Status workflow (Draft → In Progress → Complete)
- Associate with appointments and pets
- Support visit duplication

### Routes to Add:
```go
visits := protected.Group("/visits")
visits.Get("/", visitHandler.List)
visits.Post("/", visitHandler.Create)
visits.Get("/:id", visitHandler.Get)
visits.Put("/:id", visitHandler.Update)
visits.Delete("/:id", visitHandler.Delete)
visits.Post("/:id/duplicate", visitHandler.Duplicate)
visits.Post("/:id/complete", visitHandler.Complete)
```

### Repository Methods:
```go
Create(ctx, clinicID, visit) error
GetByID(ctx, id) (*Visit, error)
List(ctx, clinicID, query) ([]*Visit, int, error)
Update(ctx, id, updates) error
Delete(ctx, id) error
Duplicate(ctx, id) (*Visit, error)
GetQueueVisits(ctx, clinicID) ([]*Visit, error) // For queue page
```

### JSON Field Handling Example:
```go
// In repository
import "encoding/json"

// When reading from DB
err := rows.Scan(..., &visit.Steps, &visit.Vitals, &visit.Medications, ...)

// When writing to DB
stepsJSON, _ := json.Marshal(steps)
_, err := db.Exec("INSERT ... VALUES (..., $1, ...)", stepsJSON)
```

---

## Module 3: Bills 💰

### Files to Create:
1. `internal/repository/bill_repository.go`
2. `internal/service/bill_service.go`
3. `internal/handlers/bill_handler.go`
4. `internal/utils/pdf.go` (PDF generation)

### Key Features:
- Generate custom ID (BIL-1, BIL-2, ...)
- Calculate totals (subtotal, tax, discount, total)
- Support payment status tracking
- Generate PDF invoices

### Routes to Add:
```go
bills := protected.Group("/bills")
bills.Get("/", billHandler.List)
bills.Post("/", billHandler.Create)
bills.Get("/:id", billHandler.Get)
bills.Put("/:id", billHandler.Update)
bills.Post("/:id/pay", billHandler.MarkPaid)
bills.Get("/:id/pdf", billHandler.DownloadPDF)
```

### PDF Generation (utils/pdf.go):
```go
import "github.com/jung-kurt/gofpdf"

func GenerateBillPDF(bill *models.Bill, clinic *models.Clinic) ([]byte, error) {
    pdf := gofpdf.New("P", "mm", "A4", "")
    pdf.AddPage()

    // Add clinic header
    pdf.SetFont("Arial", "B", 16)
    pdf.Cell(40, 10, clinic.Name)

    // Add bill details
    pdf.Ln(20)
    pdf.SetFont("Arial", "", 12)
    pdf.Cell(40, 10, fmt.Sprintf("Bill #: %s", bill.CustomID))

    // Add line items table
    // Add totals

    var buf bytes.Buffer
    err := pdf.Output(&buf)
    return buf.Bytes(), err
}
```

---

## Module 4: Prescriptions 💊

### Files to Create:
1. `internal/repository/prescription_repository.go`
2. `internal/service/prescription_service.go`
3. `internal/handlers/prescription_handler.go`

### Key Features:
- Generate custom ID (RX-1, RX-2, ...)
- Store medicines as JSON array
- Generate PDF prescriptions
- Link to visits

### Routes to Add:
```go
prescriptions := protected.Group("/prescriptions")
prescriptions.Get("/", prescriptionHandler.List)
prescriptions.Post("/", prescriptionHandler.Create)
prescriptions.Get("/:id", prescriptionHandler.Get)
prescriptions.Get("/:id/pdf", prescriptionHandler.DownloadPDF)
```

### PDF Format:
- Clinic letterhead
- Rx symbol
- Pet and owner details
- Medicine table (Name, Dosage, Frequency, Duration, Instructions)
- Veterinarian signature line

---

## Module 5: File Upload 📷

### Files to Create:
1. `internal/service/file_service.go`
2. `internal/handlers/file_handler.go`
3. `internal/repository/visit_image_repository.go`

### Key Features:
- Handle multipart/form-data
- Validate file type and size
- Save to local filesystem (development)
- Generate thumbnails (optional)
- Support S3 for production

### Routes to Add:
```go
// In visits group
visits.Post("/:id/images", fileHandler.Upload)
visits.Delete("/:id/images/:imageId", fileHandler.Delete)
```

### Upload Handler Example:
```go
func (h *FileHandler) Upload(c fiber.Ctx) error {
    visitID, _ := c.ParamsInt("id")

    // Get file from form
    file, err := c.FormFile("image")
    if err != nil {
        return utils.ErrorResponse(c, 400, "no_file", "No file uploaded")
    }

    // Validate
    if file.Size > maxSize {
        return utils.ErrorResponse(c, 400, "file_too_large", "File exceeds 10MB")
    }

    // Save to disk
    filename := fmt.Sprintf("%d_%s", time.Now().Unix(), file.Filename)
    path := filepath.Join("uploads", "visits", fmt.Sprintf("%d", visitID), filename)

    os.MkdirAll(filepath.Dir(path), 0755)
    if err := c.SaveFile(file, path); err != nil {
        return err
    }

    // Save to database
    image := &models.VisitImage{
        VisitID:  visitID,
        FileKey:  path,
        URL:      fmt.Sprintf("/uploads/visits/%d/%s", visitID, filename),
        FileSize: int(file.Size),
        MimeType: file.Header.Get("Content-Type"),
    }

    return c.Status(201).JSON(image)
}
```

### Serve Uploaded Files:
```go
// In main.go
app.Static("/uploads", "./uploads")
```

---

## Module 6: Dashboard Statistics 📊

### Files to Create:
1. `internal/repository/stats_repository.go`
2. `internal/service/stats_service.go`
3. `internal/handlers/dashboard_handler.go`

### Key Queries:
```go
// Today's appointments
SELECT COUNT(*) FROM appointments WHERE date = CURRENT_DATE

// Pending visits
SELECT COUNT(*) FROM visits WHERE status IN ('Draft', 'In Progress')

// Revenue (today, week, month)
SELECT SUM(total) FROM bills
WHERE status = 'Paid' AND date >= CURRENT_DATE

// Active patients
SELECT COUNT(*) FROM pets WHERE status = 'Active'

// Revenue over time (for chart)
SELECT date, SUM(total) as revenue
FROM bills
WHERE status = 'Paid' AND date >= NOW() - INTERVAL '30 days'
GROUP BY date
ORDER BY date
```

### Route:
```go
protected.Get("/dashboard/stats", dashboardHandler.GetStats)
```

---

## Module 7: Medical Records (OPD/IPD) 📋

### Files to Create:
1. `internal/repository/opd_repository.go`
2. `internal/repository/ipd_repository.go`
3. `internal/service/medical_records_service.go`
4. `internal/handlers/records_handler.go`

### Key Features:
- Auto-create OPD/IPD record when visit is completed
- For IPD: support daily notes updates
- Link back to source visit

### Routes:
```go
records := protected.Group("/records")

// OPD
records.Get("/opd", recordsHandler.ListOPD)
records.Get("/opd/:id", recordsHandler.GetOPD)

// IPD
records.Get("/ipd", recordsHandler.ListIPD)
records.Get("/ipd/:id", recordsHandler.GetIPD)
records.Put("/ipd/:id/notes", recordsHandler.AddDailyNotes)
```

---

## Priority Order

1. **Appointments** - Foundation for scheduling
2. **Visits** - Core workflow
3. **Bills** - Revenue tracking
4. **Prescriptions** - Medicine management
5. **File Upload** - Visit images
6. **Dashboard Stats** - Analytics
7. **Medical Records** - Historical data

---

## Testing Each Module

After implementing each module:

```bash
# 1. Test health endpoint
curl http://localhost:8080/health

# 2. Login to get token
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@happypaws.vet","password":"admin123"}' \
  | jq -r '.accessToken'

# 3. Test the new endpoint
export TOKEN="your_access_token_here"

curl http://localhost:8080/api/v1/appointments \
  -H "Authorization: Bearer $TOKEN"
```

---

## Code Quality Checklist

For each module you implement:

- [ ] Repository has proper error handling
- [ ] Service validates business logic
- [ ] Handler validates request data (using validator)
- [ ] Proper HTTP status codes (201 for create, 404 for not found, etc.)
- [ ] Pagination for list endpoints
- [ ] Consistent error responses using `utils.ErrorResponse`
- [ ] SQL queries use parameterized placeholders ($1, $2, ...)
- [ ] NULL values handled with `sql.Null*` types
- [ ] JSON fields properly marshaled/unmarshaled
- [ ] Routes registered in main.go with correct middleware

---

## Common Patterns & Snippets

### Custom ID Generation:
```go
var count int
err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM table WHERE clinic_id = $1", clinicID).Scan(&count)
entity.CustomID = fmt.Sprintf("PREFIX-%d", count+1)
```

### Pagination Calculation:
```go
if query.Page < 1 { query.Page = 1 }
if query.Limit < 1 || query.Limit > 100 { query.Limit = 20 }
offset := (query.Page - 1) * query.Limit
totalPages := (total + query.Limit - 1) / query.Limit
```

### Building Dynamic WHERE Clauses:
```go
whereClauses := []string{"clinic_id = $1"}
args := []interface{}{clinicID}
argIdx := 2

if query.Search != "" {
    whereClauses = append(whereClauses, fmt.Sprintf("name ILIKE $%d", argIdx))
    args = append(args, "%"+query.Search+"%")
    argIdx++
}

whereSQL := strings.Join(whereClauses, " AND ")
```

---

## Need Help?

- Check the **patient module** for a complete reference implementation
- Review `models/*.go` for request/response structures
- Database schema is in `migrations/000001_init_schema.up.sql`
- Test with seed data from `scripts/seed.sql`

Good luck! 🚀
