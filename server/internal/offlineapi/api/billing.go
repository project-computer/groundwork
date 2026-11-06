package api

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/project-computer/groundwork/server/internal/offlineapi/auth"
	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

// Billing (plan BILL-01…10). Money is integer satang end to end; totals are
// recomputed server-side from line items — the client's numbers are never
// trusted. Every payment and correction commits with its audit event.

type serviceRequest struct {
	Name     string `json:"name"`
	Category string `json:"category"`
	Unit     string `json:"unit"`
	// Price in satang (plan: 100.00 THB = 10000).
	UnitPriceSatang int64 `json:"unitPriceSatang"`
}

type updateServiceRequest struct {
	Name            *string `json:"name"`
	Category        *string `json:"category"`
	Unit            *string `json:"unit"`
	UnitPriceSatang *int64  `json:"unitPriceSatang"`
	Active          *bool   `json:"active"`
}

type invoiceItemRequest struct {
	ServiceID       string `json:"serviceId"`
	Description     string `json:"description"`
	Quantity        int64  `json:"quantity"`
	UnitPriceSatang int64  `json:"unitPriceSatang"`
	DiscountSatang  int64  `json:"discountSatang"`
}

type createInvoiceRequest struct {
	OwnerID        string               `json:"ownerId"`
	PetID          string               `json:"petId"`
	ConsultationID string               `json:"consultationId"`
	DiscountSatang int64                `json:"discountSatang"`
	TaxSatang      int64                `json:"taxSatang"`
	Notes          string               `json:"notes"`
	Items          []invoiceItemRequest `json:"items"`
}

type paymentRequest struct {
	InvoiceID    string `json:"invoiceId"`
	AmountSatang int64  `json:"amountSatang"`
	Method       string `json:"method"`
	Reference    string `json:"reference"`
}

