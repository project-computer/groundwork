package handlers

import (
	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

type PatientHandler struct {
	service   *service.PatientService
	validator *validator.Validate
}

func NewPatientHandler(service *service.PatientService) *PatientHandler {
	return &PatientHandler{
		service:   service,
		validator: validator.New(),
	}
}

func (h *PatientHandler) Create(c fiber.Ctx) error {
	var req models.CreatePatientRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}

	clinicID := middleware.GetClinicID(c)

	patient, err := h.service.Create(c.Context(), clinicID, req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "creation_failed", err.Error())
	}

	return c.Status(fiber.StatusCreated).JSON(patient)
}

func (h *PatientHandler) Get(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid patient ID")
	}

	patient, err := h.service.Get(c.Context(), id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "patient_not_found", "Patient not found")
	}

	return c.JSON(patient)
}

func (h *PatientHandler) List(c fiber.Ctx) error {
	query := models.PatientListQuery{
		Page:    utils.GetQueryInt(c, "page", 1),
		Limit:   utils.GetQueryInt(c, "limit", 20),
		Search:  c.Query("search"),
		Species: c.Query("species"),
		Status:  c.Query("status"),
		MRN:     c.Query("mrn"),
	}

	clinicID := middleware.GetClinicID(c)

	patients, meta, err := h.service.List(c.Context(), clinicID, query)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch patients")
	}

	return utils.PaginatedResponse(c, patients, meta)
}

func (h *PatientHandler) Update(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid patient ID")
	}

	var req models.UpdatePatientRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	clinicID := middleware.GetClinicID(c)
	if err := h.service.Update(c.Context(), clinicID, id, req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "update_failed", err.Error())
	}

	return utils.SuccessResponse(c, "Patient updated successfully", nil)
}

func (h *PatientHandler) Delete(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid patient ID")
	}

	if err := h.service.Delete(c.Context(), id); err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "delete_failed", err.Error())
	}

	return utils.SuccessResponse(c, "Patient deleted successfully", nil)
}

func (h *PatientHandler) GetHistory(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid patient ID")
	}

	// TODO: Implement medical history fetching
	// This would include visits, prescriptions, bills, etc.

	return c.JSON(fiber.Map{
		"patientId":     id,
		"visits":        []interface{}{},
		"prescriptions": []interface{}{},
		"bills":         []interface{}{},
	})
}
