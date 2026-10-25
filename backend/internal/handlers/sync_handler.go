package handlers

import (
	"context"
	"errors"
	"strconv"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

const defaultSyncClinicID = "clinic-01"

type SyncService interface {
	Push(ctx context.Context, clinicID string, req models.SyncPushRequest) (*models.SyncPushResponse, error)
	Pull(ctx context.Context, clinicID string, since int64) (*models.SyncPullResponse, error)
}

type SyncHandler struct {
	service   SyncService
	validator *validator.Validate
}

func NewSyncHandler(syncService SyncService) *SyncHandler {
	return &SyncHandler{
		service:   syncService,
		validator: validator.New(),
	}
}

func (h *SyncHandler) Push(c fiber.Ctx) error {
	var req models.SyncPushRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}
	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}

	resp, err := h.service.Push(c.Context(), syncClinicID(c), req)
	if err != nil {
		return syncError(c, err)
	}
	return c.JSON(resp)
}

func (h *SyncHandler) Pull(c fiber.Ctx) error {
	var since int64
	if raw := c.Query("since"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed < 0 {
			return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_since", "since must be a non-negative integer")
		}
		since = parsed
	}

	resp, err := h.service.Pull(c.Context(), syncClinicID(c), since)
	if err != nil {
		return syncError(c, err)
	}
	return c.JSON(resp)
}

func syncClinicID(c fiber.Ctx) string {
	if clinicID := c.Get("X-Clinic-ID"); clinicID != "" {
		return clinicID
	}
	return defaultSyncClinicID
}

func syncError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrSyncClockSkew):
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "clock_skew", err.Error())
	case errors.Is(err, service.ErrSyncInvalidChange):
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_change", err.Error())
	default:
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "sync_failed", "Sync failed")
	}
}
