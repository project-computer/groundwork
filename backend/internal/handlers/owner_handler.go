package handlers

import (
	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

type OwnerHandler struct {
	service   *service.OwnerService
	validator *validator.Validate
}

func NewOwnerHandler(service *service.OwnerService) *OwnerHandler {
	return &OwnerHandler{
		service:   service,
		validator: validator.New(),
	}
}

func (h *OwnerHandler) Create(c fiber.Ctx) error {
	var req models.CreateOwnerRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}
	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}

	clinicID := middleware.GetClinicID(c)
	o, err := h.service.Create(c.Context(), clinicID, req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "creation_failed", err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(o)
}

func (h *OwnerHandler) Get(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid owner ID")
	}
	clinicID := middleware.GetClinicID(c)
	o, err := h.service.Get(c.Context(), clinicID, id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "owner_not_found", "Owner not found")
	}
	return c.JSON(o)
}

func (h *OwnerHandler) List(c fiber.Ctx) error {
	query := models.OwnerListQuery{
		Page:   utils.GetQueryInt(c, "page", 1),
		Limit:  utils.GetQueryInt(c, "limit", 20),
		Search: c.Query("search"),
	}
	clinicID := middleware.GetClinicID(c)
	owners, meta, err := h.service.List(c.Context(), clinicID, query)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch owners")
	}
	return utils.PaginatedResponse(c, owners, meta)
}

func (h *OwnerHandler) Update(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid owner ID")
	}
	var req models.UpdateOwnerRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}
	clinicID := middleware.GetClinicID(c)
	if err := h.service.Update(c.Context(), clinicID, id, req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "update_failed", err.Error())
	}
	return utils.SuccessResponse(c, "Owner updated successfully", nil)
}

func (h *OwnerHandler) Delete(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid owner ID")
	}
	clinicID := middleware.GetClinicID(c)
	if err := h.service.Delete(c.Context(), clinicID, id); err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "delete_failed", err.Error())
	}
	return utils.SuccessResponse(c, "Owner deleted successfully", nil)
}

func (h *OwnerHandler) ListPatients(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid owner ID")
	}
	clinicID := middleware.GetClinicID(c)
	ids, err := h.service.ListPatientIDs(c.Context(), clinicID, id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch owner's patients")
	}
	if ids == nil {
		ids = []int{}
	}
	return c.JSON(fiber.Map{"patientIds": ids})
}