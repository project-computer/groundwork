package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/repository"
)

type fakeTransferRepo struct {
	transfer      *models.CaseTransfer
	patient       *models.Patient
	visits        []*models.Visit
	copiedPatient *models.Patient
	copiedVisits  int
	accepted      bool
	revoked       bool
}

func (f *fakeTransferRepo) Create(ctx context.Context, t *models.CaseTransfer) error {
	t.ID = 1
	return nil
}
func (f *fakeTransferRepo) GetByID(ctx context.Context, clinicID, id int) (*models.CaseTransfer, error) {
	if f.transfer == nil {
		return nil, repository.ErrTransferNotFound
	}
	return f.transfer, nil
}
func (f *fakeTransferRepo) GetByToken(ctx context.Context, token string) (*models.CaseTransfer, error) {
	if f.transfer == nil || f.transfer.Token != token {
		return nil, repository.ErrTransferNotFound
	}
	return f.transfer, nil
}
func (f *fakeTransferRepo) SourcePatient(ctx context.Context, clinicID, patientID int) (*models.Patient, error) {
	if f.patient == nil {
		return nil, errors.New("patient not found")
	}
	return f.patient, nil
}
func (f *fakeTransferRepo) SourceVisits(ctx context.Context, clinicID, patientID int, visitIDs []int) ([]*models.Visit, error) {
	known := map[int]bool{}
	for _, v := range f.visits {
		known[v.ID] = true
	}
	for _, id := range visitIDs {
		if !known[id] {
			return nil, errors.New("some visits were not found for this patient")
		}
	}
	return f.visits, nil
}
func (f *fakeTransferRepo) CopyPatient(ctx context.Context, clinicID, ownerID int, src *models.Patient) (*models.Patient, error) {
	f.copiedPatient = &models.Patient{ID: 99, ClinicID: clinicID, OwnerID: ownerID, Name: src.Name, MRN: "PT-2026-0001"}
	return f.copiedPatient, nil
}
func (f *fakeTransferRepo) CopyVisit(ctx context.Context, clinicID, patientID int, ownerName string, createdBy int, src *models.Visit) (*models.Visit, error) {
	f.copiedVisits++
	return src, nil
}
func (f *fakeTransferRepo) MarkAccepted(ctx context.Context, id, toClinicID, acceptedBy int) error {
	f.accepted = true
	return nil
}
func (f *fakeTransferRepo) MarkRevoked(ctx context.Context, id, fromClinicID int) error {
	f.revoked = true
	return nil
}
func (f *fakeTransferRepo) List(ctx context.Context, clinicID int) ([]*models.CaseTransfer, error) {
	return []*models.CaseTransfer{f.transfer}, nil
}

type fakeOwnerRepo struct {
	owner *models.Owner
}

func (f *fakeOwnerRepo) FindOrCreate(ctx context.Context, clinicID int, name, phone, email, nationalID string) (*models.Owner, error) {
	if f.owner != nil {
		return f.owner, nil
	}
	return &models.Owner{ID: 5, ClinicID: clinicID, Name: name, Phone: phone}, nil
}

func transferFixture() (*CaseTransferService, *fakeTransferRepo, *fakeAuditRepo) {
	repo := &fakeTransferRepo{
		transfer: &models.CaseTransfer{
			ID: 1, FromClinicID: 1, PatientID: 11, VisitIDs: []int{101, 102},
			Token: "tok", Status: "pending", CreatedBy: 2,
			ExpiresAt: time.Now().Add(24 * time.Hour),
		},
		patient: &models.Patient{ID: 11, ClinicID: 1, MRN: "PT-2026-0009", Name: "Moo Daeng", Species: "Dog",
			OwnerName: "Kanya", OwnerPhone: "0812345678"},
		visits: []*models.Visit{
			{ID: 101, ClinicID: 1, PetID: 11, Type: "OPD", Purpose: "Checkup", PetName: "Moo Daeng", OwnerName: "Kanya", Status: "Draft"},
			{ID: 102, ClinicID: 1, PetID: 11, Type: "OPD", Purpose: "Vaccination", PetName: "Moo Daeng", OwnerName: "Kanya", Status: "Draft"},
		},
	}
	audit := &fakeAuditRepo{}
	svc := NewCaseTransferService(repo, &fakeOwnerRepo{}, NewAuditService(audit))
	return svc, repo, audit
}

