package handlers

import (
	"encoding/json"

	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

type ClinicSettingsHandler struct {
	service *service.ClinicSettingsService
}

func NewClinicSettingsHandler(service *service.ClinicSettingsService) *ClinicSettingsHandler {
	return &ClinicSettingsHandler{service: service}
}

func (h *ClinicSettingsHandler) Get(c fiber.Ctx) error {
	settings, err := h.service.Get(c.Context(), middleware.GetClinicID(c))
	if err != nil {
		if err.Error() == "clinic not found" {
			return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Clinic not found")
		}
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch settings")
	}
	return c.JSON(fiber.Map{"settings": settings})
}

func (h *ClinicSettingsHandler) Update(c fiber.Ctx) error {
	var body struct {
		Settings json.RawMessage `json:"settings"`
	}
	if err := c.Bind().Body(&body); err != nil || len(body.Settings) == 0 {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Request body must include a settings object")
	}

	settings, err := h.service.Update(c.Context(), middleware.GetClinicID(c), body.Settings)
	if err != nil {
		if err.Error() == "clinic not found" {
			return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Clinic not found")
		}
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "update_failed", err.Error())
	}
	return c.JSON(fiber.Map{"settings": settings})
}
