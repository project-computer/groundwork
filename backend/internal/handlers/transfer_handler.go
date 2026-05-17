package handlers

import (
	"fmt"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

type TransferHandler struct {
	service   *service.TransferService
	validator *validator.Validate
}

func NewTransferHandler(svc *service.TransferService) *TransferHandler {
	return &TransferHandler{
		service:   svc,
		validator: validator.New(),
	}
}

func (h *TransferHandler) Create(c fiber.Ctx) error {
	var req models.CreateTransferRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}

	userID := middleware.GetUserID(c)
	clinicID := 1

	transfer, err := h.service.Create(c.Context(), clinicID, userID, req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "creation_failed", err.Error())
	}

	return c.Status(fiber.StatusCreated).JSON(transfer)
}

func (h *TransferHandler) Get(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid transfer ID")
	}

	transfer, err := h.service.Get(c.Context(), id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Transfer not found")
	}

	return c.JSON(transfer)
}

func (h *TransferHandler) GetByToken(c fiber.Ctx) error {
	token := c.Params("token")

	transfer, err := h.service.GetByShareToken(c.Context(), token)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Transfer not found or expired")
	}

	return c.JSON(transfer)
}

func (h *TransferHandler) List(c fiber.Ctx) error {
	query := models.TransferListQuery{
		Page:   utils.GetQueryInt(c, "page", 1),
		Limit:  utils.GetQueryInt(c, "limit", 20),
		Status: c.Query("status"),
		PetID:  utils.GetQueryInt(c, "petId", 0),
	}

	clinicID := 1

	transfers, meta, err := h.service.List(c.Context(), clinicID, query)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch transfers")
	}

	return utils.PaginatedResponse(c, transfers, meta)
}

func (h *TransferHandler) MarkSent(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid transfer ID")
	}

	if err := h.service.MarkSent(c.Context(), id); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "update_failed", err.Error())
	}

	return utils.SuccessResponse(c, "Transfer marked as sent", nil)
}

func (h *TransferHandler) MarkReceived(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid transfer ID")
	}

	if err := h.service.MarkReceived(c.Context(), id); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "update_failed", err.Error())
	}

	return utils.SuccessResponse(c, "Transfer marked as received", nil)
}

func (h *TransferHandler) GeneratePDF(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid transfer ID")
	}

	transfer, err := h.service.Get(c.Context(), id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Transfer not found")
	}

	pdfBytes, err := utils.GenerateTransferPDF(transfer)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "pdf_failed", err.Error())
	}

	c.Set("Content-Type", "application/pdf")
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=transfer-%s.pdf", transfer.CustomID))
	return c.Send(pdfBytes)
}
