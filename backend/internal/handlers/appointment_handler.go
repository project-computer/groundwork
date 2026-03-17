package handlers

import (
	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

type AppointmentHandler struct {
	service   *service.AppointmentService
	validator *validator.Validate
}

func NewAppointmentHandler(service *service.AppointmentService) *AppointmentHandler {
	return &AppointmentHandler{
		service:   service,
		validator: validator.New(),
	}
}

func (h *AppointmentHandler) Create(c fiber.Ctx) error {
	var req models.CreateAppointmentRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}

	userID := middleware.GetUserID(c)
	clinicID := 1 // TODO: Get from user context in multi-clinic setup

	apt, err := h.service.Create(c.Context(), clinicID, userID, req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "creation_failed", err.Error())
	}

	return c.Status(fiber.StatusCreated).JSON(apt)
}

func (h *AppointmentHandler) Get(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid appointment ID")
	}

	apt, err := h.service.Get(c.Context(), id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Appointment not found")
	}

	return c.JSON(apt)
}

func (h *AppointmentHandler) List(c fiber.Ctx) error {
	query := models.AppointmentListQuery{
		Page:           utils.GetQueryInt(c, "page", 1),
		Limit:          utils.GetQueryInt(c, "limit", 20),
		Date:           c.Query("date"),
		Status:         c.Query("status"),
		VeterinarianID: utils.GetQueryInt(c, "veterinarianId", 0),
	}

	clinicID := 1 // TODO: Get from user context

	appointments, meta, err := h.service.List(c.Context(), clinicID, query)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch appointments")
	}

	return utils.PaginatedResponse(c, appointments, meta)
}

func (h *AppointmentHandler) Update(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid appointment ID")
	}

	var req models.UpdateAppointmentRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.service.Update(c.Context(), id, req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "update_failed", err.Error())
	}

	return utils.SuccessResponse(c, "Appointment updated successfully", nil)
}

func (h *AppointmentHandler) Delete(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid appointment ID")
	}

	if err := h.service.Delete(c.Context(), id); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "delete_failed", err.Error())
	}

	return utils.SuccessResponse(c, "Appointment deleted successfully", nil)
}

func (h *AppointmentHandler) CheckIn(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid appointment ID")
	}

	if err := h.service.CheckIn(c.Context(), id); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "checkin_failed", err.Error())
	}

	return utils.SuccessResponse(c, "Appointment checked in successfully", nil)
}

func (h *AppointmentHandler) Cancel(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid appointment ID")
	}

	if err := h.service.Cancel(c.Context(), id); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "cancel_failed", err.Error())
	}

	return utils.SuccessResponse(c, "Appointment cancelled successfully", nil)
}

func (h *AppointmentHandler) GetToday(c fiber.Ctx) error {
	clinicID := 1 // TODO: Get from user context

	appointments, err := h.service.GetTodayAppointments(c.Context(), clinicID)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch today's appointments")
	}

	return c.JSON(appointments)
}
