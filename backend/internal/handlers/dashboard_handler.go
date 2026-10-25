package handlers

import (
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

// DashboardHandler is now a thin layer: parse, dispatch, render. The raw pgxpool that
// used to live here has moved into repository.DashboardRepository and the orchestration
// into service.DashboardService per slice 0004.
type DashboardHandler struct {
	service *service.DashboardService
}

func NewDashboardHandler(svc *service.DashboardService) *DashboardHandler {
	return &DashboardHandler{service: svc}
}

func (h *DashboardHandler) GetStats(c fiber.Ctx) error {
	clinicID := middleware.GetClinicID(c)
	stats, err := h.service.GetStats(c.Context(), clinicID)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "query_failed", err.Error())
	}
	return c.JSON(stats)
}

func (h *DashboardHandler) GetRevenue(c fiber.Ctx) error {
	clinicID := middleware.GetClinicID(c)
	months := utils.GetQueryInt(c, "months", 6)
	revenue, err := h.service.GetRevenueSeries(c.Context(), clinicID, months)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "query_failed", err.Error())
	}
	return c.JSON(revenue)
}
