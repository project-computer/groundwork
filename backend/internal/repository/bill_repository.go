package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
)

type BillRepository struct {
	db *pgxpool.Pool
}

func NewBillRepository(db *pgxpool.Pool) *BillRepository {
	return &BillRepository{db: db}
}

func (r *BillRepository) Create(ctx context.Context, clinicID int, bill *models.Bill) error {
	// Generate custom ID
	var count int
	err := r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM bills WHERE clinic_id = $1",
		clinicID,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("failed to count bills: %w", err)
	}

	bill.CustomID = fmt.Sprintf("BILL-%d", count+1)
	bill.ClinicID = clinicID

	// Calculate subtotal from items
	bill.Subtotal = 0
	// Items are already marshaled as json.RawMessage; subtotal/tax/total should be set by the service layer

	query := `
		INSERT INTO bills (
			clinic_id, custom_id, visit_id, pet_id, pet_name, owner_name,
			date, items, subtotal, tax, discount, total,
			status, payment_method, payment_notes, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
		RETURNING id, created_at, updated_at
	`

	return r.db.QueryRow(ctx, query,
		bill.ClinicID, bill.CustomID, bill.VisitID, bill.PetID, bill.PetName, bill.OwnerName,
		bill.Date, bill.Items, bill.Subtotal, bill.Tax, bill.Discount, bill.Total,
		bill.Status, bill.PaymentMethod, bill.PaymentNotes, bill.CreatedBy,
	).Scan(&bill.ID, &bill.CreatedAt, &bill.UpdatedAt)
}

func (r *BillRepository) GetByID(ctx context.Context, id int) (*models.Bill, error) {
	bill := &models.Bill{}

	query := `
		SELECT id, clinic_id, custom_id, visit_id, pet_id, pet_name, owner_name,
		       date, items, subtotal, tax, discount, total,
		       status, payment_method, payment_notes, created_by,
		       created_at, updated_at
		FROM bills
		WHERE id = $1
	`

	err := r.db.QueryRow(ctx, query, id).Scan(
		&bill.ID, &bill.ClinicID, &bill.CustomID, &bill.VisitID, &bill.PetID, &bill.PetName, &bill.OwnerName,
		&bill.Date, &bill.Items, &bill.Subtotal, &bill.Tax, &bill.Discount, &bill.Total,
		&bill.Status, &bill.PaymentMethod, &bill.PaymentNotes, &bill.CreatedBy,
		&bill.CreatedAt, &bill.UpdatedAt,
	)

	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("bill not found")
	}

	return bill, err
}

func (r *BillRepository) List(ctx context.Context, clinicID int, query models.BillListQuery) ([]*models.Bill, int, error) {
	// Set defaults
	if query.Page < 1 {
		query.Page = 1
	}
	if query.Limit < 1 || query.Limit > 100 {
		query.Limit = 20
	}
	offset := (query.Page - 1) * query.Limit

	// Build WHERE clause
	whereClauses := []string{"clinic_id = $1"}
	args := []interface{}{clinicID}
	argIdx := 2

	if query.Status != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, query.Status)
		argIdx++
	}

	if query.PetID > 0 {
		whereClauses = append(whereClauses, fmt.Sprintf("pet_id = $%d", argIdx))
		args = append(args, query.PetID)
		argIdx++
	}

	if query.StartDate != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("date >= $%d", argIdx))
		args = append(args, query.StartDate)
		argIdx++
	}

	if query.EndDate != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("date <= $%d", argIdx))
		args = append(args, query.EndDate)
		argIdx++
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	// Get total count
	var total int
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM bills WHERE %s", whereSQL)
	err := r.db.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count bills: %w", err)
	}

	// Get bills
	listQuery := fmt.Sprintf(`
		SELECT id, clinic_id, custom_id, visit_id, pet_id, pet_name, owner_name,
		       date, items, subtotal, tax, discount, total,
		       status, payment_method, payment_notes, created_by,
		       created_at, updated_at
		FROM bills
		WHERE %s
		ORDER BY date DESC, created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argIdx, argIdx+1)
	args = append(args, query.Limit, offset)

	rows, err := r.db.Query(ctx, listQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query bills: %w", err)
	}
	defer rows.Close()

	var bills []*models.Bill
	for rows.Next() {
		bill := &models.Bill{}
		err := rows.Scan(
			&bill.ID, &bill.ClinicID, &bill.CustomID, &bill.VisitID, &bill.PetID, &bill.PetName, &bill.OwnerName,
			&bill.Date, &bill.Items, &bill.Subtotal, &bill.Tax, &bill.Discount, &bill.Total,
			&bill.Status, &bill.PaymentMethod, &bill.PaymentNotes, &bill.CreatedBy,
			&bill.CreatedAt, &bill.UpdatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan bill: %w", err)
		}
		bills = append(bills, bill)
	}

	return bills, total, rows.Err()
}

func (r *BillRepository) Update(ctx context.Context, id int, updates map[string]interface{}) error {
	query := `
		UPDATE bills
		SET status = COALESCE($1, status),
		    payment_method = COALESCE($2, payment_method),
		    payment_notes = COALESCE($3, payment_notes),
		    items = COALESCE($4, items),
		    discount = COALESCE($5, discount),
		    subtotal = COALESCE($6, subtotal),
		    tax = COALESCE($7, tax),
		    total = COALESCE($8, total),
		    updated_at = NOW()
		WHERE id = $9
	`

	result, err := r.db.Exec(ctx, query,
		updates["status"], updates["payment_method"], updates["payment_notes"],
		updates["items"], updates["discount"], updates["subtotal"],
		updates["tax"], updates["total"],
		id,
	)

	if err != nil {
		return fmt.Errorf("failed to update bill: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("bill not found")
	}

	return nil
}
