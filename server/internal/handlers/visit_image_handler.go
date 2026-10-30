package handlers

import (
	"errors"
	"log"
	"net/http"

	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

type VisitImageHandler struct {
	service *service.VisitImageService
}

func NewVisitImageHandler(service *service.VisitImageService) *VisitImageHandler {
	return &VisitImageHandler{service: service}
}

// Upload accepts a multipart upload (field "file", optional "caption") and
// attaches the image to the visit.
func (h *VisitImageHandler) Upload(c fiber.Ctx) error {
	visitID, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid visit ID")
	}

	file, err := c.FormFile("file")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Multipart field 'file' is required")
	}

	img, err := h.service.Upload(c.Context(), middleware.GetClinicID(c), visitID, middleware.GetUserID(c), file, c.FormValue("caption"))
	if err != nil {
		if errors.Is(err, service.ErrInvalidImage) || err.Error() == "visit not found" {
			return utils.ErrorResponse(c, fiber.StatusBadRequest, "upload_failed", err.Error())
		}
		log.Printf("visit image upload failed (visit %d): %v", visitID, err)
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "upload_failed", "Failed to store upload")
	}

	return c.Status(http.StatusCreated).JSON(img)
}

func (h *VisitImageHandler) List(c fiber.Ctx) error {
	visitID, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid visit ID")
	}

	images, err := h.service.List(c.Context(), middleware.GetClinicID(c), visitID)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch visit images")
	}
	return c.JSON(images)
}

// Serve streams an uploaded file by its unguessable key.
func (h *VisitImageHandler) Serve(c fiber.Ctx) error {
	key := c.Params("*")
	if key == "" {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_key", "Missing file key")
	}

	img, data, err := h.service.Open(key)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "not_found", "File not found")
	}

	c.Set("Content-Type", img.MimeType)
	c.Set("Cache-Control", "private, max-age=31536000, immutable")
	return c.Status(http.StatusOK).Send(data)
}
