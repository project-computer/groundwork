package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/repository"
)

type BillService struct {
	repo *repository.BillRepository
}

func NewBillService(repo *repository.BillRepository) *BillService {
	return &BillService{repo: repo}
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
		bill.VisitID = sql.NullInt32{Int32: int32(req.VisitID), Valid: true}
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
		updates["status"] = sql.NullString{String: req.Status, Valid: true}
	}

	if req.PaymentMethod != "" {
		updates["payment_method"] = sql.NullString{String: req.PaymentMethod, Valid: true}
	}

	if req.PaymentNotes != "" {
		updates["payment_notes"] = sql.NullString{String: req.PaymentNotes, Valid: true}
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
