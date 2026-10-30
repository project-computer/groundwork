package handlers

import (
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

type HistoryHandler struct {
	service *service.HistoryService
}

func NewHistoryHandler(service *service.HistoryService) *HistoryHandler {
	return &HistoryHandler{service: service}
}

// Get returns the full medical timeline for one patient: visits,
// prescriptions, bills and vaccinations, newest-relevant ordering per list
// query defaults.
func (h *HistoryHandler) Get(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid patient ID")
	}

	history, err := h.service.Get(c.Context(), middleware.GetClinicID(c), id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Patient not found")
	}

	return c.JSON(history)
}
