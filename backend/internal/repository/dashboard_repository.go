package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
)

type DashboardRepository struct {
	db *pgxpool.Pool
}

func NewDashboardRepository(db *pgxpool.Pool) *DashboardRepository {
	return &DashboardRepository{db: db}
}

// CountTodayAppointments returns the number of appointments scheduled for today in the
// given clinic.
func (r *DashboardRepository) CountTodayAppointments(ctx context.Context, clinicID int, today string) (int, error) {
	var n int
	err := r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM appointments WHERE date = $1 AND clinic_id = $2",
		today, clinicID,
	).Scan(&n)
	return n, err
}

// CountPendingVisits returns the number of visits currently waiting or in examination.
func (r *DashboardRepository) CountPendingVisits(ctx context.Context, clinicID int) (int, error) {
	var n int
	err := r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM visits WHERE status IN ('Waiting', 'In Examination') AND clinic_id = $1",
		clinicID,
	).Scan(&n)
	return n, err
}

// SumPaidRevenueBetween returns the sum of paid bill totals in the date range [from, to].
// If to is empty, no upper bound is applied.
func (r *DashboardRepository) SumPaidRevenueBetween(ctx context.Context, clinicID int, from, to string) (float64, error) {
	if to == "" {
		var sum float64
		err := r.db.QueryRow(ctx,
			"SELECT COALESCE(SUM(total), 0) FROM bills WHERE date >= $1 AND status = 'Paid' AND clinic_id = $2",
			from, clinicID,
		).Scan(&sum)
		return sum, err
	}
	var sum float64
	err := r.db.QueryRow(ctx,
		"SELECT COALESCE(SUM(total), 0) FROM bills WHERE date >= $1 AND date <= $2 AND status = 'Paid' AND clinic_id = $3",
		from, to, clinicID,
	).Scan(&sum)
	return sum, err
}

// CountActivePatients returns the number of non-deleted patients with status='Active'.
func (r *DashboardRepository) CountActivePatients(ctx context.Context, clinicID int) (int, error) {
	var n int
	err := r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM patients WHERE status = 'Active' AND clinic_id = $1 AND deleted_at IS NULL",
		clinicID,
	).Scan(&n)
	return n, err
}

// GetUpcomingVaccinations returns vaccinations whose next_due_date is between today and
// today+withinDays (inclusive). Excludes rows with next_due_date IS NULL per slice 0006.
func (r *DashboardRepository) GetUpcomingVaccinations(ctx context.Context, clinicID, withinDays int) ([]models.DashboardVaccinationItem, error) {
	if withinDays < 1 {
		withinDays = 30
	}
	rows, err := r.db.Query(ctx, `
		SELECT v.id, v.patient_id, p.name, v.vaccine_name, v.next_due_date
		  FROM vaccinations v
		  JOIN patients p ON p.id = v.patient_id
		 WHERE v.clinic_id = $1
		   AND v.next_due_date IS NOT NULL
		   AND v.next_due_date >= CURRENT_DATE
		   AND v.next_due_date <= (CURRENT_DATE + ($2 || ' days')::interval)
		 ORDER BY v.next_due_date ASC
		 LIMIT 50
	`, clinicID, withinDays)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanVaccinationWidgetRows(rows)
}

// GetOverdueVaccinations returns vaccinations whose next_due_date is strictly before today.
// Excludes rows with next_due_date IS NULL.
func (r *DashboardRepository) GetOverdueVaccinations(ctx context.Context, clinicID int) ([]models.DashboardVaccinationItem, error) {
	rows, err := r.db.Query(ctx, `
		SELECT v.id, v.patient_id, p.name, v.vaccine_name, v.next_due_date
		  FROM vaccinations v
		  JOIN patients p ON p.id = v.patient_id
		 WHERE v.clinic_id = $1
		   AND v.next_due_date IS NOT NULL
		   AND v.next_due_date < CURRENT_DATE
		 ORDER BY v.next_due_date ASC
		 LIMIT 50
	`, clinicID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanVaccinationWidgetRows(rows)
}

func scanVaccinationWidgetRows(rows pgx.Rows) ([]models.DashboardVaccinationItem, error) {
	var out []models.DashboardVaccinationItem
	for rows.Next() {
		var item models.DashboardVaccinationItem
		var dueDate time.Time
		if err := rows.Scan(&item.ID, &item.PatientID, &item.PatientName, &item.VaccineName, &dueDate); err != nil {
			return nil, err
		}
		item.NextDueDate = dueDate.Format("2006-01-02")
		item.Link = fmt.Sprintf("/vaccinations/%d", item.ID)
		out = append(out, item)
	}
	return out, rows.Err()
}
// `months` controls how many entries to return; 6 is the default.
func (r *DashboardRepository) MonthlyRevenueSeries(ctx context.Context, clinicID, months int) ([]models.DashboardRevenueEntry, error) {
	if months < 1 || months > 24 {
		months = 6
	}
	out := make([]models.DashboardRevenueEntry, 0, months)

	now := time.Now()
	for i := months - 1; i >= 0; i-- {
		target := now.AddDate(0, -i, 0)
		firstDay := time.Date(target.Year(), target.Month(), 1, 0, 0, 0, 0, time.UTC)
		lastDay := firstDay.AddDate(0, 1, -1)

		var monthRevenue float64
		err := r.db.QueryRow(ctx,
			"SELECT COALESCE(SUM(total), 0) FROM bills WHERE date >= $1 AND date <= $2 AND status = 'Paid' AND clinic_id = $3",
			firstDay.Format("2006-01-02"), lastDay.Format("2006-01-02"), clinicID,
		).Scan(&monthRevenue)
		if err != nil {
			return nil, err
		}
		out = append(out, models.DashboardRevenueEntry{
			Month:   firstDay.Format("Jan 2006"),
			Revenue: monthRevenue,
		})
	}
	return out, nil
}
