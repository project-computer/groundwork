package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
)

type BrandRepository struct {
	db *pgxpool.Pool
}

func NewBrandRepository(db *pgxpool.Pool) *BrandRepository {
	return &BrandRepository{db: db}
}

func (r *BrandRepository) Get(ctx context.Context, clinicID int) (*models.BrandSettings, error) {
	b := &models.BrandSettings{}
	query := `
		SELECT id, clinic_id, primary_color, primary_foreground,
		       accent_color, accent_foreground,
		       secondary_color, secondary_foreground,
		       sidebar_color, sidebar_foreground, sidebar_primary, sidebar_accent,
		       chart_1, chart_2, chart_3, chart_4, chart_5,
		       created_at, updated_at
		FROM brand_settings
		WHERE clinic_id = $1
	`
	err := r.db.QueryRow(ctx, query, clinicID).Scan(
		&b.ID, &b.ClinicID, &b.PrimaryColor, &b.PrimaryForeground,
		&b.AccentColor, &b.AccentForeground,
		&b.SecondaryColor, &b.SecondaryForeground,
		&b.SidebarColor, &b.SidebarForeground, &b.SidebarPrimary, &b.SidebarAccent,
		&b.Chart1, &b.Chart2, &b.Chart3, &b.Chart4, &b.Chart5,
		&b.CreatedAt, &b.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return b, nil
}

func (r *BrandRepository) Update(ctx context.Context, clinicID int, req models.UpdateBrandSettingsRequest) error {
	query := `
		UPDATE brand_settings
		SET primary_color        = COALESCE($1, primary_color),
		    primary_foreground   = COALESCE($2, primary_foreground),
		    accent_color         = COALESCE($3, accent_color),
		    accent_foreground    = COALESCE($4, accent_foreground),
		    secondary_color      = COALESCE($5, secondary_color),
		    secondary_foreground = COALESCE($6, secondary_foreground),
		    sidebar_color        = COALESCE($7, sidebar_color),
		    sidebar_foreground   = COALESCE($8, sidebar_foreground),
		    sidebar_primary      = COALESCE($9, sidebar_primary),
		    sidebar_accent       = COALESCE($10, sidebar_accent),
		    chart_1              = COALESCE($11, chart_1),
		    chart_2              = COALESCE($12, chart_2),
		    chart_3              = COALESCE($13, chart_3),
		    chart_4              = COALESCE($14, chart_4),
		    chart_5              = COALESCE($15, chart_5),
		    updated_at           = NOW()
		WHERE clinic_id = $16
	`
	_, err := r.db.Exec(ctx, query,
		req.PrimaryColor, req.PrimaryForeground,
		req.AccentColor, req.AccentForeground,
		req.SecondaryColor, req.SecondaryForeground,
		req.SidebarColor, req.SidebarForeground,
		req.SidebarPrimary, req.SidebarAccent,
		req.Chart1, req.Chart2, req.Chart3, req.Chart4, req.Chart5,
		clinicID,
	)
	return err
}
