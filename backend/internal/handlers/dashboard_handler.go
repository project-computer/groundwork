package handlers

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/utils"
)

type DashboardHandler struct {
	db *pgxpool.Pool
}

func NewDashboardHandler(db *pgxpool.Pool) *DashboardHandler {
	return &DashboardHandler{db: db}
}

func (h *DashboardHandler) GetStats(c fiber.Ctx) error {
	ctx := c.Context()
	clinicID := 1 // TODO: Get from user context
	today := time.Now().Format("2006-01-02")

	stats := models.DashboardStats{}

	// Today's appointments
	err := h.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM appointments WHERE date = $1 AND clinic_id = $2",
		today, clinicID,
	).Scan(&stats.TodayAppointments)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "query_failed", "Failed to fetch today's appointments count")
	}

	// Pending visits
	err = h.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM visits WHERE status IN ('Waiting', 'In Examination') AND clinic_id = $1",
		clinicID,
	).Scan(&stats.PendingVisits)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "query_failed", "Failed to fetch pending visits count")
	}

	// Today's revenue
	err = h.db.QueryRow(ctx,
		"SELECT COALESCE(SUM(total), 0) FROM bills WHERE date = $1 AND status = 'Paid' AND clinic_id = $2",
		today, clinicID,
	).Scan(&stats.TodayRevenue)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "query_failed", "Failed to fetch today's revenue")
	}

	// Week revenue (last 7 days)
	weekAgo := time.Now().AddDate(0, 0, -7).Format("2006-01-02")
	err = h.db.QueryRow(ctx,
		"SELECT COALESCE(SUM(total), 0) FROM bills WHERE date >= $1 AND status = 'Paid' AND clinic_id = $2",
		weekAgo, clinicID,
	).Scan(&stats.WeekRevenue)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "query_failed", "Failed to fetch week revenue")
	}

	// Month revenue (last 30 days)
	monthAgo := time.Now().AddDate(0, 0, -30).Format("2006-01-02")
	err = h.db.QueryRow(ctx,
		"SELECT COALESCE(SUM(total), 0) FROM bills WHERE date >= $1 AND status = 'Paid' AND clinic_id = $2",
		monthAgo, clinicID,
	).Scan(&stats.MonthRevenue)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "query_failed", "Failed to fetch month revenue")
	}

	// Active patients
	err = h.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM pets WHERE status = 'Active' AND clinic_id = $1 AND deleted_at IS NULL",
		clinicID,
	).Scan(&stats.ActivePatients)
	if err != nil {
		return utils.ErrorResponse(c, fiber.StatusInternalServerError, "query_failed", "Failed to fetch active patients count")
	}

	return c.JSON(stats)
}

func (h *DashboardHandler) GetRevenue(c fiber.Ctx) error {
	ctx := c.Context()
	clinicID := 1 // TODO: Get from user context

	months := utils.GetQueryInt(c, "months", 6)
	if months < 1 || months > 24 {
		months = 6
	}

	type RevenueEntry struct {
		Month   string  `json:"month"`
		Revenue float64 `json:"revenue"`
	}

	var revenue []RevenueEntry

	now := time.Now()
	for i := months - 1; i >= 0; i-- {
		// Calculate the first and last day of each month
		targetMonth := now.AddDate(0, -i, 0)
		firstDay := time.Date(targetMonth.Year(), targetMonth.Month(), 1, 0, 0, 0, 0, time.UTC)
		lastDay := firstDay.AddDate(0, 1, -1)

		var monthRevenue float64
		err := h.db.QueryRow(ctx,
			"SELECT COALESCE(SUM(total), 0) FROM bills WHERE date >= $1 AND date <= $2 AND status = 'Paid' AND clinic_id = $3",
			firstDay.Format("2006-01-02"), lastDay.Format("2006-01-02"), clinicID,
		).Scan(&monthRevenue)
		if err != nil {
			return utils.ErrorResponse(c, fiber.StatusInternalServerError, "query_failed", fmt.Sprintf("Failed to fetch revenue for %s", firstDay.Format("Jan 2006")))
		}

		revenue = append(revenue, RevenueEntry{
			Month:   firstDay.Format("Jan 2006"),
			Revenue: monthRevenue,
		})
	}

	return c.JSON(revenue)
}
