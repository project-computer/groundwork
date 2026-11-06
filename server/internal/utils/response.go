package utils

import (
	"github.com/gofiber/fiber/v3"
	"github.com/project-computer/groundwork/server/internal/models"
)

func ErrorResponse(c fiber.Ctx, status int, err string, message ...string) error {
	msg := ""
	if len(message) > 0 {
		msg = message[0]
	}
	return c.Status(status).JSON(models.ErrorResponse{
		Error:   err,
		Message: msg,
	})
}

func SuccessResponse(c fiber.Ctx, message string, data interface{}) error {
	return c.JSON(models.SuccessResponse{
		Message: message,
		Data:    data,
	})
}

func PaginatedResponse(c fiber.Ctx, data interface{}, meta models.PaginationMeta) error {
	return c.JSON(models.PaginatedResponse{
		Data: data,
		Meta: meta,
	})
}
