package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
)

// RBAC matrix (slices 0007/0008): admin + pharmacist write; veterinarian read;
// receptionist and others no access. Enforced at route level in cmd/api/main.go.

type SupplierRepository struct {
	db *pgxpool.Pool
}

func NewSupplierRepository(db *pgxpool.Pool) *SupplierRepository {
	return &SupplierRepository{db: db}
}

const supplierCols = `id, clinic_id, name, phone, email, address, created_at, updated_at, deleted_at`

func scanSupplier(row pgx.Row) (*models.Supplier, error) {
	s := &models.Supplier{}
	err := row.Scan(&s.ID, &s.ClinicID, &s.Name, &s.Phone, &s.Email, &s.Address,
		&s.CreatedAt, &s.UpdatedAt, &s.DeletedAt)
	if err != nil {
		return nil, err
	}
	return s, nil
}

func (r *SupplierRepository) Create(ctx context.Context, clinicID int, s *models.Supplier) error {
	s.ClinicID = clinicID
	return r.db.QueryRow(ctx, `
		INSERT INTO suppliers (clinic_id, name, phone, email, address)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at`,
		s.ClinicID, s.Name, s.Phone, s.Email, s.Address,
	).Scan(&s.ID, &s.CreatedAt, &s.UpdatedAt)
}

