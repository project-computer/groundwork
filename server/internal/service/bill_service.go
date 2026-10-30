package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/vet-clinic/api/internal/models"
)

const floatTolerance = 0.005

// BillRepo and BillPaymentRepo are the persistence seams for billing. They are
// interfaces so the settlement rules below can be tested without Postgres.
type BillRepo interface {
	Create(ctx context.Context, clinicID int, bill *models.Bill) error
	GetByID(ctx context.Context, id int) (*models.Bill, error)
	List(ctx context.Context, clinicID int, query models.BillListQuery) ([]*models.Bill, int, error)
	Update(ctx context.Context, id int, updates map[string]interface{}) error
}

type BillPaymentRepo interface {
	Create(ctx context.Context, clinicID int, p *models.BillPayment) error
	ListByBill(ctx context.Context, billID int) ([]*models.BillPayment, error)
	SumByBill(ctx context.Context, billID int) (float64, error)
}

type BillService struct {
	repo  BillRepo
	pay   BillPaymentRepo
	audit *AuditService
}

func NewBillService(repo BillRepo, pay BillPaymentRepo, audit *AuditService) *BillService {
	return &BillService{repo: repo, pay: pay, audit: audit}
}

func (s *BillService) Create(ctx context.Context, clinicID, userID int, req models.CreateBillRequest) (*models.Bill, error) {
	// Parse date
	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		return nil, errors.New("invalid date format, use YYYY-MM-DD")
	}

	// Calculate subtotal from items
	var subtotal float64
	for _, item := range req.Items {
		subtotal += float64(item.Quantity) * item.Price
	}

	// Calculate tax (10%) and total
	tax := subtotal * 0.1
	total := subtotal + tax - req.Discount

	// Marshal items to JSON
	itemsJSON, err := json.Marshal(req.Items)
	if err != nil {
		return nil, errors.New("failed to marshal bill items")
	}

	bill := &models.Bill{
		PetID:     req.PetID,
		PetName:   req.PetName,
		OwnerName: req.OwnerName,
		Date:      date,
		Items:     itemsJSON,
		Subtotal:  subtotal,
		Tax:       tax,
		Discount:  req.Discount,
		Total:     total,
		Status:    "Pending",
		CreatedBy: userID,
	}

	// Set optional fields
	if req.VisitID > 0 {
		bill.VisitID = models.NewNullInt32(int32(req.VisitID))
	}

	err = s.repo.Create(ctx, clinicID, bill)
	if err != nil {
		return nil, err
	}

	return bill, nil
}

func (s *BillService) Get(ctx context.Context, id int) (*models.Bill, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *BillService) List(ctx context.Context, clinicID int, query models.BillListQuery) ([]*models.Bill, models.PaginationMeta, error) {
	bills, total, err := s.repo.List(ctx, clinicID, query)
	if err != nil {
		return nil, models.PaginationMeta{}, err
	}

	totalPages := (total + query.Limit - 1) / query.Limit
	meta := models.PaginationMeta{
		Page:       query.Page,
		Limit:      query.Limit,
		TotalItems: total,
		TotalPages: totalPages,
	}

	return bills, meta, nil
}

func (s *BillService) Update(ctx context.Context, id int, req models.UpdateBillRequest) error {
	updates := make(map[string]interface{})

	if req.Status != "" {
		updates["status"] = req.Status
	}

	if req.PaymentMethod != "" {
		updates["payment_method"] = models.NewNullString(req.PaymentMethod)
	}

	if req.PaymentNotes != "" {
		updates["payment_notes"] = models.NewNullString(req.PaymentNotes)
	}

	if len(req.Items) > 0 {
		// Recalculate subtotal from new items
		var subtotal float64
		for _, item := range req.Items {
			subtotal += float64(item.Quantity) * item.Price
		}

		tax := subtotal * 0.1
		total := subtotal + tax - req.Discount

		itemsJSON, err := json.Marshal(req.Items)
		if err != nil {
			return errors.New("failed to marshal bill items")
		}

		updates["items"] = itemsJSON
		updates["discount"] = req.Discount
		updates["subtotal"] = subtotal
		updates["tax"] = tax
		updates["total"] = total
	}

	return s.repo.Update(ctx, id, updates)
}

