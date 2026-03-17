package utils

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
)

// GetParamInt extracts an integer parameter from the URL path
func GetParamInt(c fiber.Ctx, key string) (int, error) {
	val := c.Params(key)
	return strconv.Atoi(val)
}

// GetQueryInt extracts an integer query parameter with a default value
func GetQueryInt(c fiber.Ctx, key string, defaultValue int) int {
	val := c.Query(key)
	if val == "" {
		return defaultValue
	}
	intVal, err := strconv.Atoi(val)
	if err != nil {
		return defaultValue
	}
	return intVal
}

// GetQueryString extracts a string query parameter
func GetQueryString(c fiber.Ctx, key string) string {
	return c.Query(key)
}
