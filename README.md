# 🏥 Veterinary Clinic Management System

A comprehensive, full-stack veterinary clinic management system built with React, Go, and PostgreSQL. Manage patients, appointments, visits, billing, prescriptions, and medical records with a modern, intuitive interface.

---

## ✨ Features

### Current Features (Phase 1 Complete)

✅ **Backend API (Go + PostgreSQL)**
- RESTful API with clean architecture
- JWT-based authentication with role-based access control
- Patient management with search, filtering, and pagination
- User management (admin, veterinarian, receptionist, pharmacist roles)
- Complete database schema with 13 tables
- Docker development environment

✅ **Frontend (React + TypeScript)**
- Modern, responsive UI with Radix UI components
- 6-step visit workflow
- Patient management interface
- Appointment scheduling
- Queue management
- Billing and invoicing
- Prescription management
- Dashboard analytics

### In Development (Phase 2-3)

🔄 **Backend Modules**
- Appointments CRUD + check-in functionality
- Visits workflow with file uploads
- Bills with PDF generation
- Prescriptions with PDF generation
- File upload system for visit images
- Dashboard statistics
- Medical records (OPD/IPD)

🔄 **Frontend Integration**
- API client with axios
- React Query for server state management
- Authentication context
- Replace in-memory store with API calls

---

## 🚀 Quick Start

### Prerequisites

- **Go** 1.21+
- **Node.js** 18+
- **PostgreSQL** 15+ (or Docker)
- **Docker** (recommended for development)

### 1. Clone Repository

```bash
git clone <repository-url>
cd vet-app
```

### 2. Backend Setup

```bash
cd backend

# Copy environment file
cp .env.example .env

# Start PostgreSQL with Docker
docker-compose up -d postgres

# Install Go dependencies
go mod download

# Run migrations
migrate -path migrations \
  -database "postgresql://vetuser:vetpass@localhost:5432/vetclinic?sslmode=disable" \
  up

# Seed sample data
psql postgresql://vetuser:vetpass@localhost:5432/vetclinic < scripts/seed.sql

# Start API server
go run cmd/api/main.go
```

API will be available at http://localhost:8080

### 3. Frontend Setup

```bash
# From project root
npm install

# Start development server
npm run dev
```

Frontend will be available at http://localhost:5173

### 4. Test the System

**Default Credentials:**
- Email: `admin@happypaws.vet`
- Password: `admin123`

**Test API:**
```bash
# Health check
curl http://localhost:8080/health

# Login
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@happypaws.vet","password":"admin123"}'

# Get patients (use token from login)
curl http://localhost:8080/api/v1/patients \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 📚 Documentation

### For All Developers
- **[ONBOARDING.md](ONBOARDING.md)** - Start here! Complete onboarding guide for new developers
- **[QUICKSTART.md](QUICKSTART.md)** - 5-minute setup guide
- **[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)** - Current progress and roadmap
- **[SUMMARY.md](SUMMARY.md)** - What's been built and next steps

### Backend Developers
- **[backend/README.md](backend/README.md)** - Backend API documentation
- **[backend/IMPLEMENTATION_GUIDE.md](backend/IMPLEMENTATION_GUIDE.md)** - Step-by-step module creation
- **[BACKEND_ONBOARDING.md](BACKEND_ONBOARDING.md)** - Deep dive into backend architecture

### Frontend Developers
- **[FRONTEND_ONBOARDING.md](FRONTEND_ONBOARDING.md)** - Deep dive into frontend architecture

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────┐
│   React Frontend (Port 5173)        │
│   • TypeScript + Vite                │
│   • Tailwind CSS + Radix UI         │
│   • React Router + React Hook Form  │
│   • TODO: React Query + Axios       │
└────────────────┬────────────────────┘
                 │
                 │ HTTP + JWT
                 ▼
┌─────────────────────────────────────┐
│   Go Backend API (Port 8080)        │
│   • Fiber v3 web framework          │
│   • JWT authentication              │
│   • Clean architecture              │
│   • Repository pattern              │
└────────────────┬────────────────────┘
                 │
                 │ pgx driver
                 ▼
┌─────────────────────────────────────┐
│   PostgreSQL Database (Port 5432)   │
│   • 13 tables                       │
│   • JSONB support                   │
│   • Full-text search                │
│   • Audit logging                   │
└─────────────────────────────────────┘
```

### Tech Stack

**Frontend:**
- React 19 + TypeScript
- Vite (build tool)
- Tailwind CSS v4 (styling)
- Radix UI (component library)
- React Router v7 (routing)
- React Hook Form + Zod (forms)
- @tanstack/react-query (TODO - server state)

