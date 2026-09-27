package handlers

import (
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

type DashboardHandler struct {
	service *service.DashboardService
}

func NewDashboardHandler(service *service.DashboardService) *DashboardHandler {
	return &DashboardHandler{service: service}
}

func (h *DashboardHandler) GetStats(c fiber.Ctx) error {
	clinicID := 1 // TODO: Get from user context

	stats, err := h.service.GetStats(c.Context(), clinicID)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "query_failed", "Failed to fetch dashboard stats")
	}

	return c.JSON(stats)
}

func (h *DashboardHandler) GetRevenue(c fiber.Ctx) error {
	clinicID := 1 // TODO: Get from user context

	months := utils.GetQueryInt(c, "months", 6)

	revenue, err := h.service.GetRevenue(c.Context(), clinicID, months)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "query_failed", "Failed to fetch revenue report")
	}

	return c.JSON(revenue)
}
