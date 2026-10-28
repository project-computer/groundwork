package main

import (
	"context"
	"log"
	"time"

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
	billPaymentRepo := repository.NewBillPaymentRepository(db)
	auditRepo := repository.NewAuditRepository(db)
	prescriptionRepo := repository.NewPrescriptionRepository(db)
	dashboardRepo := repository.NewDashboardRepository(db)
	vaccinationRepo := repository.NewVaccinationRepository(db)
	vaccineProtocolRepo := repository.NewVaccineProtocolRepository(db)
	syncRepo := repository.NewSyncRepository(db)
	supplierRepo := repository.NewSupplierRepository(db)
	inventoryItemRepo := repository.NewInventoryItemRepository(db)
	inventoryLotRepo := repository.NewInventoryLotRepository(db)
	notificationRepo := repository.NewNotificationRepository(db)
	caseTransferRepo := repository.NewCaseTransferRepository(db)
	clinicRepo := repository.NewClinicRepository(db)
	visitImageRepo := repository.NewVisitImageRepository(db)

	// Initialize services
	authService := service.NewAuthService(userRepo, cfg.JWT.Secret, cfg.JWT.AccessExpiry, cfg.JWT.RefreshExpiry)
	patientService := service.NewPatientService(patientRepo)
	ownerService := service.NewOwnerService(ownerRepo)
	appointmentService := service.NewAppointmentService(appointmentRepo, visitRepo)
	visitService := service.NewVisitService(visitRepo)
	auditService := service.NewAuditService(auditRepo)
	billService := service.NewBillService(billRepo, billPaymentRepo, auditService)
	prescriptionService := service.NewPrescriptionService(prescriptionRepo)
	dashboardService := service.NewDashboardService(dashboardRepo)
	vaccinationService := service.NewVaccinationService(vaccinationRepo, vaccineProtocolRepo, patientRepo)
	syncService := service.NewSyncService(syncRepo)
	supplierService := service.NewSupplierService(supplierRepo)
	itemService := service.NewItemService(inventoryItemRepo, inventoryLotRepo, auditService)
	historyService := service.NewHistoryService(patientRepo, visitRepo, prescriptionRepo, billRepo, vaccinationRepo)
	caseTransferService := service.NewCaseTransferService(caseTransferRepo, ownerRepo, auditService)
	clinicSettingsService := service.NewClinicSettingsService(clinicRepo)
	visitImageService := service.NewVisitImageService(visitImageRepo, visitRepo, auditService, cfg.FileStorage.UploadPath, cfg.FileStorage.MaxSize)
	notificationService := service.NewNotificationService(notificationRepo, ownerRepo, notificationRepo, nil)
	reminderService := service.NewReminderService(notificationRepo, notificationService)

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
	supplierHandler := handlers.NewSupplierHandler(supplierService)
	itemHandler := handlers.NewItemHandler(itemService)
	lotHandler := handlers.NewLotHandler(itemService)
	notificationHandler := handlers.NewNotificationHandler(notificationService)
	reminderHandler := handlers.NewReminderHandler(reminderService)
	historyHandler := handlers.NewHistoryHandler(historyService)
	caseTransferHandler := handlers.NewCaseTransferHandler(caseTransferService)
	clinicSettingsHandler := handlers.NewClinicSettingsHandler(clinicSettingsService)
	visitImageHandler := handlers.NewVisitImageHandler(visitImageService)

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

	// Health check — reports DB connectivity; 503 when the database is
	// unreachable so uptime monitors treat it as an outage.
	app.Get("/health", func(c fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.Context(), 2*time.Second)
		defer cancel()

		dbStatus := "up"
		if err := db.Ping(ctx); err != nil {
			dbStatus = "down"
		}

		status, code := "ok", fiber.StatusOK
		if dbStatus == "down" {
			status, code = "degraded", fiber.StatusServiceUnavailable
		}

		return c.Status(code).JSON(fiber.Map{
			"status":   status,
			"env":      cfg.Env,
			"database": dbStatus,
		})
	})

	// API routes
	api := app.Group("/api/v1")

	// Public routes
	api.Post("/auth/login", authHandler.Login)
	api.Post("/auth/refresh", authHandler.RefreshToken)
	// Case-transfer preview is token-authorized (the unguessable token in the
	// share link is the credential), so it is mounted outside the JWT group.
	api.Get("/case-transfers/preview/:token", caseTransferHandler.Preview)
	// Uploaded files are addressed by an unguessable 128-bit key, which is the
	// authorizer. Must stay registered BEFORE the protected group: Fiber v3
	// group middleware on an empty prefix matches everything registered after it.
	api.Get("/files/*", visitImageHandler.Serve)

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
	patients.Get("/:id/history", historyHandler.Get)

	// Owner routes
	owners := protected.Group("/owners")
	owners.Get("/", ownerHandler.List)
	owners.Post("/", ownerHandler.Create)
	// Notifications (slice 0010): test send is admin-only; prefs + log follow owner access
	notificationsAdmin := protected.Group("/admin/notifications", authMiddleware.RequireRole("admin"))
	notificationsAdmin.Post("/test", notificationHandler.SendTest)

	// Reminder scheduler endpoints (slices 0011/0012) — admin only
	remindersAdmin := protected.Group("/admin/reminders", authMiddleware.RequireRole("admin"))
	remindersAdmin.Post("/run", reminderHandler.Run)
	remindersAdmin.Get("/window", reminderHandler.GetWindow)
	remindersAdmin.Put("/window", reminderHandler.UpdateWindow)

	owners.Get("/:id", ownerHandler.Get)
	owners.Get("/:id/notifications", notificationHandler.ListByOwner)
	owners.Put("/:id/notification-preferences", notificationHandler.UpdateOwnerPrefs)
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
	bills.Post("/:id/payments", billHandler.RecordPayment)
	bills.Get("/:id/payments", billHandler.ListPayments)
	bills.Post("/:id/void", billHandler.Void)

	// Prescription routes
	prescriptions := protected.Group("/prescriptions")
	prescriptions.Get("/", prescriptionHandler.List)
	prescriptions.Post("/", prescriptionHandler.Create)
	prescriptions.Get("/:id", prescriptionHandler.Get)

	// Visit images: attachments (photos, documents, test results)
	visits.Post("/:id/images", visitImageHandler.Upload)
	visits.Get("/:id/images", visitImageHandler.List)

	// Clinic settings: read for all staff, update admin-only
	protected.Get("/settings", clinicSettingsHandler.Get)
	protected.Put("/settings", authMiddleware.RequireRole("admin"), clinicSettingsHandler.Update)

	// Case transfers: share a patient's visit bundle with another clinic
	caseTransfers := protected.Group("/case-transfers")
	caseTransfers.Get("/", caseTransferHandler.List)
	caseTransfers.Post("/", caseTransferHandler.Create)
	caseTransfers.Post("/accept/:token", caseTransferHandler.Accept)
	caseTransfers.Post("/:id/revoke", caseTransferHandler.Revoke)

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

	// Inventory: read = admin/pharmacist/veterinarian; write = admin/pharmacist (slices 0007/0008 RBAC matrix)
	inventoryRead := protected.Group("/inventory", authMiddleware.RequireRole("admin", "pharmacist", "veterinarian"))
	inventoryRead.Get("/items", itemHandler.List)
	inventoryRead.Get("/items/:id", itemHandler.Get)
	inventoryRead.Get("/items/:id/lots", itemHandler.ListLots)
	inventoryRead.Get("/lots/:id", lotHandler.Get)
	inventoryRead.Get("/lots/:id/movements", lotHandler.Movements)

	inventoryWrite := protected.Group("/inventory", authMiddleware.RequireRole("admin", "pharmacist"))
	inventoryWrite.Post("/items", itemHandler.Create)
	inventoryWrite.Put("/items/:id", itemHandler.Update)
	inventoryWrite.Delete("/items/:id", itemHandler.Delete)
	inventoryWrite.Post("/items/:id/lots", itemHandler.CreateLot)
	inventoryWrite.Put("/lots/:id", lotHandler.Update)
	inventoryWrite.Post("/lots/:id/movements", lotHandler.Movement)

	// Suppliers: same RBAC as inventory
	supplierRead := protected.Group("/suppliers", authMiddleware.RequireRole("admin", "pharmacist", "veterinarian"))
	supplierRead.Get("/", supplierHandler.List)
	supplierRead.Get("/:id", supplierHandler.Get)

	supplierWrite := protected.Group("/suppliers", authMiddleware.RequireRole("admin", "pharmacist"))
	supplierWrite.Post("/", supplierHandler.Create)
	supplierWrite.Put("/:id", supplierHandler.Update)
	supplierWrite.Delete("/:id", supplierHandler.Delete)

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
