package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/project-computer/groundwork/server/internal/models"
	"github.com/project-computer/groundwork/server/internal/repository"
)

// Sentinel errors surfaced to the HTTP layer for precise status mapping.
var (
	ErrTransferNotFound   = errors.New("case transfer not found")
	ErrTransferNotPending = errors.New("case transfer is not pending")
)

const defaultTransferLifetimeDays = 14

// CaseTransferRepo is the persistence seam for case transfers; OwnerRepo
// resolves (or creates) the receiving clinic's owner. Interfaces so the
// transfer rules below can be tested without Postgres.
type CaseTransferRepo interface {
	Create(ctx context.Context, t *models.CaseTransfer) error
	GetByID(ctx context.Context, clinicID, id int) (*models.CaseTransfer, error)
	GetByToken(ctx context.Context, token string) (*models.CaseTransfer, error)
	SourcePatient(ctx context.Context, clinicID, patientID int) (*models.Patient, error)
	SourceVisits(ctx context.Context, clinicID, patientID int, visitIDs []int) ([]*models.Visit, error)
	CopyPatient(ctx context.Context, clinicID, ownerID int, src *models.Patient) (*models.Patient, error)
	CopyVisit(ctx context.Context, clinicID, patientID int, ownerName string, createdBy int, src *models.Visit) (*models.Visit, error)
	MarkAccepted(ctx context.Context, id, toClinicID, acceptedBy int) error
	MarkRevoked(ctx context.Context, id, fromClinicID int) error
	List(ctx context.Context, clinicID int) ([]*models.CaseTransfer, error)
}

type CaseTransferOwnerRepo interface {
	FindOrCreate(ctx context.Context, clinicID int, name, phone, email, nationalID string) (*models.Owner, error)
}

// CaseTransferService moves a bundle of clinical history between clinics
// without sharing rows: the receiving clinic gets its own copies of the
// Patient and selected Visits, stamped with the originating clinic for audit.
type CaseTransferService struct {
	repo   CaseTransferRepo
	owners CaseTransferOwnerRepo
	audit  *AuditService
	now    func() time.Time
}

func NewCaseTransferService(repo CaseTransferRepo, owners CaseTransferOwnerRepo, audit *AuditService) *CaseTransferService {
	return &CaseTransferService{repo: repo, owners: owners, audit: audit, now: time.Now}
}

// Create opens a transfer from the caller's clinic: validates the patient and
// every selected visit belong to it, mints an unguessable token, and returns
// the transfer (the share link is built from the token by clients).
func (s *CaseTransferService) Create(ctx context.Context, fromClinicID, userID int, req models.CreateCaseTransferRequest) (*models.CaseTransfer, error) {
	if _, err := s.repo.SourcePatient(ctx, fromClinicID, req.PatientID); err != nil {
		return nil, err
	}
	// Rejects any visit that doesn't belong to the patient at this clinic.
	if _, err := s.repo.SourceVisits(ctx, fromClinicID, req.PatientID, req.VisitIDs); err != nil {
		return nil, err
	}

	token, err := newTransferToken()
	if err != nil {
		return nil, fmt.Errorf("failed to generate transfer token: %w", err)
	}

	days := req.ExpiresInDays
	if days <= 0 || days > 90 {
		days = defaultTransferLifetimeDays
	}

	transfer := &models.CaseTransfer{
		FromClinicID: fromClinicID,
		PatientID:    req.PatientID,
		VisitIDs:     req.VisitIDs,
		Token:        token,
		Status:       "pending",
		CreatedBy:    userID,
		ExpiresAt:    s.now().AddDate(0, 0, days),
	}
	if req.ToClinicID > 0 {
		transfer.ToClinicID = models.NewNullInt32(int32(req.ToClinicID))
	}
	if req.Note != "" {
		transfer.Note = models.NewNullString(req.Note)
	}

	if err := s.repo.Create(ctx, transfer); err != nil {
		return nil, err
	}
	transfer.VisitCount = len(transfer.VisitIDs)

	s.audit.Record(ctx, fromClinicID, userID, "case_transfer.created", "case_transfer", transfer.ID, map[string]interface{}{
		"patientId": req.PatientID,
		"visitIds":  req.VisitIDs,
		"expiresAt": transfer.ExpiresAt,
	})
	return transfer, nil
}

