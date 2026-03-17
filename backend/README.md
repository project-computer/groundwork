# Veterinary Clinic Management System - Backend API

Go-based REST API with PostgreSQL database, JWT authentication, and file upload support.

## 🚀 Quick Start

### Prerequisites
- Go 1.21+
- PostgreSQL 15+
- Docker & Docker Compose (optional but recommended)

### Development Setup

1. **Initialize Go dependencies:**
```bash
cd backend
go mod download
go mod tidy
```

2. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start PostgreSQL with Docker:**
```bash
docker-compose up -d postgres
```

4. **Run database migrations:**
```bash
# Install golang-migrate
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# Run migrations
migrate -path migrations -database "postgresql://vetuser:vetpass@localhost:5432/vetclinic?sslmode=disable" up

# Seed database with sample data
psql postgresql://vetuser:vetpass@localhost:5432/vetclinic < scripts/seed.sql
```

5. **Run the API:**
```bash
go run cmd/api/main.go
```

The API will start on http://localhost:8080

### Using Docker Compose (Full Stack)

```bash
docker-compose up --build
```

This starts both PostgreSQL and the API server.

## 📋 Implementation Status

### ✅ Completed
- [x] Project structure and configuration
- [x] Database schema with migrations
- [x] User authentication (JWT-based)
- [x] User management (CRUD)
- [x] Patient management (CRUD)
- [x] Middleware (Auth, CORS, Logging)
- [x] Docker setup
- [x] Seed data script

### 🔄 In Progress / TODO

#### Phase 1: Core Features
- [ ] **Appointments Module**
  - [ ] Repository: `internal/repository/appointment_repository.go`
  - [ ] Service: `internal/service/appointment_service.go`
  - [ ] Handler: `internal/handlers/appointment_handler.go`
  - [ ] Add routes in `cmd/api/main.go`

- [ ] **Visits Module**
  - [ ] Repository: `internal/repository/visit_repository.go`
  - [ ] Service: `internal/service/visit_service.go`
  - [ ] Handler: `internal/handlers/visit_handler.go`
  - [ ] Add routes in `cmd/api/main.go`

- [ ] **Bills Module**
  - [ ] Repository: `internal/repository/bill_repository.go`
  - [ ] Service: `internal/service/bill_service.go`
  - [ ] Handler: `internal/handlers/bill_handler.go`
  - [ ] PDF generation with gofpdf
  - [ ] Add routes in `cmd/api/main.go`

- [ ] **Prescriptions Module**
  - [ ] Repository: `internal/repository/prescription_repository.go`
  - [ ] Service: `internal/service/prescription_service.go`
  - [ ] Handler: `internal/handlers/prescription_handler.go`
  - [ ] PDF generation
  - [ ] Add routes in `cmd/api/main.go`

#### Phase 2: File Management
- [ ] **File Upload System**
  - [ ] Service: `internal/service/file_service.go`
  - [ ] Handler: `internal/handlers/file_handler.go`
  - [ ] Local storage implementation
  - [ ] Image thumbnails (optional: using `github.com/disintegration/imaging`)
  - [ ] S3 integration (production)

#### Phase 3: Advanced Features
- [ ] **Dashboard Stats**
  - [ ] Aggregate queries for dashboard
  - [ ] Revenue analytics
  - [ ] Handler: `internal/handlers/dashboard_handler.go`

- [ ] **Medical Records**
  - [ ] OPD records repository/service/handler
  - [ ] IPD records repository/service/handler

- [ ] **Queue Management**
  - [ ] Real-time queue endpoint
  - [ ] Status updates

- [ ] **Audit Logging**
  - [ ] Middleware for tracking changes
  - [ ] Audit log repository

#### Phase 4: Production Ready
- [ ] Rate limiting middleware
- [ ] Request validation enhancement
- [ ] Error handling improvement
- [ ] API documentation (Swagger/OpenAPI)
- [ ] Unit tests
- [ ] Integration tests
- [ ] CI/CD pipeline (GitHub Actions)

## 🔑 API Endpoints

### Authentication
```
POST   /api/v1/auth/login          - Login
POST   /api/v1/auth/refresh        - Refresh token
GET    /api/v1/auth/me             - Get current user (protected)
PUT    /api/v1/auth/me             - Update profile (protected)
PUT    /api/v1/auth/password       - Change password (protected)
POST   /api/v1/auth/logout         - Logout (protected)
```

### Users (Admin only)
```
GET    /api/v1/users               - List users
POST   /api/v1/users               - Create user
GET    /api/v1/users/:id           - Get user
PUT    /api/v1/users/:id           - Update user
```

### Patients
```
GET    /api/v1/patients            - List patients (with filters)
POST   /api/v1/patients            - Create patient
GET    /api/v1/patients/:id        - Get patient
PUT    /api/v1/patients/:id        - Update patient
DELETE /api/v1/patients/:id        - Delete patient (soft delete)
GET    /api/v1/patients/:id/history - Get medical history
```

### TODO: Additional Endpoints
- Appointments CRUD
- Visits CRUD + file upload
- Bills CRUD + PDF generation
- Prescriptions CRUD + PDF generation
- Dashboard statistics
- Medical records (OPD/IPD)
- Queue management

