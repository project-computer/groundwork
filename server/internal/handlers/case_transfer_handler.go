package handlers

import (
	"errors"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/project-computer/groundwork/server/internal/middleware"
	"github.com/project-computer/groundwork/server/internal/models"
	"github.com/project-computer/groundwork/server/internal/service"
	"github.com/project-computer/groundwork/server/internal/utils"
)

type CaseTransferHandler struct {
	service   *service.CaseTransferService
	validator *validator.Validate
}

func NewCaseTransferHandler(service *service.CaseTransferService) *CaseTransferHandler {
	return &CaseTransferHandler{service: service, validator: validator.New()}
}

func (h *CaseTransferHandler) Create(c fiber.Ctx) error {
	var req models.CreateCaseTransferRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}
	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}

	transfer, err := h.service.Create(c.Context(), middleware.GetClinicID(c), middleware.GetUserID(c), req)
	if err != nil {
		if err.Error() == "patient not found" || err.Error() == "some visits were not found for this patient" {
			return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", err.Error())
		}
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "creation_failed", err.Error())
	}

	return c.Status(fiber.StatusCreated).JSON(transfer)
}

func (h *CaseTransferHandler) List(c fiber.Ctx) error {
	transfers, err := h.service.List(c.Context(), middleware.GetClinicID(c))
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch case transfers")
	}
	return c.JSON(transfers)
}

// Preview is public: the unguessable token in the link is the authorizer.
func (h *CaseTransferHandler) Preview(c fiber.Ctx) error {
	preview, err := h.service.Preview(c.Context(), c.Params("token"))
	if err != nil {
		if errors.Is(err, service.ErrTransferNotFound) {
			return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Case transfer not found")
		}
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "preview_failed", err.Error())
	}
	return c.JSON(preview)
}

func (h *CaseTransferHandler) Accept(c fiber.Ctx) error {
	result, err := h.service.Accept(c.Context(), c.Params("token"), middleware.GetClinicID(c), middleware.GetUserID(c))
	if err != nil {
		if errors.Is(err, service.ErrTransferNotFound) {
			return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Case transfer not found")
		}
		if errors.Is(err, service.ErrTransferNotPending) {
			return utils.ErrorResponse(c, fiber.StatusConflict, "not_pending", "Case transfer is no longer pending")
		}
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "accept_failed", err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(result)
}

func (h *CaseTransferHandler) Revoke(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid case transfer ID")
	}

	if err := h.service.Revoke(c.Context(), middleware.GetClinicID(c), id, middleware.GetUserID(c)); err != nil {
		if errors.Is(err, service.ErrTransferNotFound) {
			return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Case transfer not found")
		}
		if errors.Is(err, service.ErrTransferNotPending) {
			return utils.ErrorResponse(c, fiber.StatusConflict, "not_pending", "Case transfer is no longer pending")
		}
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "revoke_failed", err.Error())
	}

	return utils.SuccessResponse(c, "Case transfer revoked", nil)
}
