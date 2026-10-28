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
		   AND v.next_due_date <= (CURRENT_DATE + make_interval(days => $2::int))
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

// GetLowStockItems returns items whose SUM(active lots quantity) <= reorder_level,
// where reorder_level > 0 (slice 0009).
func (r *DashboardRepository) GetLowStockItems(ctx context.Context, clinicID int) ([]models.DashboardLowStockItem, error) {
	rows, err := r.db.Query(ctx, `
		SELECT i.id, i.name, i.category, COALESCE(lot_sum.qty, 0), i.reorder_level
		  FROM inventory_items i
		  LEFT JOIN (
			SELECT item_id, SUM(quantity) AS qty
			  FROM inventory_lots
			 WHERE deleted_at IS NULL
			 GROUP BY item_id
		  ) lot_sum ON lot_sum.item_id = i.id
		 WHERE i.clinic_id = $1
		   AND i.deleted_at IS NULL
		   AND i.reorder_level > 0
		   AND COALESCE(lot_sum.qty, 0) <= i.reorder_level
		 ORDER BY COALESCE(lot_sum.qty, 0) ASC
		 LIMIT 20
	`, clinicID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.DashboardLowStockItem
	for rows.Next() {
		var it models.DashboardLowStockItem
		if err := rows.Scan(&it.ItemID, &it.Name, &it.Category, &it.OnHand, &it.ReorderLevel); err != nil {
			return nil, err
		}
		it.Link = fmt.Sprintf("/inventory/%d", it.ItemID)
		out = append(out, it)
	}
	return out, rows.Err()
}

// GetExpiringLots returns active lots whose expiry_date falls within
// [today, today + withinDays] (slice 0009).
func (r *DashboardRepository) GetExpiringLots(ctx context.Context, clinicID, withinDays int) ([]models.DashboardExpiringLot, error) {
	if withinDays < 1 {
		withinDays = 30
	}
	rows, err := r.db.Query(ctx, `
		SELECT l.id, i.id, i.name, l.lot_number, l.expiry_date, l.quantity
		  FROM inventory_lots l
		  JOIN inventory_items i ON i.id = l.item_id
		 WHERE l.clinic_id = $1
		   AND l.deleted_at IS NULL
		   AND l.expiry_date IS NOT NULL
		   AND l.expiry_date >= CURRENT_DATE
		   AND l.expiry_date <= (CURRENT_DATE + make_interval(days => $2::int))
		 ORDER BY l.expiry_date ASC
		 LIMIT 20
	`, clinicID, withinDays)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.DashboardExpiringLot
	for rows.Next() {
		var lot models.DashboardExpiringLot
		var expiry time.Time
		if err := rows.Scan(&lot.LotID, &lot.ItemID, &lot.ItemName, &lot.LotNumber, &expiry, &lot.Quantity); err != nil {
			return nil, err
		}
		lot.ExpiryDate = expiry.Format("2006-01-02")
		lot.Link = fmt.Sprintf("/inventory/%d", lot.ItemID)
		out = append(out, lot)
	}
	return out, rows.Err()
}

// GetMostUsedMedicines aggregates stock_movements stock_out rows over sinceDays for
// medicine + vaccine items only (equipment/supply excluded per slice 0009).
func (r *DashboardRepository) GetMostUsedMedicines(ctx context.Context, clinicID, sinceDays int) ([]models.DashboardMostUsedItem, error) {
	if sinceDays < 1 {
		sinceDays = 30
	}
	rows, err := r.db.Query(ctx, `
		SELECT i.id, i.name, SUM(ABS(m.delta)) AS used_qty
		  FROM stock_movements m
		  JOIN inventory_lots l ON l.id = m.lot_id
		  JOIN inventory_items i ON i.id = l.item_id
		 WHERE m.clinic_id = $1
		   AND m.reason = 'stock_out'
		   AND m.created_at >= NOW() - make_interval(days => $2::int)
		   AND i.category IN ('medicine', 'vaccine')
		 GROUP BY i.id, i.name
		 ORDER BY used_qty DESC
		 LIMIT 5
	`, clinicID, sinceDays)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.DashboardMostUsedItem
	for rows.Next() {
		var it models.DashboardMostUsedItem
		if err := rows.Scan(&it.ItemID, &it.Name, &it.UsedQty); err != nil {
			return nil, err
		}
		it.Link = fmt.Sprintf("/inventory/%d", it.ItemID)
		out = append(out, it)
	}
	return out, rows.Err()
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
