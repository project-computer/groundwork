package service

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/vet-clinic/api/internal/models"
)

// fakeDashboardRepo satisfies service.DashboardRepo without pgx. The point of this
// test is to lock the service's contract — payload shape, month clamping, error
// propagation — so the handler's contract doesn't drift.
type fakeDashboardRepo struct {
	countToday int
	countTodayErr error

	pending int

	// SumPaidRevenueBetween is called three times in GetStats, in order:
	// 1. Today window (date=to=today)
	// 2. Week window (date>=weekAgo)
	// 3. Month window (date>=monthAgo)
	revenueByCall []float64
	revenueIdx    int

	active int

	series    []models.DashboardRevenueEntry
	seriesErr error

	upcoming      []models.DashboardVaccinationItem
	overdue       []models.DashboardVaccinationItem
	upcomingErr   error
	overdueErr    error
}

func (f *fakeDashboardRepo) CountTodayAppointments(_ context.Context, _ int, _ string) (int, error) {
	return f.countToday, f.countTodayErr
}

func (f *fakeDashboardRepo) CountPendingVisits(_ context.Context, _ int) (int, error) {
	return f.pending, nil
}

func (f *fakeDashboardRepo) SumPaidRevenueBetween(_ context.Context, _ int, _, _ string) (float64, error) {
	if f.revenueIdx >= len(f.revenueByCall) {
		return 0, nil
	}
	v := f.revenueByCall[f.revenueIdx]
	f.revenueIdx++
	return v, nil
}

func (f *fakeDashboardRepo) CountActivePatients(_ context.Context, _ int) (int, error) {
	return f.active, nil
}

func (f *fakeDashboardRepo) MonthlyRevenueSeries(_ context.Context, _, _ int) ([]models.DashboardRevenueEntry, error) {
	return f.series, f.seriesErr
}

func (f *fakeDashboardRepo) GetUpcomingVaccinations(_ context.Context, _, _ int) ([]models.DashboardVaccinationItem, error) {
	return f.upcoming, f.upcomingErr
}

func (f *fakeDashboardRepo) GetOverdueVaccinations(_ context.Context, _ int) ([]models.DashboardVaccinationItem, error) {
	return f.overdue, f.overdueErr
}

func TestDashboardServiceGetStatsPayloadShape(t *testing.T) {
	repo := &fakeDashboardRepo{
		countToday:    7,
		pending:       3,
		revenueByCall: []float64{1500.50, 9200.25, 35000.00},
		active:        42,
	}
	svc := NewDashboardService(repo)

	got, err := svc.GetStats(context.Background(), 1)
	assert.NoError(t, err)
	assert.Equal(t, models.DashboardStats{
		TodayAppointments: 7,
		PendingVisits:     3,
		TodayRevenue:      1500.50,
		WeekRevenue:       9200.25,
		MonthRevenue:      35000.00,
		ActivePatients:    42,
		UpcomingVaccinations: []models.DashboardVaccinationItem{},
		OverdueVaccinations:  []models.DashboardVaccinationItem{},
	}, got)
}

func TestDashboardServiceGetStatsIncludesVaccinationWidgets(t *testing.T) {
	repo := &fakeDashboardRepo{
		countToday:    1,
		pending:       0,
		revenueByCall: []float64{0, 0, 0},
		active:        5,
		upcoming: []models.DashboardVaccinationItem{
			{ID: 1, PatientName: "Mochi", VaccineName: "Rabies", NextDueDate: "2026-08-01", Link: "/vaccinations/1"},
		},
		overdue: []models.DashboardVaccinationItem{
			{ID: 2, PatientName: "Luna", VaccineName: "DA2PP", NextDueDate: "2026-07-10", Link: "/vaccinations/2"},
		},
	}
	svc := NewDashboardService(repo)

	got, err := svc.GetStats(context.Background(), 1)
	assert.NoError(t, err)
	assert.Len(t, got.UpcomingVaccinations, 1)
	assert.Equal(t, "Mochi", got.UpcomingVaccinations[0].PatientName)
	assert.Equal(t, "Rabies", got.UpcomingVaccinations[0].VaccineName)
	assert.Len(t, got.OverdueVaccinations, 1)
	assert.Equal(t, "Luna", got.OverdueVaccinations[0].PatientName)
}

func TestDashboardServiceGetStatsPropagatesOverdueError(t *testing.T) {
	repo := &fakeDashboardRepo{
		countToday:    1,
		revenueByCall: []float64{0, 0, 0},
		overdueErr:    errors.New("vacc query down"),
	}
	svc := NewDashboardService(repo)
	_, err := svc.GetStats(context.Background(), 1)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "vacc query down")
}

func TestDashboardServiceGetStatsPropagatesError(t *testing.T) {
	repo := &fakeDashboardRepo{countTodayErr: errors.New("db down")}
	svc := NewDashboardService(repo)
	_, err := svc.GetStats(context.Background(), 1)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "db down")
}

func TestDashboardServiceGetRevenueSeriesPassesThrough(t *testing.T) {
	repo := &fakeDashboardRepo{
		series: []models.DashboardRevenueEntry{
			{Month: "Jan 2026", Revenue: 100},
			{Month: "Feb 2026", Revenue: 200},
		},
	}
	svc := NewDashboardService(repo)
	got, err := svc.GetRevenueSeries(context.Background(), 1, 6)
	assert.NoError(t, err)
	assert.Equal(t, 2, len(got))
	assert.Equal(t, "Jan 2026", got[0].Month)
	assert.Equal(t, 200.0, got[1].Revenue)
}

func TestDashboardServiceGetRevenueSeriesPropagatesError(t *testing.T) {
	repo := &fakeDashboardRepo{seriesErr: errors.New("series broken")}
	svc := NewDashboardService(repo)
	_, err := svc.GetRevenueSeries(context.Background(), 1, 6)
	assert.Error(t, err)
}
