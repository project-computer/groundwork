package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
)

type BillPaymentRepository struct {
	db *pgxpool.Pool
}

func NewBillPaymentRepository(db *pgxpool.Pool) *BillPaymentRepository {
	return &BillPaymentRepository{db: db}
}

func (r *BillPaymentRepository) Create(ctx context.Context, clinicID int, p *models.BillPayment) error {
	query := `
		INSERT INTO bill_payments (clinic_id, bill_id, amount, method, reference, notes, recorded_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at
	`
	return r.db.QueryRow(ctx, query,
		clinicID, p.BillID, p.Amount, p.Method, p.Reference, p.Notes, p.RecordedBy,
	).Scan(&p.ID, &p.CreatedAt)
}

func (r *BillPaymentRepository) ListByBill(ctx context.Context, billID int) ([]*models.BillPayment, error) {
	query := `
		SELECT id, clinic_id, bill_id, amount, method, reference, notes, recorded_by, created_at
		FROM bill_payments
		WHERE bill_id = $1
		ORDER BY created_at ASC, id ASC
	`
	rows, err := r.db.Query(ctx, query, billID)
	if err != nil {
		return nil, fmt.Errorf("failed to query bill payments: %w", err)
	}
	defer rows.Close()

	var payments []*models.BillPayment
	for rows.Next() {
		p := &models.BillPayment{}
		if err := rows.Scan(&p.ID, &p.ClinicID, &p.BillID, &p.Amount, &p.Method, &p.Reference, &p.Notes, &p.RecordedBy, &p.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan bill payment: %w", err)
		}
		payments = append(payments, p)
	}
	return payments, rows.Err()
}

func (r *BillPaymentRepository) SumByBill(ctx context.Context, billID int) (float64, error) {
	var sum float64
	err := r.db.QueryRow(ctx,
		"SELECT COALESCE(SUM(amount), 0) FROM bill_payments WHERE bill_id = $1",
		billID,
	).Scan(&sum)
	return sum, err
}
