package handlers

import (
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/repository"
	"github.com/vet-clinic/api/internal/utils"
)

type BrandHandler struct {
	repo *repository.BrandRepository
}

func NewBrandHandler(repo *repository.BrandRepository) *BrandHandler {
	return &BrandHandler{repo: repo}
}

func (h *BrandHandler) Get(c fiber.Ctx) error {
	brand, err := h.repo.Get(c.Context(), 1)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "Brand settings not found")
	}
	return c.JSON(brand)
}

func (h *BrandHandler) Update(c fiber.Ctx) error {
	var req models.UpdateBrandSettingsRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.repo.Update(c.Context(), 1, req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "update_failed", "Failed to update brand settings")
	}

	brand, err := h.repo.Get(c.Context(), 1)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch updated settings")
	}

	return utils.SuccessResponse(c, "Brand settings updated successfully", brand)
}
