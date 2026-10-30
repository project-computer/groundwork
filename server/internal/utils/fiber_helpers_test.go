package utils

import (
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
)

func TestGetQueryInt(t *testing.T) {
	app := fiber.New()

	app.Get("/test", func(c fiber.Ctx) error {
		page := GetQueryInt(c, "page", 1)
		limit := GetQueryInt(c, "limit", 20)
		return c.JSON(fiber.Map{"page": page, "limit": limit})
	})

	t.Run("uses defaults when params missing", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		body, _ := io.ReadAll(resp.Body)
		assert.Contains(t, string(body), `"page":1`)
		assert.Contains(t, string(body), `"limit":20`)
	})

	t.Run("parses integer params", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test?page=3&limit=50", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		body, _ := io.ReadAll(resp.Body)
		assert.Contains(t, string(body), `"page":3`)
		assert.Contains(t, string(body), `"limit":50`)
	})

	t.Run("falls back to default on garbage", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test?page=foo", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		body, _ := io.ReadAll(resp.Body)
		assert.Contains(t, string(body), `"page":1`)
	})
}

func TestGetQueryString(t *testing.T) {
	app := fiber.New()

	app.Get("/q", func(c fiber.Ctx) error {
		search := GetQueryString(c, "search")
		return c.SendString(search)
	})

	t.Run("returns param", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/q?search=Luna", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		body, _ := io.ReadAll(resp.Body)
		assert.Equal(t, "Luna", string(body))
	})

	t.Run("returns empty when missing", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/q", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		body, _ := io.ReadAll(resp.Body)
		assert.Equal(t, "", string(body))
	})
}
