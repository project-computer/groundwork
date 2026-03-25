package handlers

import (
	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

type PrescriptionHandler struct {
	service   *service.PrescriptionService
	validator *validator.Validate
}

func NewPrescriptionHandler(service *service.PrescriptionService) *PrescriptionHandler {
	return &PrescriptionHandler{
		service:   service,
		validator: validator.New(),
	}
}

func (h *PrescriptionHandler) Create(c fiber.Ctx) error {
	var req models.CreatePrescriptionRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}

	_ = middleware.GetUserID(c)
	clinicID := 1 // TODO: Get from user context in multi-clinic setup

	rx, err := h.service.Create(c.Context(), clinicID, req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "creation_failed", err.Error())
	}

	return c.Status(fiber.StatusCreated).JSON(rx)
}

func (h *PrescriptionHandler) Get(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid prescription ID")
	}

	rx, err := h.service.Get(c.Context(), id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Prescription not found")
	}

	return c.JSON(rx)
}

func (h *PrescriptionHandler) List(c fiber.Ctx) error {
	query := models.PrescriptionListQuery{
		Page:      utils.GetQueryInt(c, "page", 1),
		Limit:     utils.GetQueryInt(c, "limit", 20),
		PetID:     utils.GetQueryInt(c, "petId", 0),
		VetID:     utils.GetQueryInt(c, "vetId", 0),
		StartDate: c.Query("startDate"),
		EndDate:   c.Query("endDate"),
	}

	clinicID := 1 // TODO: Get from user context

	prescriptions, meta, err := h.service.List(c.Context(), clinicID, query)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch prescriptions")
	}

	return utils.PaginatedResponse(c, prescriptions, meta)
}