## 📦 Project Structure

```
backend/
├── cmd/
│   └── api/
│       └── main.go              # Application entry point
├── internal/
│   ├── config/
│   │   └── config.go            # Configuration management
│   ├── handlers/                # HTTP handlers
│   │   ├── auth_handler.go      # ✅ Authentication endpoints
│   │   └── patient_handler.go   # ✅ Patient endpoints
│   ├── middleware/              # HTTP middleware
│   │   ├── auth.go              # ✅ JWT authentication
│   │   ├── cors.go              # ✅ CORS configuration
│   │   └── logger.go            # ✅ Request logging
│   ├── models/                  # Data models
│   │   ├── user.go              # ✅ User models
│   │   ├── patient.go           # ✅ Patient models
│   │   ├── appointment.go       # ✅ Appointment models
│   │   ├── visit.go             # ✅ Visit models
│   │   ├── bill.go              # ✅ Bill models
│   │   ├── prescription.go      # ✅ Prescription models
│   │   └── common.go            # ✅ Common response models
│   ├── repository/              # Data access layer
│   │   ├── user_repository.go   # ✅ User database operations
│   │   └── patient_repository.go # ✅ Patient database operations
│   ├── service/                 # Business logic layer
│   │   ├── auth_service.go      # ✅ Authentication service
│   │   └── patient_service.go   # ✅ Patient service
│   └── utils/                   # Utility functions
│       ├── jwt.go               # ✅ JWT generation/validation
│       ├── password.go          # ✅ Password hashing
│       ├── database.go          # ✅ Database initialization
│       └── response.go          # ✅ Response helpers
├── migrations/                  # Database migrations
│   ├── 000001_init_schema.up.sql   # ✅ Initial schema
│   └── 000001_init_schema.down.sql # ✅ Rollback
├── scripts/
│   └── seed.sql                 # ✅ Seed data
├── docker-compose.yml           # ✅ Docker setup
├── Dockerfile                   # ✅ Container definition
├── .env.example                 # ✅ Environment template
├── go.mod                       # ✅ Go dependencies
└── README.md                    # This file
```

## 🔧 Configuration

### Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for JWT signing
- `PORT`: API server port (default: 8080)
- `CORS_ORIGINS`: Allowed CORS origins (comma-separated)

## 🧪 Testing

### Default Credentials (from seed data)
```
Email: admin@happypaws.vet
Password: admin123
Role: admin
```

### Test the API

```bash
# Health check
curl http://localhost:8080/health

# Login
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@happypaws.vet","password":"admin123"}'

# Get patients (with token)
curl http://localhost:8080/api/v1/patients \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 📝 Next Steps

### Immediate Priority (Phase 1)
1. **Complete Appointments Module**
   - Follow the pattern in `patient_repository.go`, `patient_service.go`, `patient_handler.go`
   - Add routes in `main.go`

2. **Complete Visits Module**
   - Similar structure to patients
   - Add support for JSON fields (steps, vitals, medications)

3. **Complete Bills & Prescriptions**
   - Implement PDF generation using `github.com/jung-kurt/gofpdf`
   - Add download endpoints

### Medium Priority (Phase 2-3)
4. **File Upload System**
   - Multipart form handling
   - Local storage for development
   - Image validation and thumbnail generation

5. **Dashboard Stats**
   - Aggregate queries for analytics
   - Revenue calculations

6. **Medical Records (OPD/IPD)**
   - Extend the visit system
   - Daily notes for IPD

### Long-term (Phase 4)
7. **Production Features**
   - S3 integration for file storage
   - Rate limiting
   - API documentation
   - Tests and CI/CD

## 🛠️ Development Tips

1. **Follow the Pattern:**
   - Repository → Service → Handler → Routes
   - See patient module as reference

2. **Database Operations:**
   - Use parameterized queries to prevent SQL injection
   - Handle NULL values with `sql.Null*` types
   - Use transactions for multi-table operations

3. **Error Handling:**
   - Use `utils.ErrorResponse` for consistent error formatting
   - Log errors for debugging

4. **Authentication:**
   - Protected routes use `authMiddleware.Protected()`
   - Role-based access with `authMiddleware.RequireRole(...)`
   - Get current user with `middleware.GetUserID(c)`

## 📚 Resources

- [Fiber v3 Docs](https://docs.gofiber.io/)
- [pgx Documentation](https://pkg.go.dev/github.com/jackc/pgx/v5)
- [golang-migrate](https://github.com/golang-migrate/migrate)
- [JWT-Go](https://github.com/golang-jwt/jwt)

## 🐛 Troubleshooting

**Database connection fails:**
```bash
# Check if PostgreSQL is running
docker-compose ps

# View logs
docker-compose logs postgres
```

**Migration errors:**
```bash
# Check migration status
migrate -path migrations -database "postgresql://vetuser:vetpass@localhost:5432/vetclinic?sslmode=disable" version

# Force specific version if needed
migrate -path migrations -database "..." force 1
```

**Port already in use:**
```bash
# Change PORT in .env or kill process using port 8080
lsof -ti:8080 | xargs kill -9
```
