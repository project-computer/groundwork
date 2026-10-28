package middleware

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/vet-clinic/api/internal/utils"
)

// GetClinicID is the single resolver through which every tenant-scoped query flows.
// It reads the JWT clinicId claim (users.clinic_id at issuance); tokens without
// the claim fall back to clinic 1 (ADR-0004 single-tenant default). Behavior is
// verified here so the resolver's contract is locked in: never panics, always
// returns the tenant of the authenticated user.

func TestGetClinicIDReturnsOneForDefaultCtx(t *testing.T) {
	app := fiber.New()
	var got int

	app.Get("/probe", func(c fiber.Ctx) error {
		got = GetClinicID(c)
		return c.SendString("ok")
	})

	req := httptest.NewRequest("GET", "/probe", nil)
	resp, err := app.Test(req)
	assert.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	assert.Equal(t, 1, got, "GetClinicID must return 1 when no clinicID local is set (per ADR-0004)")
}

func TestGetClinicIDHonorsLocals(t *testing.T) {
	app := fiber.New()
	var got int

	app.Get("/probe", func(c fiber.Ctx) error {
		c.Locals("clinicID", 7)
		got = GetClinicID(c)
		return c.SendString("ok")
	})

	req := httptest.NewRequest("GET", "/probe", nil)
	resp, err := app.Test(req)
	assert.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	assert.Equal(t, 7, got, "GetClinicID must prefer a Locals value when set (this is the activation path)")
}

func TestGetUserRoleReturnsEmptyWhenUnset(t *testing.T) {
	app := fiber.New()
	var got string

	app.Get("/probe", func(c fiber.Ctx) error {
		got = GetUserRole(c)
		return c.SendString("ok")
	})

	req := httptest.NewRequest("GET", "/probe", nil)
	resp, err := app.Test(req)
	assert.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	assert.Equal(t, "", got)
}

func TestGetUserIDReturnsZeroWhenUnset(t *testing.T) {
	app := fiber.New()
	var got int

	app.Get("/probe", func(c fiber.Ctx) error {
		got = GetUserID(c)
		return c.SendString("ok")
	})

	req := httptest.NewRequest("GET", "/probe", nil)
	resp, err := app.Test(req)
	assert.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	assert.Equal(t, 0, got)
}

func TestProtectedPropagatesClinicClaim(t *testing.T) {
	secret := "testsecret"
	token, err := utils.GenerateToken(3, 7, "vet@clinic.co", "veterinarian", secret, time.Minute)
	if err != nil {
		t.Fatalf("token generation failed: %v", err)
	}

	m := NewAuthMiddleware(secret)
	app := fiber.New()
	app.Get("/probe", m.Protected(), func(c fiber.Ctx) error {
		if got := GetClinicID(c); got != 7 {
			t.Errorf("clinicID = %d, want 7", got)
		}
		if got := GetUserID(c); got != 3 {
			t.Errorf("userID = %d, want 3", got)
		}
		return c.SendStatus(fiber.StatusOK)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/probe", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
}