type serviceDTO struct {
	ID              string `json:"id"`
	ClinicID        string `json:"clinicId"`
	Name            string `json:"name"`
	Category        string `json:"category"`
	Unit            string `json:"unit"`
	UnitPriceSatang int64  `json:"unitPriceSatang"`
	IsActive        bool   `json:"isActive"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

func serviceFrom(row db.Service) serviceDTO {
	return serviceDTO{
		ID: row.ID, ClinicID: row.ClinicID, Name: row.Name,
		Category: row.Category, Unit: row.Unit,
		UnitPriceSatang: row.UnitPriceSatang, IsActive: row.IsActive == 1,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

type invoiceItemDTO struct {
	ID              string `json:"id"`
	ServiceID       string `json:"serviceId,omitempty"`
	Description     string `json:"description"`
	Quantity        int64  `json:"quantity"`
	UnitPriceSatang int64  `json:"unitPriceSatang"`
	DiscountSatang  int64  `json:"discountSatang"`
	LineTotalSatang int64  `json:"lineTotalSatang"`
}

func invoiceItemFrom(row db.InvoiceItem) invoiceItemDTO {
	return invoiceItemDTO{
		ID: row.ID, ServiceID: nullString(row.ServiceID),
		Description: row.Description, Quantity: row.Quantity,
		UnitPriceSatang: row.UnitPriceSatang, DiscountSatang: row.DiscountSatang,
		LineTotalSatang: row.LineTotalSatang,
	}
}

type paymentDTO struct {
	ID           string `json:"id"`
	InvoiceID    string `json:"invoiceId"`
	AmountSatang int64  `json:"amountSatang"`
	Method       string `json:"method"`
	Reference    string `json:"reference"`
	Status       string `json:"status"`
	ReceivedAt   string `json:"receivedAt"`
}

func paymentFrom(row db.Payment) paymentDTO {
	return paymentDTO{
		ID: row.ID, InvoiceID: row.InvoiceID, AmountSatang: row.AmountSatang,
		Method: row.Method, Reference: row.Reference, Status: row.Status,
		ReceivedAt: row.ReceivedAt,
	}
}

type invoiceDTO struct {
	ID             string           `json:"id"`
	ClinicID       string           `json:"clinicId"`
	OwnerID        string           `json:"ownerId"`
	PetID          string           `json:"petId,omitempty"`
	ConsultationID string           `json:"consultationId,omitempty"`
	InvoiceNumber  string           `json:"invoiceNumber"`
	Status         string           `json:"status"`
	SubtotalSatang int64            `json:"subtotalSatang"`
	DiscountSatang int64            `json:"discountSatang"`
	TaxSatang      int64            `json:"taxSatang"`
	TotalSatang    int64            `json:"totalSatang"`
	PaidSatang     int64            `json:"paidSatang"`
	BalanceSatang  int64            `json:"balanceSatang"`
	Notes          string           `json:"notes"`
	IssuedAt       string           `json:"issuedAt"`
	Items          []invoiceItemDTO `json:"items"`
	Payments       []paymentDTO     `json:"payments"`
}

func invoiceFrom(row db.Invoice, items []db.InvoiceItem, payments []db.Payment, paid int64) invoiceDTO {
	out := invoiceDTO{
		ID: row.ID, ClinicID: row.ClinicID, OwnerID: row.OwnerID,
		PetID: nullString(row.PetID), ConsultationID: nullString(row.ConsultationID),
		InvoiceNumber: row.InvoiceNumber, Status: row.Status,
		SubtotalSatang: row.SubtotalSatang, DiscountSatang: row.DiscountSatang,
		TaxSatang: row.TaxSatang, TotalSatang: row.TotalSatang,
		PaidSatang: paid, BalanceSatang: row.TotalSatang - paid,
		Notes: row.Notes, IssuedAt: row.IssuedAt,
		Items:    make([]invoiceItemDTO, 0, len(items)),
		Payments: make([]paymentDTO, 0, len(payments)),
	}
	for _, item := range items {
		out.Items = append(out.Items, invoiceItemFrom(item))
	}
	for _, payment := range payments {
		out.Payments = append(out.Payments, paymentFrom(payment))
	}
	return out
}

func validServiceCategory(category string) bool {
	return category == "" || category == "service" || category == "product"
}

func validPaymentMethod(method string) bool {
	switch method {
	case "", "cash", "transfer", "other":
		return true
	default:
		return false
	}
}

// invoiceNumber allocates the next sequential number within the clinic for
// the current year (plan: unique + sequential). Counted inside the caller's
// transaction so two invoices can never claim one number.
func invoiceNumber(ctx context.Context, q *db.Queries, clinicID string) (string, error) {
	prefix := fmt.Sprintf("INV-%s-", time.Now().UTC().Format("2006"))
	count, err := q.CountInvoicesWithPrefix(ctx, db.CountInvoicesWithPrefixParams{
		ClinicID: clinicID, Prefix: sql.NullString{String: prefix, Valid: true},
	})
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s%04d", prefix, count+1), nil
}

func (s *Server) handleListServices(w http.ResponseWriter, r *http.Request, p *principal) {
	page := pagination(r)
	rows, err := s.q.ListServices(r.Context(), db.ListServicesParams{
		ClinicID: p.ClinicID, Search: searchTerm(r),
		Category: strings.TrimSpace(r.URL.Query().Get("category")),
		Limit:    page.Limit, Offset: page.Offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list services")
		return
	}
	out := make([]serviceDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, serviceFrom(row))
	}
	writeJSON(w, http.StatusOK, map[string]any{"services": out})
}

func (s *Server) handleCreateService(w http.ResponseWriter, r *http.Request, p *principal) {
	var req serviceRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if msg := required(req.Name, "name"); msg != "" {
		writeError(w, http.StatusBadRequest, "validation_error", msg)
		return
	}
	if !validServiceCategory(req.Category) {
		writeError(w, http.StatusBadRequest, "validation_error", "category must be service or product")
		return
	}
	if req.UnitPriceSatang < 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "unitPriceSatang cannot be negative")
		return
	}
	now := db.UtcNow()
	row, err := s.q.CreateService(r.Context(), db.CreateServiceParams{
		ID: uuid.NewString(), ClinicID: p.ClinicID, Name: req.Name,
		Category: defaultServiceCategory(req.Category), Unit: defaultServiceUnit(req.Unit),
		UnitPriceSatang: req.UnitPriceSatang, IsActive: 1,
		CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create service")
		return
	}
	writeJSON(w, http.StatusCreated, serviceFrom(row))
}

func (s *Server) handleUpdateService(w http.ResponseWriter, r *http.Request, p *principal) {
	var req updateServiceRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	current, err := s.q.GetService(r.Context(), db.GetServiceParams{
		ClinicID: p.ClinicID, ID: r.PathValue("id"),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "service not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load service")
		return
	}
	name := strings.TrimSpace(valueOr(req.Name, current.Name))
	if name == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "name cannot be empty")
		return
	}
	price := current.UnitPriceSatang
	if req.UnitPriceSatang != nil {
		if *req.UnitPriceSatang < 0 {
			writeError(w, http.StatusBadRequest, "validation_error", "unitPriceSatang cannot be negative")
			return
		}
		price = *req.UnitPriceSatang
	}
	category := current.Category
	if req.Category != nil {
		if !validServiceCategory(*req.Category) {
			writeError(w, http.StatusBadRequest, "validation_error", "category must be service or product")
			return
		}
		category = *req.Category
	}
	active := current.IsActive
	if req.Active != nil {
		if *req.Active {
			active = 1
		} else {
			active = 0
		}
	}
	row, err := s.q.UpdateService(r.Context(), db.UpdateServiceParams{
		Name: name, Category: category, Unit: defaultServiceUnit(valueOr(req.Unit, current.Unit)),
		UnitPriceSatang: price, IsActive: active, UpdatedAt: db.UtcNow(),
		ClinicID: p.ClinicID, ID: current.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not update service")
		return
	}
	writeJSON(w, http.StatusOK, serviceFrom(row))
}

func defaultServiceCategory(category string) string {
	if category == "" {
		return "service"
	}
	return category
}

func defaultServiceUnit(unit string) string {
	if strings.TrimSpace(unit) == "" {
		return "unit"
	}
	return strings.TrimSpace(unit)
}

func (s *Server) handleListInvoices(w http.ResponseWriter, r *http.Request, p *principal) {
	page := pagination(r)
	rows, err := s.q.ListInvoices(r.Context(), db.ListInvoicesParams{
		ClinicID: p.ClinicID,
		OwnerID:  strings.TrimSpace(r.URL.Query().Get("ownerId")),
		PetID:    strings.TrimSpace(r.URL.Query().Get("petId")),
		Status:   strings.TrimSpace(r.URL.Query().Get("status")),
		FromAt:   strings.TrimSpace(r.URL.Query().Get("from")),
		ToAt:     strings.TrimSpace(r.URL.Query().Get("to")),
		Limit:    page.Limit, Offset: page.Offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list invoices")
		return
	}
	out := make([]invoiceDTO, 0, len(rows))
	for _, row := range rows {
		paid, _ := s.q.SumPaidByInvoice(r.Context(), db.SumPaidByInvoiceParams{
			ClinicID: p.ClinicID, InvoiceID: row.ID,
		})
		out = append(out, invoiceFrom(row, nil, nil, paid))
	}
	writeJSON(w, http.StatusOK, map[string]any{"invoices": out})
}

func (s *Server) handleCreateInvoice(w http.ResponseWriter, r *http.Request, p *principal) {
	var req createInvoiceRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if msg := required(req.OwnerID, "ownerId"); msg != "" {
		writeError(w, http.StatusBadRequest, "validation_error", msg)
		return
	}
	if len(req.Items) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "at least one invoice item is required")
		return
	}
	if _, err := s.q.GetOwner(r.Context(), db.GetOwnerParams{
		ClinicID: p.ClinicID, ID: req.OwnerID,
	}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusBadRequest, "validation_error", "ownerId does not reference an owner")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not verify owner")
		return
	}

	var subtotal int64
	for _, item := range req.Items {
		if strings.TrimSpace(item.Description) == "" && strings.TrimSpace(item.ServiceID) == "" {
			writeError(w, http.StatusBadRequest, "validation_error", "each item needs a description or serviceId")
			return
		}
		if item.Quantity <= 0 {
			writeError(w, http.StatusBadRequest, "validation_error", "quantity must be greater than zero")
			return
		}
		if item.UnitPriceSatang < 0 || item.DiscountSatang < 0 {
			writeError(w, http.StatusBadRequest, "validation_error", "amounts cannot be negative")
			return
		}
		line := item.Quantity*item.UnitPriceSatang - item.DiscountSatang
		if line < 0 {
			writeError(w, http.StatusBadRequest, "validation_error", "line discount cannot exceed the line total")
			return
		}
		subtotal += line
	}
	if req.DiscountSatang < 0 || req.DiscountSatang > subtotal {
		writeError(w, http.StatusBadRequest, "validation_error", "discount cannot be negative or exceed the subtotal")
		return
	}
	if req.TaxSatang < 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "tax cannot be negative")
		return
	}
	total := subtotal - req.DiscountSatang + req.TaxSatang

	now := db.UtcNow()
	tx, err := s.sqlDB.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not start invoicing")
		return
	}
	defer tx.Rollback()
	qtx := db.New(tx)

	number, err := invoiceNumber(r.Context(), qtx, p.ClinicID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not allocate invoice number")
		return
	}
	invoice, err := qtx.CreateInvoice(r.Context(), db.CreateInvoiceParams{
		ID: uuid.NewString(), ClinicID: p.ClinicID, OwnerID: req.OwnerID,
		PetID: optionalRef(req.PetID), ConsultationID: optionalRef(req.ConsultationID),
		InvoiceNumber: number, Status: "unpaid",
		SubtotalSatang: subtotal, DiscountSatang: req.DiscountSatang,
		TaxSatang: req.TaxSatang, TotalSatang: total, Notes: req.Notes,
		IssuedAt: now, CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create invoice")
		return
	}
	for _, item := range req.Items {
		var serviceID sql.NullString
		if strings.TrimSpace(item.ServiceID) != "" {
			if _, err := qtx.GetService(r.Context(), db.GetServiceParams{
				ClinicID: p.ClinicID, ID: item.ServiceID,
			}); err != nil {
				writeError(w, http.StatusBadRequest, "validation_error", "serviceId does not reference a service")
				return
			}
			serviceID = sql.NullString{String: item.ServiceID, Valid: true}
		}
		if _, err := qtx.CreateInvoiceItem(r.Context(), db.CreateInvoiceItemParams{
			ID: uuid.NewString(), ClinicID: p.ClinicID, InvoiceID: invoice.ID,
			ServiceID:   serviceID,
			Description: strings.TrimSpace(item.Description), Quantity: item.Quantity,
			UnitPriceSatang: item.UnitPriceSatang, DiscountSatang: item.DiscountSatang,
			LineTotalSatang: item.Quantity*item.UnitPriceSatang - item.DiscountSatang,
			CreatedAt:       now,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not save invoice item")
			return
		}
	}
	if err := s.appendAudit(r.Context(), qtx, p, "invoice.issued", "invoice",
		invoice.ID, fmt.Sprintf("issued %s (%d satang)", number, total),
		map[string]any{"invoiceNumber": number, "totalSatang": total, "items": len(req.Items)},
	); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not audit invoice")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not commit invoice")
		return
	}
	s.writeInvoice(w, r, p, http.StatusCreated, invoice.ID)
}

func (s *Server) handleGetInvoice(w http.ResponseWriter, r *http.Request, p *principal) {
	s.writeInvoice(w, r, p, http.StatusOK, r.PathValue("id"))
}

// writeInvoice renders the full invoice aggregate: header, items, payments
// and the recomputed paid/balance pair.
func (s *Server) writeInvoice(w http.ResponseWriter, r *http.Request, p *principal, status int, id string) {
	row, err := s.q.GetInvoice(r.Context(), db.GetInvoiceParams{ClinicID: p.ClinicID, ID: id})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "invoice not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load invoice")
		return
	}
	items, err := s.q.ListInvoiceItems(r.Context(), db.ListInvoiceItemsParams{
		ClinicID: p.ClinicID, InvoiceID: row.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load invoice items")
		return
	}
	payments, err := s.q.ListPaymentsByInvoice(r.Context(), db.ListPaymentsByInvoiceParams{
		ClinicID: p.ClinicID, InvoiceID: row.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load payments")
		return
	}
	paid, err := s.q.SumPaidByInvoice(r.Context(), db.SumPaidByInvoiceParams{
		ClinicID: p.ClinicID, InvoiceID: row.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not total payments")
		return
	}
	writeJSON(w, status, invoiceFrom(row, items, payments, paid))
}

// optionalRef wraps an optional foreign reference for sqlc nullable params.
// An empty string means "absent"; a non-empty value is verified by the
// caller's flow before reaching this point or by the schema's FK.
func optionalRef(id string) sql.NullString {
	id = strings.TrimSpace(id)
	if id == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: id, Valid: true}
}

func (s *Server) handleCreatePayment(w http.ResponseWriter, r *http.Request, p *principal) {
	var req paymentRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if msg := required(req.InvoiceID, "invoiceId"); msg != "" {
		writeError(w, http.StatusBadRequest, "validation_error", msg)
		return
	}
	if req.AmountSatang <= 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "amountSatang must be greater than zero")
		return
	}
	if !validPaymentMethod(req.Method) {
		writeError(w, http.StatusBadRequest, "validation_error", "method must be cash, transfer or other")
		return
	}

	now := db.UtcNow()
	tx, err := s.sqlDB.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not start payment")
		return
	}
	defer tx.Rollback()
	qtx := db.New(tx)

	invoice, err := qtx.GetInvoice(r.Context(), db.GetInvoiceParams{
		ClinicID: p.ClinicID, ID: req.InvoiceID,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "invoice not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load invoice")
		return
	}
	if invoice.Status == "void" {
		writeError(w, http.StatusConflict, "conflict", "cannot pay a void invoice")
		return
	}
	paid, err := qtx.SumPaidByInvoice(r.Context(), db.SumPaidByInvoiceParams{
		ClinicID: p.ClinicID, InvoiceID: invoice.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not total payments")
		return
	}
	balance := invoice.TotalSatang - paid
	if req.AmountSatang > balance {
		writeError(w, http.StatusConflict, "conflict",
			fmt.Sprintf("amount exceeds the outstanding balance (%d satang)", balance))
		return
	}

	payment, err := qtx.CreatePayment(r.Context(), db.CreatePaymentParams{
		ID: uuid.NewString(), ClinicID: p.ClinicID, InvoiceID: invoice.ID,
		AmountSatang: req.AmountSatang, Method: defaultPaymentMethod(req.Method),
		Reference: req.Reference, Status: "paid", ReceivedAt: now, CreatedAt: now,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not record payment")
		return
	}
	if _, err := qtx.CreatePaymentAllocation(r.Context(), db.CreatePaymentAllocationParams{
		ID: uuid.NewString(), ClinicID: p.ClinicID, PaymentID: payment.ID,
		InvoiceID: invoice.ID, AmountSatang: req.AmountSatang, CreatedAt: now,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not allocate payment")
		return
	}
	if err := s.recomputeInvoiceStatus(r.Context(), qtx, p, invoice); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not update invoice status")
		return
	}
	if err := s.appendAudit(r.Context(), qtx, p, "payment.recorded", "invoice",
		invoice.ID, fmt.Sprintf("payment %d satang on %s", req.AmountSatang, invoice.InvoiceNumber),
		map[string]any{"paymentId": payment.ID, "amountSatang": req.AmountSatang,
			"method": payment.Method},
	); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not audit payment")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not commit payment")
		return
	}
	writeJSON(w, http.StatusCreated, paymentFrom(payment))
}

func defaultPaymentMethod(method string) string {
	if method == "" {
		return "cash"
	}
	return method
}

// recomputeInvoiceStatus derives unpaid/partial/paid from the payments ledger.
// It never touches a void invoice — voids are terminal (plan BILL-07/10).
func (s *Server) recomputeInvoiceStatus(
	ctx context.Context, q *db.Queries, p *principal, invoice db.Invoice,
) error {
	if invoice.Status == "void" {
		return nil
	}
	paid, err := q.SumPaidByInvoice(ctx, db.SumPaidByInvoiceParams{
		ClinicID: p.ClinicID, InvoiceID: invoice.ID,
	})
	if err != nil {
		return err
	}
	status := "unpaid"
	switch {
	case paid >= invoice.TotalSatang:
		status = "paid"
	case paid > 0:
		status = "partial"
	}
	if status == invoice.Status {
		return nil
	}
	return q.UpdateInvoiceStatus(ctx, db.UpdateInvoiceStatusParams{
		Status: status, UpdatedAt: db.UtcNow(), ClinicID: p.ClinicID, ID: invoice.ID,
	})
}

// handleVoidPayment is the authorized, auditable financial correction
// (plan BILL-10): the payment row keeps its history, only its status flips,
// and the invoice status is recomputed from the remaining ledger.
func (s *Server) handleVoidPayment(w http.ResponseWriter, r *http.Request, p *principal) {
	tx, err := s.sqlDB.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not start correction")
		return
	}
	defer tx.Rollback()
	qtx := db.New(tx)

	payment, err := qtx.GetPayment(r.Context(), db.GetPaymentParams{
		ClinicID: p.ClinicID, ID: r.PathValue("id"),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "payment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load payment")
		return
	}
	if payment.Status != "paid" {
		writeError(w, http.StatusConflict, "conflict", "only a paid payment can be voided")
		return
	}
	invoice, err := qtx.GetInvoice(r.Context(), db.GetInvoiceParams{
		ClinicID: p.ClinicID, ID: payment.InvoiceID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load invoice")
		return
	}
	if err := qtx.VoidPayment(r.Context(), db.VoidPaymentParams{
		Status: "void", ClinicID: p.ClinicID, ID: payment.ID,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not void payment")
		return
	}
	if err := s.recomputeInvoiceStatus(r.Context(), qtx, p, invoice); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not update invoice status")
		return
	}
	if err := s.appendAudit(r.Context(), qtx, p, "payment.voided", "invoice",
		invoice.ID, fmt.Sprintf("voided payment of %d satang on %s",
			payment.AmountSatang, invoice.InvoiceNumber),
		map[string]any{"paymentId": payment.ID, "amountSatang": payment.AmountSatang},
	); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not audit correction")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not commit correction")
		return
	}
	updated, err := s.q.GetPayment(r.Context(), db.GetPaymentParams{
		ClinicID: p.ClinicID, ID: payment.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load payment")
		return
	}
	writeJSON(w, http.StatusOK, paymentFrom(updated))
}

// handleVoidInvoice is the admin-only invoice correction. An invoice with
// collected money must have its payments corrected first — voiding never
// silently erases money (plan BILL-10).
func (s *Server) handleVoidInvoice(w http.ResponseWriter, r *http.Request, p *principal) {
	if !auth.HasAnyRole(p.Roles, auth.RoleAdmin) {
		writeError(w, http.StatusForbidden, "forbidden", "only an admin can void an invoice")
		return
	}
	tx, err := s.sqlDB.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not start correction")
		return
	}
	defer tx.Rollback()
	qtx := db.New(tx)

	invoice, err := qtx.GetInvoice(r.Context(), db.GetInvoiceParams{
		ClinicID: p.ClinicID, ID: r.PathValue("id"),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "invoice not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load invoice")
		return
	}
	if invoice.Status == "void" {
		writeJSON(w, http.StatusOK, map[string]any{"void": true})
		return
	}
	paid, err := qtx.SumPaidByInvoice(r.Context(), db.SumPaidByInvoiceParams{
		ClinicID: p.ClinicID, InvoiceID: invoice.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not total payments")
		return
	}
	if paid > 0 {
		writeError(w, http.StatusConflict, "conflict",
			"void or refund the payments before voiding this invoice")
		return
	}
	if err := qtx.UpdateInvoiceStatus(r.Context(), db.UpdateInvoiceStatusParams{
		Status: "void", UpdatedAt: db.UtcNow(), ClinicID: p.ClinicID, ID: invoice.ID,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not void invoice")
		return
	}
	if err := s.appendAudit(r.Context(), qtx, p, "invoice.voided", "invoice",
		invoice.ID, fmt.Sprintf("voided %s (%d satang)", invoice.InvoiceNumber, invoice.TotalSatang),
		map[string]any{"invoiceNumber": invoice.InvoiceNumber, "totalSatang": invoice.TotalSatang},
	); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not audit correction")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not commit correction")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"void": true})
}
