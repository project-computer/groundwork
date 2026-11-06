package service

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/project-computer/groundwork/server/internal/models"
)

type fakeBillRepo struct {
	bill    *models.Bill
	updates map[string]interface{}
}

func (f *fakeBillRepo) Create(ctx context.Context, clinicID int, bill *models.Bill) error { return nil }
func (f *fakeBillRepo) GetByID(ctx context.Context, id int) (*models.Bill, error) {
	if f.bill == nil || f.bill.ID != id {
		return nil, errors.New("bill not found")
	}
	return f.bill, nil
}
func (f *fakeBillRepo) List(ctx context.Context, clinicID int, query models.BillListQuery) ([]*models.Bill, int, error) {
	return nil, 0, nil
}
func (f *fakeBillRepo) Update(ctx context.Context, id int, updates map[string]interface{}) error {
	f.updates = updates
	for k, v := range updates {
		if k == "status" {
			f.bill.Status = v.(string)
		}
	}
	return nil
}

type fakePaymentRepo struct {
	sum     float64
	created []*models.BillPayment
}

func (f *fakePaymentRepo) Create(ctx context.Context, clinicID int, p *models.BillPayment) error {
	f.created = append(f.created, p)
	f.sum += p.Amount
	return nil
}
func (f *fakePaymentRepo) ListByBill(ctx context.Context, billID int) ([]*models.BillPayment, error) {
	return f.created, nil
}
func (f *fakePaymentRepo) SumByBill(ctx context.Context, billID int) (float64, error) {
	return f.sum, nil
}

type fakeAuditRepo struct {
	actions []string
}

func (f *fakeAuditRepo) Insert(ctx context.Context, clinicID, userID int, action, entityType string, entityID int, newValues json.RawMessage) error {
	f.actions = append(f.actions, action)
	return nil
}

func newTestBill() *models.Bill {
	return &models.Bill{ID: 7, ClinicID: 1, Total: 100, Status: "Pending"}
}

func TestRecordPaymentPartialThenPaid(t *testing.T) {
	billRepo := &fakeBillRepo{bill: newTestBill()}
	payRepo := &fakePaymentRepo{}
	auditRepo := &fakeAuditRepo{}
	svc := NewBillService(billRepo, payRepo, NewAuditService(auditRepo))

	_, summary, err := svc.RecordPayment(context.Background(), 1, 7, 3, models.CreateBillPaymentRequest{Amount: 40, Method: "cash"})
	if err != nil {
		t.Fatalf("partial payment failed: %v", err)
	}
	if summary.Status != "Partial" || summary.Balance < 59.99 || summary.Balance > 60.01 {
		t.Fatalf("expected Partial with balance 60, got %+v", summary)
	}

	_, summary, err = svc.RecordPayment(context.Background(), 1, 7, 3, models.CreateBillPaymentRequest{Amount: 60, Method: "transfer"})
	if err != nil {
		t.Fatalf("settling payment failed: %v", err)
	}
	if summary.Status != "Paid" || summary.AmountPaid != 100 {
		t.Fatalf("expected Paid with 100 paid, got %+v", summary)
	}
	if billRepo.updates["status"] != "Paid" {
		t.Fatalf("bill status should be updated to Paid, got %v", billRepo.updates["status"])
	}
	if len(auditRepo.actions) != 2 || auditRepo.actions[0] != "bill.payment_recorded" {
		t.Fatalf("expected two payment audit entries, got %v", auditRepo.actions)
	}
}

func TestRecordPaymentOverpayRejected(t *testing.T) {
	billRepo := &fakeBillRepo{bill: newTestBill()}
	payRepo := &fakePaymentRepo{sum: 80}
	svc := NewBillService(billRepo, payRepo, NewAuditService(&fakeAuditRepo{}))

	if _, _, err := svc.RecordPayment(context.Background(), 1, 7, 3, models.CreateBillPaymentRequest{Amount: 30, Method: "cash"}); err == nil {
		t.Fatal("expected overpayment to be rejected")
	}
}

func TestRecordPaymentWrongClinic(t *testing.T) {
	billRepo := &fakeBillRepo{bill: newTestBill()}
	svc := NewBillService(billRepo, &fakePaymentRepo{}, NewAuditService(&fakeAuditRepo{}))

	if _, _, err := svc.RecordPayment(context.Background(), 2, 7, 3, models.CreateBillPaymentRequest{Amount: 10, Method: "cash"}); err == nil {
		t.Fatal("expected cross-tenant payment to be rejected")
	}
}

func TestVoidBlockedWhenPaymentsExist(t *testing.T) {
	billRepo := &fakeBillRepo{bill: newTestBill()}
	payRepo := &fakePaymentRepo{sum: 25}
	svc := NewBillService(billRepo, payRepo, NewAuditService(&fakeAuditRepo{}))

	if err := svc.Void(context.Background(), 1, 7, 3); err == nil {
		t.Fatal("expected void to be blocked when payments exist")
	}

	payRepo.sum = 0
	if err := svc.Void(context.Background(), 1, 7, 3); err != nil {
		t.Fatalf("clean void failed: %v", err)
	}
	if billRepo.bill.Status != "Void" {
		t.Fatalf("expected bill status Void, got %s", billRepo.bill.Status)
	}
}
