package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
)

type DashboardRepository struct {
	db *pgxpool.Pool
}

func NewDashboardRepository(db *pgxpool.Pool) *DashboardRepository {
	return &DashboardRepository{db: db}
}

func (r *DashboardRepository) GetStats(ctx context.Context, clinicID int) (*models.DashboardStats, error) {
	today := time.Now().Format("2006-01-02")
	weekAgo := time.Now().AddDate(0, 0, -7).Format("2006-01-02")
	monthAgo := time.Now().AddDate(0, 0, -30).Format("2006-01-02")

	stats := &models.DashboardStats{}

	// Today's appointments
	err := r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM appointments WHERE date = $1 AND clinic_id = $2",
		today, clinicID,
	).Scan(&stats.TodayAppointments)
	if err != nil {
		return nil, fmt.Errorf("failed to count today's appointments: %w", err)
	}

	// Pending visits
	err = r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM visits WHERE status IN ('Waiting', 'In Examination') AND clinic_id = $1",
		clinicID,
	).Scan(&stats.PendingVisits)
	if err != nil {
		return nil, fmt.Errorf("failed to count pending visits: %w", err)
	}

	// Today's revenue
	err = r.db.QueryRow(ctx,
		"SELECT COALESCE(SUM(total), 0) FROM bills WHERE date = $1 AND status = 'Paid' AND clinic_id = $2",
		today, clinicID,
	).Scan(&stats.TodayRevenue)
	if err != nil {
		return nil, fmt.Errorf("failed to sum today's revenue: %w", err)
	}

	// Week revenue (last 7 days)
	err = r.db.QueryRow(ctx,
		"SELECT COALESCE(SUM(total), 0) FROM bills WHERE date >= $1 AND status = 'Paid' AND clinic_id = $2",
		weekAgo, clinicID,
	).Scan(&stats.WeekRevenue)
	if err != nil {
		return nil, fmt.Errorf("failed to sum week revenue: %w", err)
	}

	// Month revenue (last 30 days)
	err = r.db.QueryRow(ctx,
		"SELECT COALESCE(SUM(total), 0) FROM bills WHERE date >= $1 AND status = 'Paid' AND clinic_id = $2",
		monthAgo, clinicID,
	).Scan(&stats.MonthRevenue)
	if err != nil {
		return nil, fmt.Errorf("failed to sum month revenue: %w", err)
	}

	// Active patients
	err = r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM pets WHERE status = 'Active' AND clinic_id = $1 AND deleted_at IS NULL",
		clinicID,
	).Scan(&stats.ActivePatients)
	if err != nil {
		return nil, fmt.Errorf("failed to count active patients: %w", err)
	}

	return stats, nil
}

func (r *DashboardRepository) GetRevenue(ctx context.Context, clinicID, months int) ([]models.RevenueEntry, error) {
	revenue := make([]models.RevenueEntry, 0, months)

	now := time.Now()
	for i := months - 1; i >= 0; i-- {
		// Calculate the first and last day of each month
		targetMonth := now.AddDate(0, -i, 0)
		firstDay := time.Date(targetMonth.Year(), targetMonth.Month(), 1, 0, 0, 0, 0, time.UTC)
		lastDay := firstDay.AddDate(0, 1, -1)

		var monthRevenue float64
		err := r.db.QueryRow(ctx,
			"SELECT COALESCE(SUM(total), 0) FROM bills WHERE date >= $1 AND date <= $2 AND status = 'Paid' AND clinic_id = $3",
			firstDay.Format("2006-01-02"), lastDay.Format("2006-01-02"), clinicID,
		).Scan(&monthRevenue)
		if err != nil {
			return nil, fmt.Errorf("failed to sum revenue for %s: %w", firstDay.Format("Jan 2006"), err)
		}

		revenue = append(revenue, models.RevenueEntry{
			Month:   firstDay.Format("Jan 2006"),
			Revenue: monthRevenue,
		})
	}

	return revenue, nil
}
