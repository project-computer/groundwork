package handlers

import (
	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

type AuthHandler struct {
	service   *service.AuthService
	validator *validator.Validate
}

func NewAuthHandler(service *service.AuthService) *AuthHandler {
	return &AuthHandler{
		service:   service,
		validator: validator.New(),
	}
}

func (h *AuthHandler) Login(c fiber.Ctx) error {
	var req models.LoginRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}

	resp, err := h.service.Login(c.Context(), req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusUnauthorized, "authentication_failed", err.Error())
	}

	return c.JSON(resp)
}

func (h *AuthHandler) RefreshToken(c fiber.Ctx) error {
	var req models.RefreshTokenRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}

	resp, err := h.service.RefreshToken(c.Context(), req.RefreshToken)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusUnauthorized, "token_refresh_failed", err.Error())
	}

	return c.JSON(resp)
}

func (h *AuthHandler) GetProfile(c fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	user, err := h.service.GetUser(c.Context(), userID)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "user_not_found", "User not found")
	}

	return c.JSON(user)
}

func (h *AuthHandler) UpdateProfile(c fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var req models.UpdateUserRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.service.UpdateUser(c.Context(), userID, req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "update_failed", err.Error())
	}

	return utils.SuccessResponse(c, "Profile updated successfully", nil)
}

func (h *AuthHandler) ChangePassword(c fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var req models.ChangePasswordRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}

	if err := h.service.ChangePassword(c.Context(), userID, req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "password_change_failed", err.Error())
	}

	return utils.SuccessResponse(c, "Password changed successfully", nil)
}

func (h *AuthHandler) Logout(c fiber.Ctx) error {
	// In stateless JWT, logout is handled client-side by removing the token
	// For enhanced security, you could implement a token blacklist
	return utils.SuccessResponse(c, "Logged out successfully", nil)
}

func (h *AuthHandler) CreateUser(c fiber.Ctx) error {
	var req models.CreateUserRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.validator.Struct(req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "validation_error", err.Error())
	}

	user, err := h.service.CreateUser(c.Context(), req)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "user_creation_failed", err.Error())
	}

	return c.Status(fiber.StatusCreated).JSON(user)
}

func (h *AuthHandler) ListUsers(c fiber.Ctx) error {
	users, err := h.service.ListUsers(c.Context())
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "fetch_failed", "Failed to fetch users")
	}

	return c.JSON(users)
}

func (h *AuthHandler) GetUser(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid user ID")
	}

	user, err := h.service.GetUser(c.Context(), id)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusNotFound, "user_not_found", "User not found")
	}

	return c.JSON(user)
}

func (h *AuthHandler) UpdateUser(c fiber.Ctx) error {
	id, err := utils.GetParamInt(c, "id")
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_id", "Invalid user ID")
	}

	var req models.UpdateUserRequest
	if err := c.Bind().Body(&req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusBadRequest, "invalid_request", "Invalid request body")
	}

	if err := h.service.UpdateUser(c.Context(), id, req); err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "update_failed", err.Error())
	}

	return utils.SuccessResponse(c, "User updated successfully", nil)
}
