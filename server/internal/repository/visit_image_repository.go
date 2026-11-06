package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/project-computer/groundwork/server/internal/models"
)

type VisitImageRepository struct {
	db *pgxpool.Pool
}

func NewVisitImageRepository(db *pgxpool.Pool) *VisitImageRepository {
	return &VisitImageRepository{db: db}
}

func (r *VisitImageRepository) Create(ctx context.Context, img *models.VisitImage) error {
	query := `
		INSERT INTO visit_images (visit_id, file_key, url, thumbnail_url, caption, file_size, mime_type, uploaded_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, uploaded_at
	`
	return r.db.QueryRow(ctx, query,
		img.VisitID, img.FileKey, img.URL, img.ThumbnailURL, img.Caption, img.FileSize, img.MimeType, img.UploadedBy,
	).Scan(&img.ID, &img.UploadedAt)
}

func (r *VisitImageRepository) ListByVisit(ctx context.Context, clinicID, visitID int) ([]*models.VisitImage, error) {
	query := `
		SELECT vi.id, vi.visit_id, vi.file_key, vi.url, vi.thumbnail_url, vi.caption, vi.file_size, vi.mime_type, vi.uploaded_by, vi.uploaded_at
		FROM visit_images vi
		JOIN visits v ON v.id = vi.visit_id
		WHERE vi.visit_id = $1 AND v.clinic_id = $2
		ORDER BY vi.uploaded_at ASC
	`
	rows, err := r.db.Query(ctx, query, visitID, clinicID)
	if err != nil {
		return nil, fmt.Errorf("failed to query visit images: %w", err)
	}
	defer rows.Close()

	var images []*models.VisitImage
	for rows.Next() {
		img := &models.VisitImage{}
		if err := rows.Scan(&img.ID, &img.VisitID, &img.FileKey, &img.URL, &img.ThumbnailURL, &img.Caption, &img.FileSize, &img.MimeType, &img.UploadedBy, &img.UploadedAt); err != nil {
			return nil, fmt.Errorf("failed to scan visit image: %w", err)
		}
		images = append(images, img)
	}
	return images, rows.Err()
}

// GetByKey resolves a stored file key for serving. Keys are unguessable
// (128-bit random), which authorizes the fetch.
func (r *VisitImageRepository) GetByKey(ctx context.Context, key string) (*models.VisitImage, error) {
	img := &models.VisitImage{}
	query := `
		SELECT id, visit_id, file_key, url, thumbnail_url, caption, file_size, mime_type, uploaded_by, uploaded_at
		FROM visit_images
		WHERE file_key = $1
	`
	err := r.db.QueryRow(ctx, query, key).Scan(
		&img.ID, &img.VisitID, &img.FileKey, &img.URL, &img.ThumbnailURL, &img.Caption, &img.FileSize, &img.MimeType, &img.UploadedBy, &img.UploadedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch visit image: %w", err)
	}
	return img, nil
}
