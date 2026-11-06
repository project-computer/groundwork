package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/project-computer/groundwork/server/internal/models"
)

type UserRepository struct {
	db *pgxpool.Pool
}

func NewUserRepository(db *pgxpool.Pool) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(ctx context.Context, user *models.User) error {
	query := `
		INSERT INTO users (clinic_id, email, password_hash, name, role, phone, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRow(ctx, query,
		user.ClinicID, user.Email, user.PasswordHash, user.Name, user.Role, user.Phone, user.IsActive,
	).Scan(&user.ID, &user.CreatedAt, &user.UpdatedAt)
}

func (r *UserRepository) GetByID(ctx context.Context, id int) (*models.User, error) {
	user := &models.User{}
	query := `
		SELECT id, clinic_id, email, password_hash, name, role, phone, avatar_url, is_active, created_at, updated_at
		FROM users
		WHERE id = $1
	`
	err := r.db.QueryRow(ctx, query, id).Scan(
		&user.ID, &user.ClinicID, &user.Email, &user.PasswordHash, &user.Name, &user.Role,
		&user.Phone, &user.AvatarURL, &user.IsActive, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	user := &models.User{}
	query := `
		SELECT id, clinic_id, email, password_hash, name, role, phone, avatar_url, is_active, created_at, updated_at
		FROM users
		WHERE email = $1
	`
	err := r.db.QueryRow(ctx, query, email).Scan(
		&user.ID, &user.ClinicID, &user.Email, &user.PasswordHash, &user.Name, &user.Role,
		&user.Phone, &user.AvatarURL, &user.IsActive, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (r *UserRepository) List(ctx context.Context) ([]*models.User, error) {
	query := `
		SELECT id, clinic_id, email, name, role, phone, avatar_url, is_active, created_at, updated_at
		FROM users
		WHERE is_active = true
		ORDER BY created_at DESC
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		user := &models.User{}
		err := rows.Scan(
			&user.ID, &user.ClinicID, &user.Email, &user.Name, &user.Role,
			&user.Phone, &user.AvatarURL, &user.IsActive, &user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		users = append(users, user)
	}

	return users, rows.Err()
}

func (r *UserRepository) Update(ctx context.Context, id int, updates map[string]interface{}) error {
	query := `
		UPDATE users
		SET name = COALESCE($1, name),
		    phone = COALESCE($2, phone),
		    avatar_url = COALESCE($3, avatar_url),
		    is_active = COALESCE($4, is_active),
		    updated_at = NOW()
		WHERE id = $5
	`
	_, err := r.db.Exec(ctx, query,
		updates["name"], updates["phone"], updates["avatar_url"], updates["is_active"], id,
	)
	return err
}

func (r *UserRepository) UpdatePassword(ctx context.Context, id int, passwordHash string) error {
	query := `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.db.Exec(ctx, query, passwordHash, id)
	return err
}
