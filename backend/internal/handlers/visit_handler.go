package handlers

import (
	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

type VisitHandler struct {
	service   *service.VisitService
	validator *validator.Validate
}

func NewVisitHandler(service *service.VisitService) *VisitHandler {
	return &VisitHandler{
		service:   service,
		validator: validator.New(),
	}
}

func (h *VisitHandler) Create(c fiber.Ctx) error {
	var req models.CreateVisitRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}

	userID := middleware.GetUserID(c)
	clinicID := 1 // TODO: Get from user context in multi-clinic setup

	visit, err := h.service.Create(c.Context(), clinicID, userID, req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "creation_failed", err.Error())
	}

	return c.Status(fiber.StatusCreated).JSON(visit)
}

func (h *VisitHandler) Get(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid visit ID")
	}

	visit, err := h.service.Get(c.Context(), id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Visit not found")
	}

	return c.JSON(visit)
}

func (h *VisitHandler) List(c fiber.Ctx) error {
	query := models.VisitListQuery{
		Page:   utils.GetQueryInt(c, "page", 1),
		Limit:  utils.GetQueryInt(c, "limit", 20),
		Status: c.Query("status"),
		PetID:  utils.GetQueryInt(c, "petId", 0),
		Type:   c.Query("type"),
	}

	clinicID := 1 // TODO: Get from user context

	visits, meta, err := h.service.List(c.Context(), clinicID, query)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch visits")
	}

	return utils.PaginatedResponse(c, visits, meta)
}

func (h *VisitHandler) Queue(c fiber.Ctx) error {
	clinicID := 1 // TODO: Get from user context

	visits, err := h.service.Queue(c.Context(), clinicID)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch visit queue")
	}

	return c.JSON(visits)
}

func (h *VisitHandler) Update(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid visit ID")
	}

	var req models.UpdateVisitRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.service.Update(c.Context(), id, req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "update_failed", err.Error())
	}

	return utils.SuccessResponse(c, "Visit updated successfully", nil)
}

func (h *VisitHandler) Complete(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid visit ID")
	}

	if err := h.service.Complete(c.Context(), id); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "complete_failed", err.Error())
	}

	return utils.SuccessResponse(c, "Visit completed successfully", nil)
}

func (h *VisitHandler) Duplicate(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid visit ID")
	}

	clinicID := 1 // TODO: Get from user context

	visit, err := h.service.Duplicate(c.Context(), clinicID, id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "duplicate_failed", err.Error())
	}

	return c.Status(fiber.StatusCreated).JSON(visit)
}
