package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"

	"github.com/project-computer/groundwork/server/internal/models"
	"github.com/project-computer/groundwork/server/internal/repository"
)

var ErrInvalidImage = errors.New("only image uploads (image/*) are allowed")

// VisitImageService persists attachments (photos, documents, test results)
// against a Visit. Files are stored on local disk under the configured upload
// path; metadata lives in visit_images.
type VisitImageService struct {
	repo       *repository.VisitImageRepository
	visits     *repository.VisitRepository
	audit      *AuditService
	uploadPath string
	maxSize    int64
}

func NewVisitImageService(repo *repository.VisitImageRepository, visits *repository.VisitRepository, audit *AuditService, uploadPath string, maxSize int64) *VisitImageService {
	if maxSize <= 0 {
		maxSize = 10 << 20
	}
	return &VisitImageService{repo: repo, visits: visits, audit: audit, uploadPath: uploadPath, maxSize: maxSize}
}

func (s *VisitImageService) Upload(ctx context.Context, clinicID, visitID, userID int, file *multipart.FileHeader, caption string) (*models.VisitImage, error) {
	// The visit must exist at the caller's clinic.
	visit, err := s.visits.GetByID(ctx, visitID)
	if err != nil {
		return nil, err
	}
	if visit.ClinicID != clinicID {
		return nil, fmt.Errorf("visit not found")
	}

	if file.Size > s.maxSize {
		return nil, fmt.Errorf("file exceeds maximum size of %d bytes", s.maxSize)
	}
	mimeType := file.Header.Get("Content-Type")
	if !strings.HasPrefix(mimeType, "image/") {
		return nil, ErrInvalidImage
	}

	src, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("failed to read uploaded file: %w", err)
	}
	defer src.Close()

	key, err := newFileKey(filepath.Ext(file.Filename))
	if err != nil {
		return nil, fmt.Errorf("failed to generate file key: %w", err)
	}

	if err := os.MkdirAll(s.uploadPath, 0o755); err != nil {
		return nil, fmt.Errorf("failed to prepare upload directory: %w", err)
	}
	dstPath := filepath.Join(s.uploadPath, key)
	dst, err := os.Create(dstPath)
	if err != nil {
		return nil, fmt.Errorf("failed to store uploaded file: %w", err)
	}
	defer dst.Close()

	written, err := io.Copy(dst, src)
	if err != nil {
		_ = os.Remove(dstPath) // best-effort cleanup of the partial file
		return nil, fmt.Errorf("failed to write uploaded file: %w", err)
	}

	img := &models.VisitImage{
		VisitID:    visitID,
		FileKey:    key,
		URL:        "/api/v1/files/" + key,
		FileSize:   int(written),
		MimeType:   mimeType,
		UploadedBy: userID,
	}
	if caption != "" {
		img.Caption = models.NewNullString(caption)
	}
	if err := s.repo.Create(ctx, img); err != nil {
		_ = os.Remove(dstPath) // best-effort cleanup of the orphaned file
		return nil, err
	}

	s.audit.Record(ctx, clinicID, userID, "visit.image_uploaded", "visit", visitID, map[string]interface{}{
		"fileKey":  key,
		"mimeType": mimeType,
		"fileSize": written,
	})
	return img, nil
}

func (s *VisitImageService) List(ctx context.Context, clinicID, visitID int) ([]*models.VisitImage, error) {
	return s.repo.ListByVisit(ctx, clinicID, visitID)
}

func (s *VisitImageService) Open(key string) (*models.VisitImage, []byte, error) {
	img, err := s.repo.GetByKey(context.Background(), key)
	if err != nil {
		return nil, nil, err
	}
	// Defense in depth: the random key authorizes, but never allow path parts.
	if img.FileKey != key || strings.Contains(key, "/") || strings.Contains(key, "..") {
		return nil, nil, fmt.Errorf("file not found")
	}
	data, err := os.ReadFile(filepath.Join(s.uploadPath, img.FileKey))
	if err != nil {
		return nil, nil, fmt.Errorf("file not found")
	}
	return img, data, nil
}

func newFileKey(ext string) (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	if ext == "" || len(ext) > 10 || !strings.HasPrefix(ext, ".") {
		ext = ""
	}
	return hex.EncodeToString(buf) + strings.ToLower(ext), nil
}
