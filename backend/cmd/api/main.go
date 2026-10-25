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
	ownerRepo := repository.NewOwnerRepository(db)
	patientRepo := repository.NewPatientRepository(db, ownerRepo)
	appointmentRepo := repository.NewAppointmentRepository(db)
	visitRepo := repository.NewVisitRepository(db)
	billRepo := repository.NewBillRepository(db)
	prescriptionRepo := repository.NewPrescriptionRepository(db)
	dashboardRepo := repository.NewDashboardRepository(db)
	vaccinationRepo := repository.NewVaccinationRepository(db)
	vaccineProtocolRepo := repository.NewVaccineProtocolRepository(db)
	syncRepo := repository.NewSyncRepository(db)

	// Initialize services
	authService := service.NewAuthService(userRepo, cfg.JWT.Secret, cfg.JWT.AccessExpiry, cfg.JWT.RefreshExpiry)
	patientService := service.NewPatientService(patientRepo)
	ownerService := service.NewOwnerService(ownerRepo)
	appointmentService := service.NewAppointmentService(appointmentRepo, visitRepo)
	visitService := service.NewVisitService(visitRepo)
	billService := service.NewBillService(billRepo)
	prescriptionService := service.NewPrescriptionService(prescriptionRepo)
	dashboardService := service.NewDashboardService(dashboardRepo)
	vaccinationService := service.NewVaccinationService(vaccinationRepo, vaccineProtocolRepo, patientRepo)
	syncService := service.NewSyncService(syncRepo)

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authService)
	patientHandler := handlers.NewPatientHandler(patientService)
	ownerHandler := handlers.NewOwnerHandler(ownerService)
	appointmentHandler := handlers.NewAppointmentHandler(appointmentService)
	visitHandler := handlers.NewVisitHandler(visitService)
	billHandler := handlers.NewBillHandler(billService)
	prescriptionHandler := handlers.NewPrescriptionHandler(prescriptionService)
	dashboardHandler := handlers.NewDashboardHandler(dashboardService)
	vaccinationHandler := handlers.NewVaccinationHandler(vaccinationService)
	syncHandler := handlers.NewSyncHandler(syncService)

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

	// Owner routes
	owners := protected.Group("/owners")
	owners.Get("/", ownerHandler.List)
	owners.Post("/", ownerHandler.Create)
	owners.Get("/:id", ownerHandler.Get)
	owners.Put("/:id", ownerHandler.Update)
	owners.Delete("/:id", ownerHandler.Delete)
	owners.Get("/:id/patients", ownerHandler.ListPatients)

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

	// Visit routes
	visits := protected.Group("/visits")
	visits.Get("/", visitHandler.List)
	visits.Get("/queue", visitHandler.Queue)
	visits.Post("/", visitHandler.Create)
	visits.Get("/:id", visitHandler.Get)
	visits.Put("/:id", visitHandler.Update)
	visits.Post("/:id/complete", visitHandler.Complete)
	visits.Post("/:id/duplicate", visitHandler.Duplicate)

	// Bill routes
	bills := protected.Group("/bills")
	bills.Get("/", billHandler.List)
	bills.Post("/", billHandler.Create)
	bills.Get("/:id", billHandler.Get)
	bills.Put("/:id", billHandler.Update)

	// Prescription routes
	prescriptions := protected.Group("/prescriptions")
	prescriptions.Get("/", prescriptionHandler.List)
	prescriptions.Post("/", prescriptionHandler.Create)
	prescriptions.Get("/:id", prescriptionHandler.Get)

	// Dashboard routes
	dashboard := protected.Group("/dashboard")
	dashboard.Get("/stats", dashboardHandler.GetStats)
	dashboard.Get("/revenue", dashboardHandler.GetRevenue)

	vaccinations := protected.Group("/vaccinations")
	vaccinations.Get("/", vaccinationHandler.List)
	vaccinations.Post("/", vaccinationHandler.Create)
	vaccinations.Get("/:id", vaccinationHandler.Get)
	vaccinations.Delete("/:id", vaccinationHandler.Delete)
	vaccinations.Get("/protocols", vaccinationHandler.ListProtocols)

	// Desktop sync routes (sidecar -> cloud)
	sync := protected.Group("/sync")
	sync.Post("/push", syncHandler.Push)
	sync.Get("/pull", syncHandler.Pull)

	// Start server
	log.Printf("Starting server on %s:%s", cfg.Server.Host, cfg.Server.Port)
	if err := app.Listen(cfg.Server.Host + ":" + cfg.Server.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