// Preview resolves a share link (public, token-authorized) to the sanitized
// bundle. Expired or no-longer-pending transfers still preview, but flagged.
func (s *CaseTransferService) Preview(ctx context.Context, token string) (*models.CaseTransferPreview, error) {
	transfer, err := s.repo.GetByToken(ctx, token)
	if err != nil {
		if errors.Is(err, repository.ErrTransferNotFound) {
			return nil, ErrTransferNotFound
		}
		return nil, err
	}

	patient, err := s.repo.SourcePatient(ctx, transfer.FromClinicID, transfer.PatientID)
	if err != nil {
		return nil, err
	}
	visits, err := s.repo.SourceVisits(ctx, transfer.FromClinicID, transfer.PatientID, transfer.VisitIDs)
	if err != nil {
		return nil, err
	}

	preview := &models.CaseTransferPreview{
		Token:          transfer.Token,
		Status:         transfer.Status,
		ExpiresAt:      transfer.ExpiresAt,
		FromClinicName: transfer.FromClinicName,
		Note:           transfer.Note,
		Patient: models.CaseTransferPatientInfo{
			Name: patient.Name, Species: patient.Species, Breed: patient.Breed,
			DateOfBirth: patient.DateOfBirth, Weight: patient.Weight, MRN: patient.MRN,
		},
		Owner: models.CaseTransferOwnerInfo{
			Name: patient.OwnerName, Phone: patient.OwnerPhone, Email: patient.OwnerEmail,
		},
		Visits: make([]models.CaseTransferVisit, 0, len(visits)),
	}
	if transfer.Status == "pending" && s.now().After(transfer.ExpiresAt) {
		preview.Status = "expired"
	}
	for _, v := range visits {
		preview.Visits = append(preview.Visits, models.CaseTransferVisit{
			ID: v.ID, Date: v.CreatedAt, Type: v.Type, Purpose: v.Purpose,
			ChiefComplaint: v.ChiefComplaint, Vitals: v.Vitals, Examination: v.Examination,
			DifferentialDiagnosis: v.DifferentialDiagnosis, FinalDiagnosis: v.FinalDiagnosis,
			Treatment: v.Treatment, Advice: v.Advice, Medications: v.Medications,
		})
	}
	return preview, nil
}

// Accept copies the bundle into the caller's clinic. Owner is matched (or
// created) by phone; patient and visits are deep copies stamped with the
// originating clinic. Accepting is idempotent-safe: only a pending,
// unexpired transfer can be accepted.
func (s *CaseTransferService) Accept(ctx context.Context, token string, toClinicID, userID int) (*models.AcceptCaseTransferResult, error) {
	transfer, err := s.repo.GetByToken(ctx, token)
	if err != nil {
		if errors.Is(err, repository.ErrTransferNotFound) {
			return nil, ErrTransferNotFound
		}
		return nil, err
	}
	if transfer.Status != "pending" {
		return nil, ErrTransferNotPending
	}
	if s.now().After(transfer.ExpiresAt) {
		return nil, fmt.Errorf("case transfer link has expired")
	}
	if transfer.FromClinicID == toClinicID {
		return nil, fmt.Errorf("cannot accept a case transfer into the clinic that sent it")
	}

	patient, err := s.repo.SourcePatient(ctx, transfer.FromClinicID, transfer.PatientID)
	if err != nil {
		return nil, err
	}
	visits, err := s.repo.SourceVisits(ctx, transfer.FromClinicID, transfer.PatientID, transfer.VisitIDs)
	if err != nil {
		return nil, err
	}

	owner, err := s.owners.FindOrCreate(ctx, toClinicID, patient.OwnerName, patient.OwnerPhone, nullStr(patient.OwnerEmail), nullStr(patient.OwnerNationalID))
	if err != nil {
		return nil, err
	}

	copied, err := s.repo.CopyPatient(ctx, toClinicID, owner.ID, patient)
	if err != nil {
		return nil, err
	}

	result := &models.AcceptCaseTransferResult{PatientID: copied.ID, MRN: copied.MRN}
	for _, v := range visits {
		if _, err := s.repo.CopyVisit(ctx, toClinicID, copied.ID, patient.OwnerName, userID, v); err != nil {
			return nil, err
		}
		result.VisitsCopied++
	}

	if err := s.repo.MarkAccepted(ctx, transfer.ID, toClinicID, userID); err != nil {
		if errors.Is(err, repository.ErrTransferNotPending) {
			return nil, ErrTransferNotPending
		}
		return nil, err
	}

	s.audit.Record(ctx, toClinicID, userID, "case_transfer.accepted", "case_transfer", transfer.ID, map[string]interface{}{
		"fromClinicId": transfer.FromClinicID,
		"newPatientId": result.PatientID,
		"visitsCopied": result.VisitsCopied,
	})
	return result, nil
}

// Revoke kills a pending share link. Sender-side only.
func (s *CaseTransferService) Revoke(ctx context.Context, fromClinicID, transferID, userID int) error {
	transfer, err := s.repo.GetByID(ctx, fromClinicID, transferID)
	if err != nil {
		if errors.Is(err, repository.ErrTransferNotFound) {
			return ErrTransferNotFound
		}
		return err
	}
	if transfer.FromClinicID != fromClinicID {
		return fmt.Errorf("only the sending clinic can revoke a case transfer")
	}
	if err := s.repo.MarkRevoked(ctx, transferID, fromClinicID); err != nil {
		if errors.Is(err, repository.ErrTransferNotPending) {
			return ErrTransferNotPending
		}
		return err
	}

	s.audit.Record(ctx, fromClinicID, userID, "case_transfer.revoked", "case_transfer", transferID, nil)
	return nil
}

func (s *CaseTransferService) List(ctx context.Context, clinicID int) ([]*models.CaseTransfer, error) {
	return s.repo.List(ctx, clinicID)
}

func newTransferToken() (string, error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func nullStr(ns models.NullString) string {
	if ns.Valid {
		return ns.String
	}
	return ""
}
