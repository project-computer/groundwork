package service

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/repository"
)

type fakeSupplierRepo struct {
	created *models.Supplier
	err     error
}

func (f *fakeSupplierRepo) Create(_ context.Context, clinicID int, s *models.Supplier) error {
	if f.err != nil {
		return f.err
	}
	s.ID = 9
	s.ClinicID = clinicID
	f.created = s
	return nil
}

func (f *fakeSupplierRepo) GetByID(_ context.Context, _, id int) (*models.Supplier, error) {
	if f.created != nil && f.created.ID == id {
		return f.created, nil
	}
	return nil, errors.New("not found")
}

func (f *fakeSupplierRepo) List(_ context.Context, _ int) ([]*models.Supplier, error) {
	if f.created != nil {
		return []*models.Supplier{f.created}, nil
	}
	return nil, nil
}

func (f *fakeSupplierRepo) Update(_ context.Context, _, _ int, req *models.UpdateSupplierRequest) (*models.Supplier, error) {
	if f.created != nil && req.Name != "" {
		f.created.Name = req.Name
	}
	return f.created, nil
}

func (f *fakeSupplierRepo) Delete(_ context.Context, _, _ int) error { return f.err }

type fakeItemRepo struct {
	created *models.InventoryItem
	err     error
}

func (f *fakeItemRepo) Create(_ context.Context, clinicID int, it *models.InventoryItem) error {
	if f.err != nil {
		return f.err
	}
	it.ID = 5
	it.ClinicID = clinicID
	f.created = it
	return nil
}

func (f *fakeItemRepo) GetByID(_ context.Context, _, id int) (*models.InventoryItem, error) {
	if f.created != nil && f.created.ID == id {
		return f.created, nil
	}
	return nil, errors.New("not found")
}

func (f *fakeItemRepo) List(_ context.Context, _ int, _ models.InventoryItemListQuery) ([]*models.InventoryItem, int, error) {
	if f.created != nil {
		return []*models.InventoryItem{f.created}, 1, nil
	}
	return nil, 0, nil
}

func (f *fakeItemRepo) Update(_ context.Context, _, _ int, _ *models.UpdateInventoryItemRequest) (*models.InventoryItem, error) {
	return f.created, nil
}

func (f *fakeItemRepo) Delete(_ context.Context, _, _ int) error { return f.err }

type fakeLotRepo struct {
	lots      map[int]*models.InventoryLot
	movements []*models.StockMovement
	nextID    int
	err       error
}

func newFakeLotRepo() *fakeLotRepo {
	return &fakeLotRepo{lots: map[int]*models.InventoryLot{}, nextID: 100}
}

func (f *fakeLotRepo) Create(_ context.Context, clinicID int, l *models.InventoryLot) error {
	if f.err != nil {
		return f.err
	}
	f.nextID++
	l.ID = f.nextID
	l.ClinicID = clinicID
	f.lots[l.ID] = l
	return nil
}

func (f *fakeLotRepo) GetByID(_ context.Context, _, id int) (*models.InventoryLot, error) {
	if l, ok := f.lots[id]; ok {
		return l, nil
	}
	return nil, repository.ErrLotNotFound
}

func (f *fakeLotRepo) ListByItem(_ context.Context, _, itemID int) ([]*models.InventoryLot, error) {
	var out []*models.InventoryLot
	for _, l := range f.lots {
		if l.ItemID == itemID {
			out = append(out, l)
		}
	}
	return out, nil
}

func (f *fakeLotRepo) Update(_ context.Context, _, id int, _ *models.UpdateInventoryLotRequest) (*models.InventoryLot, error) {
	return f.GetByID(nil, 0, id)
}

// RecordMovement mirrors the real transactional repo: ledger row + cached quantity
// update, with the negative-stock check surfacing ErrInsufficientStock.
func (f *fakeLotRepo) RecordMovement(_ context.Context, clinicID, lotID, userID int, req *models.CreateStockMovementRequest) (*models.StockMovement, error) {
	if f.err != nil {
		return nil, f.err
	}
	lot, ok := f.lots[lotID]
	if !ok {
		return nil, repository.ErrLotNotFound
	}
	if lot.Quantity+req.Delta < 0 {
		return nil, repository.ErrInsufficientStock
	}
	lot.Quantity += req.Delta
	mv := &models.StockMovement{
		ID: len(f.movements) + 1, ClinicID: clinicID, LotID: lotID,
		ItemID: lot.ItemID, Delta: req.Delta, Reason: req.Reason, UserID: userID,
	}
	f.movements = append(f.movements, mv)
	return mv, nil
}

