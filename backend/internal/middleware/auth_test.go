package middleware

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
)

// GetClinicID is the single resolver through which every tenant-scoped query flows.
// Per ADR-0004, the present implementation returns 1 (defer-but-ready multi-tenancy).
// Activation = swap the body to read from a JWT claim. Behavior is verified here so the
// resolver's contract is locked in: 1 today, never panics.

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
