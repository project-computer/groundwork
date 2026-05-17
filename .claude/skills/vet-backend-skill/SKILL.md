---
name: vet-backend-skill
description: Use when working on VET backend (Go server in server/ directory). Enforces pragmatic clean architecture, feature boundaries, repository isolation, transport separation, GraphQL/REST coexistence, and scalable backend patterns.
---

# VET Backend Development

## Architecture Philosophy

EduGuide uses pragmatic clean architecture.

Goals:
- Keep business logic independent
- Prevent layer leakage
- Make testing easier
- Allow REST/GraphQL coexistence
- Scale features safely
- Keep refactors low-risk

NOT goals:
- Interface everything
- Create abstraction hell
- Build enterprise ceremony for simple CRUD

---

# Core Dependency Rule

Dependencies always point inward.

```text
transport -> usecase -> domain
repository -> domain
infrastructure -> usecase/domain
```

NEVER:

```text
domain -> transport
domain -> database
usecase -> transport
repository -> handler
```

---

# Project Structure

```text
server/
├── internal/
│
│   ├── domain/               # Pure business entities/rules
│   │   ├── user/
│   │   ├── course/
│   │   ├── enrollment/
│   │   ├── quiz/
│   │   └── ...
│
│   ├── usecases/             # Application orchestration
│   │   ├── auth/
│   │   ├── user/
│   │   ├── course/
│   │   ├── quiz/
│   │   └── ...
│
│   ├── repository/           # Repository implementations
│   │   ├── postgres/
│   │   ├── redis/
│   │   ├── r2/
│   │   └── ...
│
│   ├── services/             # External/integration services
│   │   ├── auth/
│   │   ├── i18n/
│   │   ├── email/
│   │   └── storage/
│
│   ├── transport/
│   │   ├── http/
│   │   │   ├── rest/
│   │   │   └── middleware/
│   │   │
│   │   └── graphql/
│   │       ├── schemas/
│   │       ├── resolver/
│   │       └── generated/
│
│   ├── database/
│   │   ├── sqlc/
│   │   └── migration/
│
│   ├── infrastructure/
│   │   ├── database/
│   │   ├── logger/
│   │   ├── telemetry/
│   │   └── queue/
│
│   ├── shared/
│   │   ├── pagination/
│   │   ├── validator/
│   │   ├── pointer/
│   │   └── utils/
│
│   ├── config/
│   └── app/
│
├── tests/
├── go.mod
└── Makefile
```

---

# CRITICAL: Layer Leakage Prevention

Most backend architecture problems come from layer leakage.

This project STRICTLY avoids it.

---

# Domain Layer Rules

## Domain MUST Be Pure

Domain layer contains:
- Entities
- Value objects
- Repository interfaces
- Domain services
- Business rules
- Domain errors

Domain MUST NOT contain:
- SQL
- JSON tags
- GraphQL models
- Echo/Gin context
- HTTP status codes
- sqlc models
- Redis logic
- Infrastructure logic

---

## GOOD Example

```go
package user

type User struct {
    ID    UserID
    Email string
    Name  string
}
```

---

## BAD Example

```go
type User struct {
    ID uuid.UUID `json:"id"`
}
```

Why bad:
- JSON is transport concern
- Leaks HTTP/API concern into domain

---

## VERY BAD Example

```go
import "database/sql"
```

Why bad:
- Domain now tied to infrastructure
- Harder to test
- Harder to migrate DB

---

# Repository Interface Rules

## Interfaces Live Near Usage

Repository interfaces belong in domain or usecase layer.

GOOD:

```go
// internal/domain/user/repository.go

type Repository interface {
    GetByID(ctx context.Context, id UserID) (*User, error)
}
```

BAD:

```text
internal/repository/interfaces/
```

Why:
- Interfaces belong to consumer
- Prevent implementation-driven architecture

---

# Repository Implementation Rules

Repository layer:
- Executes SQL
- Maps database rows
- Handles persistence
- Talks to Redis/S3/etc

Repository MUST return domain entities.

GOOD:

```go
func (r *Repository) GetByID(
    ctx context.Context,
    id user.UserID,
) (*user.User, error) {
    row, err := r.q.GetUser(ctx, id)
    if err != nil {
        return nil, err
    }

    return &user.User{
        ID: row.ID,
        Name: row.Name,
    }, nil
}
```

BAD:

```go
func (...) (*sqlc.User, error)
```

Why bad:
- sqlc model leaks upward
- DB schema becomes application contract

---

# Usecase Layer Rules

Usecase layer orchestrates business flow.

Responsibilities:
- Validation orchestration
- Authorization
- Transactions
- Repository coordination
- External service coordination

Usecase MUST NOT:
- Return HTTP responses
- Know GraphQL
- Access Echo context
- Use sqlc directly

---

# COMMON MISTAKES

## Handler Doing Business Logic

BAD:

```go
func (h *Handler) CreateCourse(c echo.Context) error {
    if user.Role != "teacher" {
        return echo.NewHTTPError(403)
    }

    // business logic here
}
```

GOOD:

