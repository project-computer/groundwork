package main

import (
	"log"

	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/config"
	"github.com/vet-clinic/api/internal/handlers"
	"github.com/vet-clinic/api/internal/middleware"
	"github.com/vet-clinic/api/internal/repository"
	"github.com/vet-clinic/api/internal/service"
	"github.com/vet-clinic/api/internal/utils"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize database
	db, err := utils.InitDB(cfg.Database.URL)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	log.Println("Database connected successfully")

	// Initialize repositories
	userRepo := repository.NewUserRepository(db)
	patientRepo := repository.NewPatientRepository(db)
	appointmentRepo := repository.NewAppointmentRepository(db)

	// Initialize services
	authService := service.NewAuthService(userRepo, cfg.JWT.Secret, cfg.JWT.AccessExpiry, cfg.JWT.RefreshExpiry)
	patientService := service.NewPatientService(patientRepo)
	appointmentService := service.NewAppointmentService(appointmentRepo)

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authService)
	patientHandler := handlers.NewPatientHandler(patientService)
	appointmentHandler := handlers.NewAppointmentHandler(appointmentService)

	// Initialize middleware
	authMiddleware := middleware.NewAuthMiddleware(cfg.JWT.Secret)

	// Create Fiber app
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{
				"error": err.Error(),
			})
		},
	})

	// Global middleware
	app.Use(middleware.Logger())
	app.Use(middleware.CORS(cfg.CORS.Origins))

	// Health check
	app.Get("/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status": "ok",
			"env":    cfg.Env,
		})
	})

	// API routes
	api := app.Group("/api/v1")

	// Public routes
	api.Post("/auth/login", authHandler.Login)
	api.Post("/auth/refresh", authHandler.RefreshToken)

	// Protected routes
	protected := api.Group("", authMiddleware.Protected())

	// Auth routes
	auth := protected.Group("/auth")
	auth.Get("/me", authHandler.GetProfile)
	auth.Put("/me", authHandler.UpdateProfile)
	auth.Put("/password", authHandler.ChangePassword)
	auth.Post("/logout", authHandler.Logout)

	// User management (admin only)
	users := protected.Group("/users", authMiddleware.RequireRole("admin"))
	users.Get("/", authHandler.ListUsers)
	users.Post("/", authHandler.CreateUser)
	users.Get("/:id", authHandler.GetUser)
	users.Put("/:id", authHandler.UpdateUser)

	// Patient routes
	patients := protected.Group("/patients")
	patients.Get("/", patientHandler.List)
	patients.Post("/", patientHandler.Create)
	patients.Get("/:id", patientHandler.Get)
	patients.Put("/:id", patientHandler.Update)
	patients.Delete("/:id", patientHandler.Delete)
	patients.Get("/:id/history", patientHandler.GetHistory)

	// Appointment routes
	appointments := protected.Group("/appointments")
	appointments.Get("/", appointmentHandler.List)
	appointments.Post("/", appointmentHandler.Create)
	appointments.Get("/today", appointmentHandler.GetToday)
	appointments.Get("/:id", appointmentHandler.Get)
	appointments.Put("/:id", appointmentHandler.Update)
	appointments.Delete("/:id", appointmentHandler.Delete)
	appointments.Post("/:id/checkin", appointmentHandler.CheckIn)
	appointments.Post("/:id/cancel", appointmentHandler.Cancel)

	// TODO: Add routes for visits, bills, prescriptions, etc.

	// Start server
	log.Printf("Starting server on %s:%s", cfg.Server.Host, cfg.Server.Port)
	if err := app.Listen(cfg.Server.Host + ":" + cfg.Server.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