func (f *fakeLotRepo) ListMovementsByLot(_ context.Context, _, lotID int) ([]*models.StockMovement, error) {
	var out []*models.StockMovement
	for _, m := range f.movements {
		if m.LotID == lotID {
			out = append(out, m)
		}
	}
	return out, nil
}

func TestSupplierServiceCreate(t *testing.T) {
	repo := &fakeSupplierRepo{}
	svc := NewSupplierService(repo)

	sup, err := svc.Create(context.Background(), 1, models.CreateSupplierRequest{Name: "Acme Vet Supply", Phone: "02-123"})
	assert.NoError(t, err)
	assert.Equal(t, "Acme Vet Supply", sup.Name)
	assert.True(t, sup.Phone.Valid)
	assert.Equal(t, 1, sup.ClinicID)

	_, err = svc.Create(context.Background(), 1, models.CreateSupplierRequest{Name: "  "})
	assert.Error(t, err)
}

func TestItemServiceCreateLotWritesInitialStockIn(t *testing.T) {
	items := &fakeItemRepo{created: &models.InventoryItem{ID: 5, Name: "Amoxicillin 250mg", Category: "medicine"}}
	lots := newFakeLotRepo()
	svc := NewItemService(items, lots)

	lot, err := svc.CreateLot(context.Background(), 1, 7, models.CreateInventoryLotRequest{
		ItemID: 5, LotNumber: "LOT-A1", Quantity: 50, ExpiryDate: "2027-06-30", CostPerUnit: 12.5,
	})
	assert.NoError(t, err)
	assert.Equal(t, 50, lot.Quantity)

	// One initial stock_in movement so ledger reconciles with cached quantity.
	movements, err := svc.ListMovements(context.Background(), 1, lot.ID)
	assert.NoError(t, err)
	assert.Len(t, movements, 1)
	assert.Equal(t, "stock_in", movements[0].Reason)
	assert.Equal(t, 50, movements[0].Delta)
}

func TestItemServiceStockOutThenInsufficient(t *testing.T) {
	items := &fakeItemRepo{created: &models.InventoryItem{ID: 5, Name: "Amoxicillin 250mg"}}
	lots := newFakeLotRepo()
	svc := NewItemService(items, lots)

	lot, err := svc.CreateLot(context.Background(), 1, 7, models.CreateInventoryLotRequest{ItemID: 5, LotNumber: "L1", Quantity: 10})
	assert.NoError(t, err)

	mv, err := svc.RecordMovement(context.Background(), 1, lot.ID, 7, models.CreateStockMovementRequest{Reason: "stock_out", Delta: -4})
	assert.NoError(t, err)
	assert.Equal(t, -4, mv.Delta)

	got, _ := svc.GetLot(context.Background(), 1, lot.ID)
	assert.Equal(t, 6, got.Quantity)

	// Over-dispense surfaces the CHECK-constraint condition as a sentinel.
	_, err = svc.RecordMovement(context.Background(), 1, lot.ID, 7, models.CreateStockMovementRequest{Reason: "stock_out", Delta: -100})
	assert.ErrorIs(t, err, repository.ErrInsufficientStock)

	// Waste + adjustment share the same path.
	_, err = svc.RecordMovement(context.Background(), 1, lot.ID, 7, models.CreateStockMovementRequest{Reason: "waste", Delta: -2, Notes: "expired"})
	assert.NoError(t, err)
	_, err = svc.RecordMovement(context.Background(), 1, lot.ID, 7, models.CreateStockMovementRequest{Reason: "adjustment", Delta: 3, Notes: "count fix"})
	assert.NoError(t, err)
	got, _ = svc.GetLot(context.Background(), 1, lot.ID)
	assert.Equal(t, 7, got.Quantity)
}

func TestItemServiceCreateLotRequiresExistingItem(t *testing.T) {
	items := &fakeItemRepo{}
	svc := NewItemService(items, newFakeLotRepo())

	_, err := svc.CreateLot(context.Background(), 1, 7, models.CreateInventoryLotRequest{ItemID: 999, LotNumber: "X", Quantity: 1})
	assert.Error(t, err)
}
