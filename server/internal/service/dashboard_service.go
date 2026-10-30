package service

import (
	"context"
	"time"

	"github.com/vet-clinic/api/internal/models"
)

// DashboardRepo is the minimal surface DashboardService needs. Defining it here keeps
// the service independent of the concrete repository, enabling handler-level testing
// without spinning up pgx.
type DashboardRepo interface {
	CountTodayAppointments(ctx context.Context, clinicID int, today string) (int, error)
	CountPendingVisits(ctx context.Context, clinicID int) (int, error)
	SumPaidRevenueBetween(ctx context.Context, clinicID int, from, to string) (float64, error)
	CountActivePatients(ctx context.Context, clinicID int) (int, error)
	MonthlyRevenueSeries(ctx context.Context, clinicID, months int) ([]models.DashboardRevenueEntry, error)
	GetUpcomingVaccinations(ctx context.Context, clinicID, withinDays int) ([]models.DashboardVaccinationItem, error)
	GetOverdueVaccinations(ctx context.Context, clinicID int) ([]models.DashboardVaccinationItem, error)
	GetLowStockItems(ctx context.Context, clinicID int) ([]models.DashboardLowStockItem, error)
	GetExpiringLots(ctx context.Context, clinicID, withinDays int) ([]models.DashboardExpiringLot, error)
	GetMostUsedMedicines(ctx context.Context, clinicID, sinceDays int) ([]models.DashboardMostUsedItem, error)
}

type DashboardService struct {
	repo DashboardRepo
}

func NewDashboardService(repo DashboardRepo) *DashboardService {
	return &DashboardService{repo: repo}
}

// GetStats reproduces the GetStats handler's payload exactly. Each value is computed
// against today (Asia/Bangkok-naive — UTC of the running server) and the last 7/30 days.
func (s *DashboardService) GetStats(ctx context.Context, clinicID int) (models.DashboardStats, error) {
	now := time.Now()
	today := now.Format("2006-01-02")
	weekAgo := now.AddDate(0, 0, -7).Format("2006-01-02")
	monthAgo := now.AddDate(0, 0, -30).Format("2006-01-02")

	var stats models.DashboardStats
	var err error

	if stats.TodayAppointments, err = s.repo.CountTodayAppointments(ctx, clinicID, today); err != nil {
		return stats, err
	}
	if stats.PendingVisits, err = s.repo.CountPendingVisits(ctx, clinicID); err != nil {
		return stats, err
	}
	if stats.TodayRevenue, err = s.repo.SumPaidRevenueBetween(ctx, clinicID, today, today); err != nil {
		return stats, err
	}
	if stats.WeekRevenue, err = s.repo.SumPaidRevenueBetween(ctx, clinicID, weekAgo, ""); err != nil {
		return stats, err
	}
	if stats.MonthRevenue, err = s.repo.SumPaidRevenueBetween(ctx, clinicID, monthAgo, ""); err != nil {
		return stats, err
	}
	if stats.ActivePatients, err = s.repo.CountActivePatients(ctx, clinicID); err != nil {
		return stats, err
	}

	// Vaccination widgets per slice 0006. We fetch both lists; if either errors the
	// whole payload would fail, so we surface the error rather than silently empty the
	// widget. Callers can choose to render without the widget if this happens.
	upcoming, err := s.repo.GetUpcomingVaccinations(ctx, clinicID, 30)
	if err != nil {
		return stats, err
	}
	stats.UpcomingVaccinations = ensureNonNil(upcoming)

	overdue, err := s.repo.GetOverdueVaccinations(ctx, clinicID)
	if err != nil {
		return stats, err
	}
	stats.OverdueVaccinations = ensureNonNil(overdue)

	// Inventory widgets per slice 0009.
	lowStock, err := s.repo.GetLowStockItems(ctx, clinicID)
	if err != nil {
		return stats, err
	}
	stats.LowStockItems = ensureNonNil(lowStock)

	expiring, err := s.repo.GetExpiringLots(ctx, clinicID, 30)
	if err != nil {
		return stats, err
	}
	stats.ExpiringLots = ensureNonNil(expiring)

	mostUsed, err := s.repo.GetMostUsedMedicines(ctx, clinicID, 30)
	if err != nil {
		return stats, err
	}
	stats.MostUsedMedicines = ensureNonNil(mostUsed)

	return stats, nil
}

func ensureNonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}

// GetRevenueSeries returns N months of paid revenue. `months` is clamped to [1, 24]
// with default 6 — matching the prior handler behavior.
func (s *DashboardService) GetRevenueSeries(ctx context.Context, clinicID, months int) ([]models.DashboardRevenueEntry, error) {
	if months < 1 || months > 24 {
		months = 6
	}
	return s.repo.MonthlyRevenueSeries(ctx, clinicID, months)
}