func (r *SupplierRepository) GetByID(ctx context.Context, clinicID, id int) (*models.Supplier, error) {
	return scanSupplier(r.db.QueryRow(ctx,
		`SELECT `+supplierCols+` FROM suppliers WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
		id, clinicID))
}

func (r *SupplierRepository) List(ctx context.Context, clinicID int) ([]*models.Supplier, error) {
	rows, err := r.db.Query(ctx,
		`SELECT `+supplierCols+` FROM suppliers WHERE clinic_id = $1 AND deleted_at IS NULL ORDER BY name`,
		clinicID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.Supplier
	for rows.Next() {
		s := &models.Supplier{}
		if err := rows.Scan(&s.ID, &s.ClinicID, &s.Name, &s.Phone, &s.Email, &s.Address,
			&s.CreatedAt, &s.UpdatedAt, &s.DeletedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *SupplierRepository) Update(ctx context.Context, clinicID, id int, req *models.UpdateSupplierRequest) (*models.Supplier, error) {
	sets := []string{"updated_at = NOW()"}
	args := []interface{}{}
	idx := 1
	apply := func(val string, col string) {
		if val != "" {
			sets = append(sets, fmt.Sprintf("%s = $%d", col, idx))
			args = append(args, val)
			idx++
		}
	}
	apply(req.Name, "name")
	apply(req.Phone, "phone")
	apply(req.Email, "email")
	apply(req.Address, "address")

	args = append(args, id, clinicID)
	return scanSupplier(r.db.QueryRow(ctx,
		fmt.Sprintf(`UPDATE suppliers SET %s WHERE id = $%d AND clinic_id = $%d AND deleted_at IS NULL
			RETURNING %s`, strings.Join(sets, ", "), idx, idx+1, supplierCols),
		args...))
}

func (r *SupplierRepository) Delete(ctx context.Context, clinicID, id int) error {
	ct, err := r.db.Exec(ctx,
		`UPDATE suppliers SET deleted_at = NOW() WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
		id, clinicID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return errors.New("supplier not found")
	}
	return nil
}

type InventoryItemRepository struct {
	db *pgxpool.Pool
}

func NewInventoryItemRepository(db *pgxpool.Pool) *InventoryItemRepository {
	return &InventoryItemRepository{db: db}
}

const itemCols = `i.id, i.clinic_id, i.name, i.category, i.unit, i.reorder_level,
	i.selling_price, i.notes, COALESCE(lot_sum.qty, 0) AS on_hand, i.created_at, i.updated_at, i.deleted_at`

const itemFrom = `
	FROM inventory_items i
	LEFT JOIN (
		SELECT item_id, SUM(quantity) AS qty
		  FROM inventory_lots
		 WHERE deleted_at IS NULL
		 GROUP BY item_id
	) lot_sum ON lot_sum.item_id = i.id`

func scanItem(row pgx.Row) (*models.InventoryItem, error) {
	it := &models.InventoryItem{}
	err := row.Scan(&it.ID, &it.ClinicID, &it.Name, &it.Category, &it.Unit, &it.ReorderLevel,
		&it.SellingPrice, &it.Notes, &it.OnHand, &it.CreatedAt, &it.UpdatedAt, &it.DeletedAt)
	if err != nil {
		return nil, err
	}
	return it, nil
}

func (r *InventoryItemRepository) Create(ctx context.Context, clinicID int, it *models.InventoryItem) error {
	it.ClinicID = clinicID
	return r.db.QueryRow(ctx, `
		INSERT INTO inventory_items (clinic_id, name, category, unit, reorder_level, selling_price, notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, updated_at`,
		it.ClinicID, it.Name, it.Category, it.Unit, it.ReorderLevel, it.SellingPrice, it.Notes,
	).Scan(&it.ID, &it.CreatedAt, &it.UpdatedAt)
}

func (r *InventoryItemRepository) GetByID(ctx context.Context, clinicID, id int) (*models.InventoryItem, error) {
	return scanItem(r.db.QueryRow(ctx,
		`SELECT `+itemCols+itemFrom+` WHERE i.id = $1 AND i.clinic_id = $2 AND i.deleted_at IS NULL`,
		id, clinicID))
}

func (r *InventoryItemRepository) List(ctx context.Context, clinicID int, q models.InventoryItemListQuery) ([]*models.InventoryItem, int, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 || q.Limit > 200 {
		q.Limit = 20
	}
	offset := (q.Page - 1) * q.Limit

	where := []string{"i.clinic_id = $1", "i.deleted_at IS NULL"}
	args := []interface{}{clinicID}
	idx := 2
	if q.Category != "" {
		where = append(where, fmt.Sprintf("i.category = $%d", idx))
		args = append(args, q.Category)
		idx++
	}
	if q.Search != "" {
		where = append(where, fmt.Sprintf("i.name ILIKE $%d", idx))
		args = append(args, "%"+q.Search+"%")
		idx++
	}
	whereSQL := strings.Join(where, " AND ")

	var total int
	if err := r.db.QueryRow(ctx,
		fmt.Sprintf(`SELECT COUNT(*) FROM inventory_items i WHERE %s`, whereSQL), args...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	listSQL := fmt.Sprintf(`SELECT %s %s WHERE %s ORDER BY i.name LIMIT $%d OFFSET $%d`,
		itemCols, itemFrom, whereSQL, idx, idx+1)
	args = append(args, q.Limit, offset)

	rows, err := r.db.Query(ctx, listSQL, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []*models.InventoryItem
	for rows.Next() {
		it := &models.InventoryItem{}
		if err := rows.Scan(&it.ID, &it.ClinicID, &it.Name, &it.Category, &it.Unit, &it.ReorderLevel,
			&it.SellingPrice, &it.Notes, &it.OnHand, &it.CreatedAt, &it.UpdatedAt, &it.DeletedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, it)
	}
	return out, total, rows.Err()
}

func (r *InventoryItemRepository) Update(ctx context.Context, clinicID, id int, req *models.UpdateInventoryItemRequest) (*models.InventoryItem, error) {
	sets := []string{"updated_at = NOW()"}
	args := []interface{}{}
	idx := 1
	if req.Name != "" {
		sets = append(sets, fmt.Sprintf("name = $%d", idx))
		args = append(args, req.Name)
		idx++
	}
	if req.Category != "" {
		sets = append(sets, fmt.Sprintf("category = $%d", idx))
		args = append(args, req.Category)
		idx++
	}
	if req.Unit != "" {
		sets = append(sets, fmt.Sprintf("unit = $%d", idx))
		args = append(args, req.Unit)
		idx++
	}
	if req.ReorderLevel != nil {
		sets = append(sets, fmt.Sprintf("reorder_level = $%d", idx))
		args = append(args, *req.ReorderLevel)
		idx++
	}
	if req.SellingPrice > 0 {
		sets = append(sets, fmt.Sprintf("selling_price = $%d", idx))
		args = append(args, req.SellingPrice)
		idx++
	}
	if req.Notes != "" {
		sets = append(sets, fmt.Sprintf("notes = $%d", idx))
		args = append(args, req.Notes)
		idx++
	}

	args = append(args, id, clinicID)
	return scanItem(r.db.QueryRow(ctx,
		fmt.Sprintf(`UPDATE inventory_items i SET %s WHERE i.id = $%d AND i.clinic_id = $%d AND i.deleted_at IS NULL
			RETURNING %s`, strings.Join(sets, ", "), idx, idx+1, itemCols),
		args...))
}

func (r *InventoryItemRepository) Delete(ctx context.Context, clinicID, id int) error {
	ct, err := r.db.Exec(ctx,
		`UPDATE inventory_items SET deleted_at = NOW() WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
		id, clinicID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return errors.New("item not found")
	}
	return nil
}

type InventoryLotRepository struct {
	db *pgxpool.Pool
}

func NewInventoryLotRepository(db *pgxpool.Pool) *InventoryLotRepository {
	return &InventoryLotRepository{db: db}
}

const lotCols = `l.id, l.clinic_id, l.item_id, i.name, l.lot_number, l.quantity,
	l.expiry_date, l.supplier_id, s.name, l.cost_per_unit, l.received_date,
	l.created_at, l.updated_at, l.deleted_at`

const lotFrom = `
	FROM inventory_lots l
	JOIN inventory_items i ON i.id = l.item_id
	LEFT JOIN suppliers s ON s.id = l.supplier_id`

func scanLot(row pgx.Row) (*models.InventoryLot, error) {
	l := &models.InventoryLot{}
	err := row.Scan(&l.ID, &l.ClinicID, &l.ItemID, &l.ItemName, &l.LotNumber, &l.Quantity,
		&l.ExpiryDate, &l.SupplierID, &l.SupplierName, &l.CostPerUnit, &l.ReceivedDate,
		&l.CreatedAt, &l.UpdatedAt, &l.DeletedAt)
	if err != nil {
		return nil, err
	}
	return l, nil
}

func (r *InventoryLotRepository) Create(ctx context.Context, clinicID int, l *models.InventoryLot) error {
	l.ClinicID = clinicID
	return r.db.QueryRow(ctx, `
		INSERT INTO inventory_lots (clinic_id, item_id, lot_number, quantity, expiry_date, supplier_id, cost_per_unit, received_date)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at, updated_at`,
		l.ClinicID, l.ItemID, l.LotNumber, l.Quantity, l.ExpiryDate, l.SupplierID, l.CostPerUnit, l.ReceivedDate,
	).Scan(&l.ID, &l.CreatedAt, &l.UpdatedAt)
}

func (r *InventoryLotRepository) GetByID(ctx context.Context, clinicID, id int) (*models.InventoryLot, error) {
	return scanLot(r.db.QueryRow(ctx,
		`SELECT `+lotCols+lotFrom+` WHERE l.id = $1 AND l.clinic_id = $2 AND l.deleted_at IS NULL`,
		id, clinicID))
}

func (r *InventoryLotRepository) ListByItem(ctx context.Context, clinicID, itemID int) ([]*models.InventoryLot, error) {
	rows, err := r.db.Query(ctx,
		`SELECT `+lotCols+lotFrom+` WHERE l.item_id = $1 AND l.clinic_id = $2 AND l.deleted_at IS NULL
		 ORDER BY l.expiry_date NULLS LAST, l.received_date DESC`,
		itemID, clinicID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.InventoryLot
	for rows.Next() {
		l := &models.InventoryLot{}
		if err := rows.Scan(&l.ID, &l.ClinicID, &l.ItemID, &l.ItemName, &l.LotNumber, &l.Quantity,
			&l.ExpiryDate, &l.SupplierID, &l.SupplierName, &l.CostPerUnit, &l.ReceivedDate,
			&l.CreatedAt, &l.UpdatedAt, &l.DeletedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *InventoryLotRepository) Update(ctx context.Context, clinicID, id int, req *models.UpdateInventoryLotRequest) (*models.InventoryLot, error) {
	sets := []string{"updated_at = NOW()"}
	args := []interface{}{}
	idx := 1
	if req.LotNumber != "" {
		sets = append(sets, fmt.Sprintf("lot_number = $%d", idx))
		args = append(args, req.LotNumber)
		idx++
	}
	if req.ExpiryDate != "" {
		d, err := time.Parse("2006-01-02", req.ExpiryDate)
		if err != nil {
			return nil, errors.New("expiryDate must be YYYY-MM-DD")
		}
		sets = append(sets, fmt.Sprintf("expiry_date = $%d", idx))
		args = append(args, d)
		idx++
	}
	if req.CostPerUnit > 0 {
		sets = append(sets, fmt.Sprintf("cost_per_unit = $%d", idx))
		args = append(args, req.CostPerUnit)
		idx++
	}

	args = append(args, id, clinicID)
	return scanLot(r.db.QueryRow(ctx,
		fmt.Sprintf(`UPDATE inventory_lots l SET %s WHERE l.id = $%d AND l.clinic_id = $%d AND l.deleted_at IS NULL
			RETURNING %s`, strings.Join(sets, ", "), idx, idx+1, lotCols),
		args...))
}

// Sentinel errors mapped to HTTP statuses in the handler layer.
var (
	ErrLotNotFound       = errors.New("lot not found")
	ErrInsufficientStock = errors.New("insufficient stock for this operation")
)

// RecordMovement writes the ledger row and updates the lot's cached quantity in a
// single transaction so the ledger and the projection stay consistent (slice 0008).
// The `CHECK (quantity >= 0)` constraint surfaces a clear error if a lot goes negative.
func (r *InventoryLotRepository) RecordMovement(ctx context.Context, clinicID, lotID, userID int, req *models.CreateStockMovementRequest) (*models.StockMovement, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var itemID int
	err = tx.QueryRow(ctx,
		`SELECT item_id FROM inventory_lots WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
		lotID, clinicID).Scan(&itemID)
	if err != nil {
		return nil, ErrLotNotFound
	}

	mv := &models.StockMovement{
		ClinicID: clinicID,
		LotID:    lotID,
		ItemID:   itemID,
		Delta:    req.Delta,
		Reason:   req.Reason,
		UserID:   userID,
	}
	if req.RefType != "" {
		mv.RefType = models.NewNullString(req.RefType)
	}
	if req.RefID > 0 {
		mv.RefID = models.NewNullInt32(int32(req.RefID))
	}
	if req.Notes != "" {
		mv.Notes = models.NewNullString(req.Notes)
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO stock_movements (clinic_id, lot_id, delta, reason, ref_type, ref_id, user_id, notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at`,
		mv.ClinicID, mv.LotID, mv.Delta, mv.Reason, mv.RefType, mv.RefID, mv.UserID, mv.Notes,
	).Scan(&mv.ID, &mv.CreatedAt)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx,
		`UPDATE inventory_lots SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`,
		req.Delta, lotID)
	if err != nil {
		return nil, ErrInsufficientStock
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return mv, nil
}

func (r *InventoryLotRepository) ListMovementsByLot(ctx context.Context, clinicID, lotID int) ([]*models.StockMovement, error) {
	rows, err := r.db.Query(ctx, `
		SELECT m.id, m.clinic_id, m.lot_id, l.item_id, i.name, l.lot_number,
		       m.delta, m.reason, m.ref_type, m.ref_id, m.user_id, u.name, m.notes, m.created_at
		  FROM stock_movements m
		  JOIN inventory_lots l ON l.id = m.lot_id
		  JOIN inventory_items i ON i.id = l.item_id
		  JOIN users u ON u.id = m.user_id
		 WHERE m.clinic_id = $1 AND m.lot_id = $2
		 ORDER BY m.created_at DESC, m.id DESC`,
		clinicID, lotID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.StockMovement
	for rows.Next() {
		m := &models.StockMovement{}
		if err := rows.Scan(&m.ID, &m.ClinicID, &m.LotID, &m.ItemID, &m.ItemName, &m.LotNumber,
			&m.Delta, &m.Reason, &m.RefType, &m.RefID, &m.UserID, &m.UserName, &m.Notes, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
