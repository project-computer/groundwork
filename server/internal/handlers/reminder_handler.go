package handlers

import (
	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

type ReminderHandler struct {
	service   *service.ReminderService
	validator *validator.Validate
}

func NewReminderHandler(svc *service.ReminderService) *ReminderHandler {
	return &ReminderHandler{service: svc, validator: validator.New()}
}

// Run handles POST /admin/reminders/run — admin-only manual trigger (slice 0011).
func (h *ReminderHandler) Run(c fiber.Ctx) error {
	dispatched, err := h.service.RunOnce(c.Context(), middleware.GetClinicID(c))
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "reminder_run_failed", err.Error())
	}
	return c.JSON(fiber.Map{"dispatched": dispatched})
}

// GetWindow handles GET /admin/reminders/window.
func (h *ReminderHandler) GetWindow(c fiber.Ctx) error {
	window, err := h.service.Window(c.Context(), middleware.GetClinicID(c))
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", err.Error())
	}
	return c.JSON(fiber.Map{"window": window})
}

// UpdateWindow handles PUT /admin/reminders/window — per-clinic cadence (slice 0012).
func (h *ReminderHandler) UpdateWindow(c fiber.Ctx) error {
	var req models.UpdateClinicReminderWindowRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}
	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}
	for _, v := range req.Window {
		if v > 365 || v < -365 {
			return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", "window offsets must be within [-365, 365]")
		}
	}
	if err := h.service.SetWindow(c.Context(), middleware.GetClinicID(c), req.Window); err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "update_failed", err.Error())
	}
	return utils.SuccessResponse(c, "Reminder window updated", fiber.Map{"window": req.Window})
}
