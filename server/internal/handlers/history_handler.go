package handlers

import (
	"github.com/gofiber/fiber/v3"
	"github.com/project-computer/groundwork/server/internal/middleware"
	"github.com/project-computer/groundwork/server/internal/service"
	"github.com/project-computer/groundwork/server/internal/utils"
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
