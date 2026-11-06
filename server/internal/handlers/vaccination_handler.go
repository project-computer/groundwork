package handlers

import (
	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/project-computer/groundwork/server/internal/middleware"
	"github.com/project-computer/groundwork/server/internal/models"
	"github.com/project-computer/groundwork/server/internal/service"
	"github.com/project-computer/groundwork/server/internal/utils"
)

type VaccinationHandler struct {
	service   *service.VaccinationService
	validator *validator.Validate
}

func NewVaccinationHandler(svc *service.VaccinationService) *VaccinationHandler {
	return &VaccinationHandler{
		service:   svc,
		validator: validator.New(),
	}
}

func (h *VaccinationHandler) Create(c fiber.Ctx) error {
	var req models.CreateVaccinationRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}
	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}

	clinicID := middleware.GetClinicID(c)
	userID := middleware.GetUserID(c)

	out, err := h.service.Create(c.Context(), clinicID, req, userID)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "creation_failed", err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(out)
}

func (h *VaccinationHandler) List(c fiber.Ctx) error {
	q := models.VaccinationListQuery{
		Page:        utils.GetQueryInt(c, "page", 1),
		Limit:       utils.GetQueryInt(c, "limit", 20),
		PatientID:   utils.GetQueryInt(c, "patientId", 0),
		VaccineName: c.Query("vaccineName"),
		OverdueOnly: c.Query("overdueOnly") == "true",
	}

	clinicID := middleware.GetClinicID(c)
	out, total, err := h.service.List(c.Context(), clinicID, q)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch vaccinations")
	}
	return utils.PaginatedResponse(c, out, models.PaginationMeta{
		Page:       q.Page,
		Limit:      q.Limit,
		TotalItems: total,
		TotalPages: (total + q.Limit - 1) / q.Limit,
	})
}

func (h *VaccinationHandler) Get(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid vaccination ID")
	}
	out, err := h.service.Get(c.Context(), id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "vaccination_not_found", "Vaccination not found")
	}
	return c.JSON(out)
}

func (h *VaccinationHandler) Delete(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid vaccination ID")
	}
	if err := h.service.Delete(c.Context(), id); err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "delete_failed", err.Error())
	}
	return utils.SuccessResponse(c, "Vaccination deleted successfully", nil)
}

func (h *VaccinationHandler) ListProtocols(c fiber.Ctx) error {
	out, err := h.service.ListProtocols(c.Context())
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch vaccine protocols")
	}
	return c.JSON(out)
}
