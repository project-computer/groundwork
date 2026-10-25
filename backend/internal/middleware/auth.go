package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/utils"
)

type AuthMiddleware struct {
	jwtSecret string
}

func NewAuthMiddleware(jwtSecret string) *AuthMiddleware {
	return &AuthMiddleware{
		jwtSecret: jwtSecret,
	}
}

func (m *AuthMiddleware) Protected() fiber.Handler {
	return func(c fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Missing authorization header",
			})
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid authorization header format",
			})
		}

		tokenString := parts[1]
		claims, err := utils.ValidateToken(tokenString, m.jwtSecret)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid or expired token",
			})
		}

		// Store user info in context
		c.Locals("userID", claims.UserID)
		c.Locals("userEmail", claims.Email)
		c.Locals("userRole", claims.Role)

		return c.Next()
	}
}

func (m *AuthMiddleware) RequireRole(roles ...string) fiber.Handler {
	return func(c fiber.Ctx) error {
		userRole := c.Locals("userRole")
		if userRole == nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Unauthorized",
			})
		}

		role := userRole.(string)
		for _, r := range roles {
			if role == r {
				return c.Next()
			}
		}

		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "Insufficient permissions",
		})
	}
}

// GetUserID extracts user ID from context
func GetUserID(c fiber.Ctx) int {
	userID := c.Locals("userID")
	if userID == nil {
		return 0
	}
	return userID.(int)
}

// GetUserRole extracts user role from context
func GetUserRole(c fiber.Ctx) string {
	userRole := c.Locals("userRole")
	if userRole == nil {
		return ""
	}
	return userRole.(string)
}

// GetClinicID returns the tenant clinic for the current request.
// ADR-0004: returns 1 today; will read from a JWT claim when multi-branch goes live.
func GetClinicID(c fiber.Ctx) int {
	if v := c.Locals("clinicID"); v != nil {
		if id, ok := v.(int); ok {
			return id
		}
	}
	return 1
}