```go
result, err := h.createCourseUsecase.Execute(ctx, input)
```

Why:
- Business logic becomes duplicated
- REST and GraphQL diverge
- Harder to test

---

## Usecase Returning HTTP Errors

BAD:

```go
return echo.NewHTTPError(http.StatusForbidden)
```

GOOD:

```go
return domain.ErrForbidden
```

Transport maps domain error -> HTTP.

---

## Passing Echo Context Into Usecase

BAD:

```go
Execute(c echo.Context)
```

GOOD:

```go
Execute(ctx context.Context)
```

Why:
- Usecase becomes transport-coupled

---

## GraphQL Models Inside Domain

BAD:

```go
func ToGraphQLUser(u *User) *model.User
```

inside domain package.

GOOD:
- Mapping belongs in transport layer

---

## Shared Mega Utils Package

BAD:

```text
shared/utils/helpers.go
```

with 300 random functions.

GOOD:
- Small focused packages
- Explicit ownership

---

# DTO Strategy

Each layer owns its DTOs.

```text
transport DTO != usecase DTO != database model
```

Example:

```text
REST Request
    ↓
Usecase Input
    ↓
Domain Entity
    ↓
Database Row
```

Never skip layers casually.

---

# Transport Layer Rules

Transport handles:
- Parsing
- Serialization
- Validation shape
- Authentication extraction
- Response mapping

Transport MUST NOT:
- Execute SQL
- Contain business rules
- Start transactions

---

# GraphQL Rules

## Resolver = Thin Adapter

Resolvers should:
- Parse arguments
- Call usecase
- Map response

Resolvers should NOT:
- Query DB directly
- Implement business rules

---

# Transaction Rules

Transaction ownership belongs to usecase layer.

GOOD:

```go
err := u.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
    err := u.courseRepo.Create(txCtx, course)
    if err != nil {
        return err
    }

    return u.enrollmentRepo.Create(txCtx, enrollment)
})
```

BAD:
- Nested repository transactions
- Transaction hidden inside repo

---

# Testing Strategy

```text
Unit -> Contract -> Integration
```

---

## Unit Tests

Test:
- Domain logic
- Usecase logic
- Edge cases

Mock:
- Repositories
- External services

Do NOT mock:
- Pure entities

---

## Integration Tests

Use:
- Real PostgreSQL
- Real Redis
- Testcontainers if possible

Avoid:
- Mocking sqlc heavily

---

# Feature Boundary Rules

Feature owns its logic.

GOOD:

```text
course/
├── domain/
├── usecase/
├── repository/
└── transport/
```

BAD:

```text
shared/business_logic/
```

---

# Naming Conventions

## Usecase

GOOD:

```text
CreateCourseUsecase
GetUserProgressUsecase
```

BAD:

```text
CourseManager
MainService
HelperService
```

---

## Repository

GOOD:

```text
UserRepository
QuizRepository
```

BAD:

```text
DatabaseService
StorageManager
```

---

# Dependency Injection

Use explicit constructor injection.

GOOD:

```go
func NewCreateCourseUsecase(
    courseRepo domain.CourseRepository,
    txManager transaction.Manager,
) *CreateCourseUsecase
```

Avoid:
- Globals
- init()
- Service locator
- Hidden singleton state

---

# SQLC Rules

sqlc models MUST stay inside repository layer.

NEVER:
- Return sqlc structs from usecase
- Use sqlc models in GraphQL
- Use sqlc models in domain

Repository maps:
- sqlc -> domain
- domain -> sql params

---

# Error Handling Strategy

Domain errors:

```go
var ErrCourseNotFound = errors.New("course not found")
```

Transport mapping:

```go
switch {
case errors.Is(err, domain.ErrForbidden):
    return c.JSON(http.StatusForbidden, ...)
}
```

---

# Migration Rules

Migration files:

```text
000001_create_users.up.sql
000001_create_users.down.sql
```

Rules:
- One logical change per migration
- Never modify old migrations after merge
- Add new migration instead

---

# Commands

## Development

```bash
make dev
```

Uses:
- air hot reload
- local development environment

---

## Testing

```bash
make test-unit
make test-integration-fresh
go test ./tests/contract/... -v
```

---

## Quality

```bash
go vet ./...
golangci-lint run
```

---

## Generate

```bash
make gen
```

Run after:
- GraphQL schema changes
- sqlc changes
- codegen updates

---

# Golden Rules

## GOOD Architecture Signs

- Domain has zero framework imports
- Handlers are thin
- Usecases are testable
- Repositories isolated
- GraphQL/REST share same business flow
- Easy to replace transport layer

---

## BAD Architecture Signs

- echo.Context inside usecase
- sqlc structs outside repository
- Business logic in resolver
- HTTP errors in domain
- Shared god packages
- Circular imports
- Repository calling handlers

---

# Architecture Decision Priority

Priority order:

```text
Maintainability
> Testability
> Simplicity
> Performance optimization
> Clever abstraction
```

Simple architecture that survives 2 years is better than "perfect" architecture that nobody understands.