**Backend:**
- Go 1.21+
- Fiber v3 (web framework)
- pgx v5 (PostgreSQL driver)
- JWT (authentication)
- bcrypt (password hashing)
- Viper (configuration)

**Database:**
- PostgreSQL 15
- JSON support for complex fields
- Full-text search capabilities

---

## 🔑 API Endpoints

### Authentication
```
POST   /api/v1/auth/login      - Login with email/password
POST   /api/v1/auth/refresh    - Refresh access token
GET    /api/v1/auth/me         - Get current user
PUT    /api/v1/auth/me         - Update profile
PUT    /api/v1/auth/password   - Change password
```

### Patients
```
GET    /api/v1/patients        - List patients (paginated)
POST   /api/v1/patients        - Create patient
GET    /api/v1/patients/:id    - Get patient by ID
PUT    /api/v1/patients/:id    - Update patient
DELETE /api/v1/patients/:id    - Delete patient (soft delete)
```

### Users (Admin Only)
```
GET    /api/v1/users           - List users
POST   /api/v1/users           - Create user
GET    /api/v1/users/:id       - Get user
PUT    /api/v1/users/:id       - Update user
```

See [backend/README.md](backend/README.md) for complete API documentation.

---

## 👥 User Roles

| Role | Permissions |
|------|------------|
| **Admin** | Full system access, user management, system configuration |
| **Veterinarian** | Patient care, visits, prescriptions, medical records |
| **Receptionist** | Appointments, patient registration, billing, queue management |
| **Pharmacist** | Prescriptions, medication inventory (planned) |

### Default Test Users

| Email | Password | Role |
|-------|----------|------|
| admin@happypaws.vet | admin123 | Admin |
| mchen@happypaws.vet | admin123 | Veterinarian |
| emily@happypaws.vet | admin123 | Receptionist |
| james@happypaws.vet | admin123 | Pharmacist |

**⚠️ Change all passwords in production!**

---

## 🗃️ Database Schema

The system uses 13 tables:

- **users** - Staff authentication and roles
- **clinics** - Multi-clinic support
- **pets** - Patient records
- **appointments** - Scheduling
- **visits** - Core workflow with 6-step process
- **visit_images** - File uploads for visits
- **bills** - Invoicing and payments
- **prescriptions** - Medicine management
- **opd_records** - Outpatient records
- **ipd_records** - Inpatient records with daily notes
- **audit_logs** - Change tracking for compliance

See [backend/migrations/000001_init_schema.up.sql](backend/migrations/000001_init_schema.up.sql) for the complete schema.

---

## 📈 Roadmap

### Phase 1: Foundation ✅ (Complete)
- [x] Backend infrastructure
- [x] Authentication system
- [x] Patient management
- [x] Database schema
- [x] Docker setup
- [x] Documentation

### Phase 2: Core Features 🔄 (In Progress)
- [ ] Appointments module
- [ ] Visits workflow
- [ ] Billing with PDF
- [ ] Prescriptions with PDF
- [ ] File upload system
- [ ] Dashboard statistics

### Phase 3: Integration 📅 (Planned)
- [ ] Frontend API client
- [ ] React Query setup
- [ ] Replace in-memory store
- [ ] Authentication UI
- [ ] API integration

### Phase 4: Production 📅 (Planned)
- [ ] CI/CD pipeline
- [ ] Production deployment
- [ ] Monitoring & logging
- [ ] SSL/TLS
- [ ] Database backups

---

## 🚀 Getting Started

**New to the project?**
1. Read [ONBOARDING.md](ONBOARDING.md) for general overview
2. Backend developers: [BACKEND_ONBOARDING.md](BACKEND_ONBOARDING.md)
3. Frontend developers: [FRONTEND_ONBOARDING.md](FRONTEND_ONBOARDING.md)
4. Follow [QUICKSTART.md](QUICKSTART.md) to set up your environment

**Ready to contribute?**
1. Check [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for available tasks
2. Follow [backend/IMPLEMENTATION_GUIDE.md](backend/IMPLEMENTATION_GUIDE.md) for step-by-step instructions
3. Use the patient module as your reference implementation

---

## 📊 Project Status

**Current Version:** 0.1.0 (Alpha)
**Progress:** ~35% Complete
**Last Updated:** March 17, 2026

**What Works:**
- ✅ Backend API with authentication
- ✅ Patient management (complete reference implementation)
- ✅ Database with all tables
- ✅ Frontend UI (in-memory data)
- ✅ Docker development environment

**In Development:**
- 🔄 Remaining backend modules (appointments, visits, bills, prescriptions)
- 🔄 File upload system
- 🔄 Frontend API integration

**Next Milestone:** Complete backend modules (2-3 weeks)

---

**Happy coding!** 🎉
