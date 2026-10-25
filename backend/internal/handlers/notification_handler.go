package handlers

import (
	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

type NotificationHandler struct {
	service   *service.NotificationService
	validator *validator.Validate
}

func NewNotificationHandler(svc *service.NotificationService) *NotificationHandler {
	return &NotificationHandler{service: svc, validator: validator.New()}
}

// SendTest handles POST /admin/notifications/test — admin role enforced at route level.
func (h *NotificationHandler) SendTest(c fiber.Ctx) error {
	var req models.SendTestNotificationRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}
	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}
	out, err := h.service.SendTest(c.Context(), middleware.GetClinicID(c), req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "send_failed", err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(out)
}

func (h *NotificationHandler) UpdateOwnerPrefs(c fiber.Ctx) error {
	ownerID, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid owner ID")
	}
	var req models.UpdateOwnerNotificationPrefsRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}
	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}
	out, err := h.service.UpdateOwnerPrefs(c.Context(), middleware.GetClinicID(c), ownerID, req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "update_failed", err.Error())
	}
	return c.JSON(out)
}

func (h *NotificationHandler) ListByOwner(c fiber.Ctx) error {
	ownerID, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid owner ID")
	}
	out, err := h.service.ListByOwner(c.Context(), middleware.GetClinicID(c), ownerID)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch notification log")
	}
	return c.JSON(out)
}
