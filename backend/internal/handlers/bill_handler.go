package handlers

import (
	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

type BillHandler struct {
	service   *service.BillService
	validator *validator.Validate
}

func NewBillHandler(service *service.BillService) *BillHandler {
	return &BillHandler{
		service:   service,
		validator: validator.New(),
	}
}

func (h *BillHandler) Create(c fiber.Ctx) error {
	var req models.CreateBillRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}

	userID := middleware.GetUserID(c)
	clinicID := 1 // TODO: Get from user context in multi-clinic setup

	bill, err := h.service.Create(c.Context(), clinicID, userID, req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "creation_failed", err.Error())
	}

	return c.Status(fiber.StatusCreated).JSON(bill)
}

func (h *BillHandler) Get(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid bill ID")
	}

	bill, err := h.service.Get(c.Context(), id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Bill not found")
	}

	return c.JSON(bill)
}

func (h *BillHandler) List(c fiber.Ctx) error {
	query := models.BillListQuery{
		Page:      utils.GetQueryInt(c, "page", 1),
		Limit:     utils.GetQueryInt(c, "limit", 20),
		Status:    c.Query("status"),
		PetID:     utils.GetQueryInt(c, "petId", 0),
		StartDate: c.Query("startDate"),
		EndDate:   c.Query("endDate"),
	}

	clinicID := 1 // TODO: Get from user context

	bills, meta, err := h.service.List(c.Context(), clinicID, query)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch bills")
	}

	return utils.PaginatedResponse(c, bills, meta)
}

func (h *BillHandler) Update(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid bill ID")
	}

	var req models.UpdateBillRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.service.Update(c.Context(), id, req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "update_failed", err.Error())
	}

	return utils.SuccessResponse(c, "Bill updated successfully", nil)
}
