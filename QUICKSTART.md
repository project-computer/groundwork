# 🚀 Quick Start Guide - Veterinary Management System

## What's Been Built

You now have a **production-ready foundation** for your veterinary clinic management system:

### ✅ Backend (Go + PostgreSQL)
- Complete authentication system with JWT
- User management with role-based access
- Patient management with search & pagination
- Database with 13 tables and relationships
- Docker setup for easy development
- Comprehensive API architecture ready for expansion

### 📦 What Works Right Now
1. **Authentication** - Login, JWT tokens, password management
2. **User Management** - Create/update users, role-based permissions (admin, vet, receptionist, pharmacist)
3. **Patient Management** - Full CRUD with search, filters, pagination, soft delete
4. **Database** - All tables created, sample data seeded
5. **API Foundation** - Clean architecture with repository → service → handler pattern

---

## 🏃 Start the Backend (5 minutes)

### Option 1: Docker Compose (Recommended)
```bash
cd backend
docker-compose up -d postgres    # Start PostgreSQL
```

### Option 2: Local PostgreSQL
```bash
# If you have PostgreSQL installed locally
export DATABASE_URL="postgresql://vetuser:vetpass@localhost:5432/vetclinic?sslmode=disable"
```

### Run Migrations
```bash
cd backend

# Install migrate tool (one-time)
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# Run migrations
migrate -path migrations -database "postgresql://vetuser:vetpass@localhost:5432/vetclinic?sslmode=disable" up

# Seed sample data
psql "postgresql://vetuser:vetpass@localhost:5432/vetclinic" < scripts/seed.sql
```

### Start the API
```bash
go run cmd/api/main.go
```

You should see:
```
Database connected successfully
Starting server on 0.0.0.0:8080
```

---

## ✅ Test the Backend (2 minutes)

### 1. Health Check
```bash
curl http://localhost:8080/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "env": "development"
}
```

### 2. Login
```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@happypaws.vet",
    "password": "admin123"
  }'
```

**Expected Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "admin@happypaws.vet",
    "name": "Dr. Sarah Johnson",
    "role": "admin",
    ...
  }
}
```

### 3. Get Patients (Protected Route)
```bash
# Save the token from login response
export TOKEN="your_access_token_here"

curl http://localhost:8080/api/v1/patients \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "data": [
    {
      "id": 1,
      "customId": "C-1",
      "name": "Max",
      "species": "Dog",
      "breed": "Golden Retriever",
      "ownerName": "John Smith",
      "ownerPhone": "+1-555-1001",
      ...
    },
    ...
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 5,
    "totalPages": 1
  }
}
```

### 4. Create a New Patient
```bash
curl -X POST http://localhost:8080/api/v1/patients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Buddy",
    "species": "Dog",
    "breed": "Labrador",
    "age": 3,
    "weight": 28.5,
    "ownerName": "Jane Doe",
    "ownerPhone": "+1-555-2000",
    "ownerEmail": "jane@email.com"
  }'
```

**If all 4 tests pass, your backend is working perfectly!** ✅

---

## 📊 What's In The Database

After seeding, you have:
- **1 Clinic** - Happy Paws Veterinary Clinic
- **4 Users** - Admin, Veterinarian, Receptionist, Pharmacist (all password: `admin123`)
- **5 Patients** - Sample pets with owner information
- **3 Appointments** - Scheduled for today and tomorrow
- **1 Visit** - Completed visit with medical details
- **1 Bill** - Paid invoice
- **1 Prescription** - Sample prescription

---

## 🎯 Next Steps - Complete the System

### Priority 1: Implement Remaining Modules (20-30 hours)

Follow the **Implementation Guide** (`backend/IMPLEMENTATION_GUIDE.md`) to add:

1. **Appointments** (2-3 hours)
   - Create/update/list appointments
   - Check-in functionality
   - Date filtering

2. **Visits** (3-4 hours)
   - 6-step workflow
   - JSON fields (vitals, medications)
   - Queue management
   - Visit duplication

3. **Bills** (3-4 hours)
   - Invoice creation
   - Payment tracking
   - PDF generation

4. **Prescriptions** (2-3 hours)
   - Medicine management
   - PDF generation

5. **File Upload** (3-4 hours)
   - Image uploads for visits
   - Local storage
   - Thumbnail generation

6. **Dashboard Stats** (2-3 hours)
   - Today's appointments
   - Revenue analytics
   - Patient counts

7. **Medical Records** (3-4 hours)
   - OPD/IPD records
   - Daily notes for IPD

**Total Backend Completion: ~20-30 hours**

### Priority 2: Frontend Integration (15-20 hours)

1. **API Client** (1-2 hours)
   - Setup axios with interceptors
   - Token refresh logic

2. **Authentication** (2-3 hours)
   - React Context
   - Login page
   - Protected routes

3. **React Query** (4-6 hours)
   - Install @tanstack/react-query
   - Create hooks for each resource
   - Replace store.ts

4. **Update Components** (6-8 hours)
   - Connect all pages to API
   - Add loading states
   - Handle errors

5. **File Upload UI** (2-3 hours)
   - Upload component
   - Progress indicator
   - Image preview

**Total Frontend Integration: ~15-20 hours**

### Priority 3: Production Deployment (6-8 hours)

1. Docker production setup
2. CI/CD pipeline
3. Environment configuration
4. SSL/TLS
5. Monitoring

---

## 📚 Essential Documentation

- **Backend README:** `backend/README.md` - Full API documentation
- **Implementation Guide:** `backend/IMPLEMENTATION_GUIDE.md` - Step-by-step module creation
- **Status Document:** `IMPLEMENTATION_STATUS.md` - Detailed progress tracking
- **Database Schema:** `backend/migrations/000001_init_schema.up.sql`

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────┐
│   React Frontend (Port 5173)       │
│   - Currently using in-memory store │
│   - Will connect to API via axios   │
└─────────────┬───────────────────────┘
              │
              │ HTTP + JWT
              ▼
┌─────────────────────────────────────┐
│   Go API (Port 8080)                │
│   - Fiber web framework             │
│   - JWT authentication              │
│   - CRUD operations                 │
│   - PDF generation                  │
│   - File uploads                    │
└─────────────┬───────────────────────┘
              │
              │ pgx driver
              ▼
┌─────────────────────────────────────┐
│   PostgreSQL (Port 5432)            │
│   - 13 tables                       │
│   - JSON fields                     │
│   - Full-text search indexes        │
│   - Audit logging                   │
└─────────────────────────────────────┘
```

