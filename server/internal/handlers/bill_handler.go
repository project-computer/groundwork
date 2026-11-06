package handlers

import (
	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/project-computer/groundwork/server/internal/middleware"
	"github.com/project-computer/groundwork/server/internal/models"
	"github.com/project-computer/groundwork/server/internal/service"
	"github.com/project-computer/groundwork/server/internal/utils"
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
	clinicID := middleware.GetClinicID(c)

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

	clinicID := middleware.GetClinicID(c)

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

func (h *BillHandler) RecordPayment(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid bill ID")
	}

	var req models.CreateBillPaymentRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}

	payment, summary, err := h.service.RecordPayment(c.Context(), middleware.GetClinicID(c), id, middleware.GetUserID(c), req)
	if err != nil {
		if err.Error() == "bill not found" {
			return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Bill not found")
		}
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "payment_failed", err.Error())
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"payment": payment,
		"summary": summary,
	})
}

func (h *BillHandler) ListPayments(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid bill ID")
	}

	payments, summary, err := h.service.ListPayments(c.Context(), middleware.GetClinicID(c), id)
	if err != nil {
		if err.Error() == "bill not found" {
			return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Bill not found")
		}
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch payments")
	}

	return c.JSON(fiber.Map{
		"payments": payments,
		"summary":  summary,
	})
}

func (h *BillHandler) Void(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid bill ID")
	}

	if err := h.service.Void(c.Context(), middleware.GetClinicID(c), id, middleware.GetUserID(c)); err != nil {
		if err.Error() == "bill not found" {
			return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Bill not found")
		}
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "void_failed", err.Error())
	}

	return utils.SuccessResponse(c, "Bill voided successfully", nil)
}
