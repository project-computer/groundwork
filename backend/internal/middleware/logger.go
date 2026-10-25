package middleware

import (
	"log"
	"time"

	"github.com/gofiber/fiber/v3"
)

func Logger() fiber.Handler {
	return func(c fiber.Ctx) error {
		start := time.Now()

		err := c.Next()

		duration := time.Since(start)
		log.Printf(
			"%s %s - %d - %v",
			c.Method(),
			c.Path(),
			c.Response().StatusCode(),
			duration,
		)

		return err
	}
}