// RecordPayment records a payment against a bill, enforcing tenant scope,
// overpayment protection, and settlement of the bill status. Partial payments
// mark the bill "Partial"; paying the balance marks it "Paid".
func (s *BillService) RecordPayment(ctx context.Context, clinicID, billID, userID int, req models.CreateBillPaymentRequest) (*models.BillPayment, *models.BillPaymentSummary, error) {
	if s.pay == nil {
		return nil, nil, errors.New("payments are not enabled for this service")
	}

	bill, err := s.repo.GetByID(ctx, billID)
	if err != nil {
		return nil, nil, err
	}
	if bill.ClinicID != clinicID {
		return nil, nil, errors.New("bill not found")
	}
	if bill.Status == "Void" {
		return nil, nil, errors.New("cannot record a payment on a voided bill")
	}

	paid, err := s.pay.SumByBill(ctx, billID)
	if err != nil {
		return nil, nil, err
	}
	if paid+req.Amount > bill.Total+floatTolerance {
		return nil, nil, fmt.Errorf("payment exceeds outstanding balance (%.2f remaining)", bill.Total-paid)
	}

	payment := &models.BillPayment{
		ClinicID:   clinicID,
		BillID:     billID,
		Amount:     req.Amount,
		Method:     req.Method,
		RecordedBy: userID,
	}
	if req.Reference != "" {
		payment.Reference = models.NewNullString(req.Reference)
	}
	if req.Notes != "" {
		payment.Notes = models.NewNullString(req.Notes)
	}

	if err := s.pay.Create(ctx, clinicID, payment); err != nil {
		return nil, nil, err
	}

	newPaid := paid + req.Amount
	status := "Partial"
	method := req.Method
	if newPaid >= bill.Total-floatTolerance {
		status = "Paid"
	}
	if err := s.repo.Update(ctx, billID, map[string]interface{}{
		"status":         status,
		"payment_method": models.NewNullString(method),
	}); err != nil {
		return nil, nil, err
	}

	s.audit.Record(ctx, clinicID, userID, "bill.payment_recorded", "bill", billID, map[string]interface{}{
		"amount":     req.Amount,
		"method":     req.Method,
		"amountPaid": newPaid,
		"status":     status,
	})

	return payment, &models.BillPaymentSummary{
		BillID:     billID,
		Total:      bill.Total,
		AmountPaid: newPaid,
		Balance:    bill.Total - newPaid,
		Status:     status,
	}, nil
}

// ListPayments returns the payment history for a bill plus the balance summary.
func (s *BillService) ListPayments(ctx context.Context, clinicID, billID int) ([]*models.BillPayment, *models.BillPaymentSummary, error) {
	if s.pay == nil {
		return nil, nil, errors.New("payments are not enabled for this service")
	}

	bill, err := s.repo.GetByID(ctx, billID)
	if err != nil {
		return nil, nil, err
	}
	if bill.ClinicID != clinicID {
		return nil, nil, errors.New("bill not found")
	}

	payments, err := s.pay.ListByBill(ctx, billID)
	if err != nil {
		return nil, nil, err
	}

	var paid float64
	for _, p := range payments {
		paid += p.Amount
	}
	return payments, &models.BillPaymentSummary{
		BillID:     billID,
		Total:      bill.Total,
		AmountPaid: paid,
		Balance:    bill.Total - paid,
		Status:     bill.Status,
	}, nil
}

// Void voids a bill. Bills with recorded payments cannot be voided — refunds
// must be handled explicitly first, so money movement always stays auditable.
func (s *BillService) Void(ctx context.Context, clinicID, billID, userID int) error {
	bill, err := s.repo.GetByID(ctx, billID)
	if err != nil {
		return err
	}
	if bill.ClinicID != clinicID {
		return errors.New("bill not found")
	}
	if bill.Status == "Void" {
		return errors.New("bill is already voided")
	}

	paid, err := s.pay.SumByBill(ctx, billID)
	if err != nil {
		return err
	}
	if paid > 0 {
		return errors.New("cannot void a bill with recorded payments; refund first")
	}

	if err := s.repo.Update(ctx, billID, map[string]interface{}{"status": "Void"}); err != nil {
		return err
	}

	s.audit.Record(ctx, clinicID, userID, "bill.voided", "bill", billID, map[string]interface{}{
		"customId": bill.CustomID,
		"total":    bill.Total,
	})
	return nil
}
