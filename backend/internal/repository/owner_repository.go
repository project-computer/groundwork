package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
)

type OwnerRepository struct {
	db *pgxpool.Pool
}

func NewOwnerRepository(db *pgxpool.Pool) *OwnerRepository {
	return &OwnerRepository{db: db}
}

func (r *OwnerRepository) Create(ctx context.Context, clinicID int, o *models.Owner) error {
	var secContact interface{}
	if o.SecondaryContact != nil {
		b, _ := json.Marshal(o.SecondaryContact)
		secContact = string(b)
	}

	query := `
		INSERT INTO owners (clinic_id, name, phone, email, national_id, notes, secondary_contact)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRow(ctx, query,
		clinicID, o.Name, o.Phone, o.Email, o.NationalID, o.Notes, secContact,
	).Scan(&o.ID, &o.CreatedAt, &o.UpdatedAt)
}

func (r *OwnerRepository) GetByID(ctx context.Context, clinicID, id int) (*models.Owner, error) {
	o := &models.Owner{}
	var secContact []byte
	query := `
		SELECT id, clinic_id, name, phone, email, national_id, notes,
		       secondary_contact, created_at, updated_at
		FROM owners
		WHERE id = $1 AND clinic_id = $2
	`
	err := r.db.QueryRow(ctx, query, id, clinicID).Scan(
		&o.ID, &o.ClinicID, &o.Name, &o.Phone, &o.Email, &o.NationalID, &o.Notes,
		&secContact, &o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(secContact) > 0 {
		var sc models.SecondaryContact
		if err := json.Unmarshal(secContact, &sc); err == nil {
			o.SecondaryContact = &sc
		}
	}
	return o, nil
}

func (r *OwnerRepository) List(ctx context.Context, clinicID int, query models.OwnerListQuery) ([]*models.Owner, int, error) {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.Limit < 1 || query.Limit > 100 {
		query.Limit = 20
	}
	offset := (query.Page - 1) * query.Limit

	whereClauses := []string{"clinic_id = $1"}
	args := []interface{}{clinicID}
	argIdx := 2

	if query.Search != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("(name ILIKE $%d OR phone ILIKE $%d OR COALESCE(email, '') ILIKE $%d)", argIdx, argIdx, argIdx))
		args = append(args, "%"+query.Search+"%")
		argIdx++
	}
	whereSQL := strings.Join(whereClauses, " AND ")

	var total int
	if err := r.db.QueryRow(ctx, fmt.Sprintf("SELECT COUNT(*) FROM owners WHERE %s", whereSQL), args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	listQuery := fmt.Sprintf(`
		SELECT id, clinic_id, name, phone, email, national_id, notes,
		       secondary_contact, created_at, updated_at
		FROM owners
		WHERE %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argIdx, argIdx+1)
	args = append(args, query.Limit, offset)

	rows, err := r.db.Query(ctx, listQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var owners []*models.Owner
	for rows.Next() {
		o := &models.Owner{}
		var secContact []byte
		if err := rows.Scan(
			&o.ID, &o.ClinicID, &o.Name, &o.Phone, &o.Email, &o.NationalID, &o.Notes,
			&secContact, &o.CreatedAt, &o.UpdatedAt,
		); err != nil {
			return nil, 0, err
		}
		if len(secContact) > 0 {
			var sc models.SecondaryContact
			if err := json.Unmarshal(secContact, &sc); err == nil {
				o.SecondaryContact = &sc
			}
		}
		owners = append(owners, o)
	}
	return owners, total, rows.Err()
}

func (r *OwnerRepository) Update(ctx context.Context, clinicID, id int, updates map[string]interface{}) error {
	var secContact interface{}
	if sc, ok := updates["secondary_contact"]; ok {
		if sc == nil {
			secContact = nil
		} else {
			b, _ := json.Marshal(sc)
			secContact = string(b)
		}
		delete(updates, "secondary_contact")
	}

	setClauses := []string{
		"name = COALESCE($1, name)",
		"phone = COALESCE($2, phone)",
		"email = COALESCE($3, email)",
		"national_id = COALESCE($4, national_id)",
		"notes = COALESCE($5, notes)",
		"secondary_contact = COALESCE($6, secondary_contact)",
		"updated_at = NOW()",
	}
	query := fmt.Sprintf(`UPDATE owners SET %s WHERE id = $7 AND clinic_id = $8`,
		strings.Join(setClauses, ", "))

	_, err := r.db.Exec(ctx, query,
		updates["name"], updates["phone"], updates["email"],
		updates["national_id"], updates["notes"], secContact,
		id, clinicID,
	)
	return err
}

func (r *OwnerRepository) Delete(ctx context.Context, clinicID, id int) error {
	_, err := r.db.Exec(ctx, `DELETE FROM owners WHERE id = $1 AND clinic_id = $2`, id, clinicID)
	return err
}

func (r *OwnerRepository) FindOrCreate(ctx context.Context, clinicID int, name, phone, email, nationalID string) (*models.Owner, error) {
	o, err := r.GetByPhone(ctx, clinicID, phone, nationalID)
	if err == nil {
		return o, nil
	}
	o = &models.Owner{
		ClinicID: clinicID,
		Name:     name,
		Phone:    phone,
	}
	if email != "" {
		o.Email.String = email
		o.Email.Valid = true
	}
	if nationalID != "" {
		o.NationalID.String = nationalID
		o.NationalID.Valid = true
	}
	if err := r.Create(ctx, clinicID, o); err != nil {
		return nil, err
	}
	return o, nil
}

func (r *OwnerRepository) GetByPhone(ctx context.Context, clinicID int, phone, nationalID string) (*models.Owner, error) {
	o := &models.Owner{}
	var secContact []byte
	query := `
		SELECT id, clinic_id, name, phone, email, national_id, notes,
		       secondary_contact, created_at, updated_at
		FROM owners
		WHERE clinic_id = $1 AND phone = $2
		  AND COALESCE(national_id, '') = $3
		LIMIT 1
	`
	err := r.db.QueryRow(ctx, query, clinicID, phone, nationalID).Scan(
		&o.ID, &o.ClinicID, &o.Name, &o.Phone, &o.Email, &o.NationalID, &o.Notes,
		&secContact, &o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(secContact) > 0 {
		var sc models.SecondaryContact
		if err := json.Unmarshal(secContact, &sc); err == nil {
			o.SecondaryContact = &sc
		}
	}
	return o, nil
}

func (r *OwnerRepository) ListPatientIDs(ctx context.Context, clinicID, ownerID int) ([]int, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id FROM patients WHERE owner_id = $1 AND clinic_id = $2 AND deleted_at IS NULL ORDER BY id`,
		ownerID, clinicID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}