func TestAcceptCaseTransferCopiesBundle(t *testing.T) {
	svc, repo, audit := transferFixture()

	result, err := svc.Accept(context.Background(), "tok", 2, 7)
	if err != nil {
		t.Fatalf("accept failed: %v", err)
	}
	if result.PatientID != 99 || result.VisitsCopied != 2 {
		t.Fatalf("expected new patient 99 with 2 visits, got %+v", result)
	}
	if repo.copiedPatient.OwnerID != 5 {
		t.Fatalf("copied patient should link the resolved owner, got owner %d", repo.copiedPatient.OwnerID)
	}
	if !repo.accepted {
		t.Fatal("transfer should be marked accepted")
	}
	if len(audit.actions) != 1 || audit.actions[0] != "case_transfer.accepted" {
		t.Fatalf("expected acceptance audit entry, got %v", audit.actions)
	}
}

func TestAcceptRejectsExpiredTransfer(t *testing.T) {
	svc, repo, _ := transferFixture()
	repo.transfer.ExpiresAt = time.Now().Add(-time.Hour)

	if _, err := svc.Accept(context.Background(), "tok", 2, 7); err == nil || !strings.Contains(err.Error(), "expired") {
		t.Fatalf("expected expiry rejection, got %v", err)
	}
	if repo.copiedPatient != nil {
		t.Fatal("no copies should be made for an expired transfer")
	}
}

func TestAcceptRejectsSameClinicAndNonPending(t *testing.T) {
	svc, repo, _ := transferFixture()

	if _, err := svc.Accept(context.Background(), "tok", 1, 7); err == nil {
		t.Fatal("accepting into the sending clinic must fail")
	}

	repo.transfer.Status = "accepted"
	if _, err := svc.Accept(context.Background(), "tok", 2, 7); !errors.Is(err, ErrTransferNotPending) {
		t.Fatalf("expected not-pending rejection, got %v", err)
	}
}

func TestAcceptUnknownToken(t *testing.T) {
	svc, _, _ := transferFixture()

	if _, err := svc.Accept(context.Background(), "wrong", 2, 7); !errors.Is(err, ErrTransferNotFound) {
		t.Fatalf("expected not-found, got %v", err)
	}
}

func TestCreateValidatesOwnershipAndMintsToken(t *testing.T) {
	svc, repo, audit := transferFixture()

	transfer, err := svc.Create(context.Background(), 1, 2, models.CreateCaseTransferRequest{
		PatientID: 11, VisitIDs: []int{101, 102}, Note: "second opinion",
	})
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	if len(transfer.Token) != 48 { // 24 bytes hex
		t.Fatalf("expected 48-char token, got %q", transfer.Token)
	}
	if !transfer.ExpiresAt.After(time.Now().Add(13 * 24 * time.Hour)) {
		t.Fatalf("default expiry should be ~14 days out, got %v", transfer.ExpiresAt)
	}
	if len(audit.actions) != 1 || audit.actions[0] != "case_transfer.created" {
		t.Fatalf("expected created audit entry, got %v", audit.actions)
	}

	if _, err := svc.Create(context.Background(), 1, 2, models.CreateCaseTransferRequest{
		PatientID: 11, VisitIDs: []int{999},
	}); err == nil {
		t.Fatal("visit belonging to another patient must be rejected")
	}

	if repo.transfer == nil {
		t.Fatal("expected transfer persisted")
	}
}

func TestPreviewMarksExpiredPending(t *testing.T) {
	svc, repo, _ := transferFixture()
	repo.transfer.ExpiresAt = time.Now().Add(-time.Hour)

	preview, err := svc.Preview(context.Background(), "tok")
	if err != nil {
		t.Fatalf("preview failed: %v", err)
	}
	if preview.Status != "expired" {
		t.Fatalf("expected expired preview status, got %s", preview.Status)
	}
	if preview.Patient.Name != "Moo Daeng" || len(preview.Visits) != 2 {
		t.Fatalf("preview bundle incomplete: %+v", preview)
	}
}