---

## 🔑 Default Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@happypaws.vet | admin123 | admin |
| mchen@happypaws.vet | admin123 | veterinarian |
| emily@happypaws.vet | admin123 | receptionist |
| james@happypaws.vet | admin123 | pharmacist |

**⚠️ Change these in production!**

---

## 🛠️ Development Workflow

### Pattern for Adding New Features

Every module follows this pattern:

1. **Repository** (`internal/repository/[name]_repository.go`)
   - Database queries (CRUD operations)
   - Use parameterized queries ($1, $2, ...)
   - Handle NULL values with `sql.Null*`

2. **Service** (`internal/service/[name]_service.go`)
   - Business logic
   - Validation
   - Transform data

3. **Handler** (`internal/handlers/[name]_handler.go`)
   - HTTP endpoints
   - Request/response handling
   - Call service methods

4. **Routes** (`cmd/api/main.go`)
   - Register endpoints
   - Apply middleware
   - Group related routes

**Example:** See the complete patient module for reference.

---

## ❓ Troubleshooting

### "Database connection failed"
```bash
# Check if PostgreSQL is running
docker-compose ps

# View logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### "Port 8080 already in use"
```bash
# Find and kill process
lsof -ti:8080 | xargs kill -9

# Or change port in .env
PORT=8081
```

### "Migration version dirty"
```bash
# Force to version 1
migrate -path migrations -database $DATABASE_URL force 1

# Then re-run migrations
migrate -path migrations -database $DATABASE_URL up
```

### "No such file go.sum"
```bash
# Regenerate
cd backend
go mod download
go mod tidy
```

---

## 📞 Getting Help

1. Check the **Implementation Guide** for step-by-step instructions
2. Review the **patient module** as a working reference
3. Consult the **API documentation** in README.md
4. Review the **database schema** for table structures

---

## 🎉 Success Criteria

You'll know the system is complete when:

- [x] ✅ Backend API responds on port 8080
- [x] ✅ Authentication works (login/logout)
- [x] ✅ Patients can be created/updated/deleted
- [ ] ⏳ Appointments can be scheduled
- [ ] ⏳ Visits workflow is complete (6 steps)
- [ ] ⏳ Bills generate PDFs
- [ ] ⏳ Prescriptions generate PDFs
- [ ] ⏳ Images upload successfully
- [ ] ⏳ Dashboard shows statistics
- [ ] ⏳ Frontend connects to backend
- [ ] ⏳ All data persists across refreshes
- [ ] ⏳ System runs in production

---

## 📈 Estimated Timeline

- **Backend Core Features:** 20-30 hours
- **Frontend Integration:** 15-20 hours
- **Production Deployment:** 6-8 hours
- **Testing & Bug Fixes:** 10-15 hours

**Total: 50-75 hours** (approximately 2-3 weeks of full-time work)

---

## 🚀 Let's Build!

Your foundation is solid. Follow the **Implementation Guide** to add each module one by one. Start with appointments, then visits, then billing.

**Good luck!** 💪
