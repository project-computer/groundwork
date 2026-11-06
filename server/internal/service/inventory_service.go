package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/project-computer/groundwork/server/internal/models"
)

// SupplierRepo is the persistent surface for suppliers (slice 0007).
type SupplierRepo interface {
	Create(ctx context.Context, clinicID int, s *models.Supplier) error
	GetByID(ctx context.Context, clinicID, id int) (*models.Supplier, error)
	List(ctx context.Context, clinicID int) ([]*models.Supplier, error)
	Update(ctx context.Context, clinicID, id int, req *models.UpdateSupplierRequest) (*models.Supplier, error)
	Delete(ctx context.Context, clinicID, id int) error
}

// InventoryItemRepo is the persistent surface for inventory items.
type InventoryItemRepo interface {
	Create(ctx context.Context, clinicID int, it *models.InventoryItem) error
	GetByID(ctx context.Context, clinicID, id int) (*models.InventoryItem, error)
	List(ctx context.Context, clinicID int, q models.InventoryItemListQuery) ([]*models.InventoryItem, int, error)
	Update(ctx context.Context, clinicID, id int, req *models.UpdateInventoryItemRequest) (*models.InventoryItem, error)
	Delete(ctx context.Context, clinicID, id int) error
}

// InventoryLotRepo is the persistent surface for lots + the movement ledger.
type InventoryLotRepo interface {
	Create(ctx context.Context, clinicID int, l *models.InventoryLot) error
	GetByID(ctx context.Context, clinicID, id int) (*models.InventoryLot, error)
	ListByItem(ctx context.Context, clinicID, itemID int) ([]*models.InventoryLot, error)
	Update(ctx context.Context, clinicID, id int, req *models.UpdateInventoryLotRequest) (*models.InventoryLot, error)
	RecordMovement(ctx context.Context, clinicID, lotID, userID int, req *models.CreateStockMovementRequest) (*models.StockMovement, error)
	ListMovementsByLot(ctx context.Context, clinicID, lotID int) ([]*models.StockMovement, error)
}

func NewSupplierService(suppliers SupplierRepo) *SupplierService {
	return &SupplierService{repo: suppliers}
}

type SupplierService struct {
	repo SupplierRepo
}

func (s *SupplierService) Create(ctx context.Context, clinicID int, req models.CreateSupplierRequest) (*models.Supplier, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, errors.New("name is required")
	}
	sup := &models.Supplier{Name: strings.TrimSpace(req.Name)}
	if req.Phone != "" {
		sup.Phone = models.NewNullString(req.Phone)
	}
	if req.Email != "" {
		sup.Email = models.NewNullString(req.Email)
	}
	if req.Address != "" {
		sup.Address = models.NewNullString(req.Address)
	}
	if err := s.repo.Create(ctx, clinicID, sup); err != nil {
		return nil, err
	}
	return s.repo.GetByID(ctx, clinicID, sup.ID)
}

func (s *SupplierService) Get(ctx context.Context, clinicID, id int) (*models.Supplier, error) {
	return s.repo.GetByID(ctx, clinicID, id)
}

func (s *SupplierService) List(ctx context.Context, clinicID int) ([]*models.Supplier, error) {
	return s.repo.List(ctx, clinicID)
}

func (s *SupplierService) Update(ctx context.Context, clinicID, id int, req models.UpdateSupplierRequest) (*models.Supplier, error) {
	if req.Name == "" && req.Phone == "" && req.Email == "" && req.Address == "" {
		return nil, errors.New("no fields to update")
	}
	return s.repo.Update(ctx, clinicID, id, &req)
}

func (s *SupplierService) Delete(ctx context.Context, clinicID, id int) error {
	return s.repo.Delete(ctx, clinicID, id)
}

type ItemService struct {
	repo  InventoryItemRepo
	lots  InventoryLotRepo
	audit *AuditService
	now   func() time.Time
}

func NewItemService(repo InventoryItemRepo, lots InventoryLotRepo, audit ...*AuditService) *ItemService {
	s := &ItemService{repo: repo, lots: lots, now: time.Now}
	if len(audit) > 0 {
		s.audit = audit[0]
	}
	return s
}

func (s *ItemService) Create(ctx context.Context, clinicID int, req models.CreateInventoryItemRequest) (*models.InventoryItem, error) {
	it := &models.InventoryItem{
		Name:         strings.TrimSpace(req.Name),
		Category:     req.Category,
		Unit:         strings.TrimSpace(req.Unit),
		ReorderLevel: req.ReorderLevel,
		SellingPrice: req.SellingPrice,
	}
	if req.Notes != "" {
		it.Notes = models.NewNullString(req.Notes)
	}
	if err := s.repo.Create(ctx, clinicID, it); err != nil {
		return nil, err
	}
	return s.repo.GetByID(ctx, clinicID, it.ID)
}

func (s *ItemService) Get(ctx context.Context, clinicID, id int) (*models.InventoryItem, error) {
	return s.repo.GetByID(ctx, clinicID, id)
}

func (s *ItemService) List(ctx context.Context, clinicID int, q models.InventoryItemListQuery) ([]*models.InventoryItem, int, error) {
	return s.repo.List(ctx, clinicID, q)
}

func (s *ItemService) Update(ctx context.Context, clinicID, id int, req models.UpdateInventoryItemRequest) (*models.InventoryItem, error) {
	return s.repo.Update(ctx, clinicID, id, &req)
}

func (s *ItemService) Delete(ctx context.Context, clinicID, id int) error {
	return s.repo.Delete(ctx, clinicID, id)
}

// CreateLot registers a received batch. Quantity > 0 also writes an initial
// stock_in movement so the ledger reconciles with the cached quantity.
func (s *ItemService) CreateLot(ctx context.Context, clinicID, userID int, req models.CreateInventoryLotRequest) (*models.InventoryLot, error) {
	if strings.TrimSpace(req.LotNumber) == "" {
		return nil, errors.New("lotNumber is required")
	}
	if _, err := s.repo.GetByID(ctx, clinicID, req.ItemID); err != nil {
		return nil, errors.New("item not found")
	}

	lot := &models.InventoryLot{
		ItemID:       req.ItemID,
		LotNumber:    strings.TrimSpace(req.LotNumber),
		Quantity:     0, // inserted at 0; the initial stock_in movement below brings it up
		SupplierID:   models.NullInt32{},
		CostPerUnit:  models.NullFloat64{},
		ReceivedDate: s.now(),
	}
	if req.ExpiryDate != "" {
		d, err := time.Parse("2006-01-02", req.ExpiryDate)
		if err != nil {
			return nil, errors.New("expiryDate must be YYYY-MM-DD")
		}
		lot.ExpiryDate = models.NewNullTime(d)
	}
	if req.SupplierID > 0 {
		lot.SupplierID = models.NewNullInt32(int32(req.SupplierID))
	}
	if req.CostPerUnit > 0 {
		lot.CostPerUnit = models.NewNullFloat64(req.CostPerUnit)
	}
	if req.ReceivedDate != "" {
		d, err := time.Parse("2006-01-02", req.ReceivedDate)
		if err != nil {
			return nil, errors.New("receivedDate must be YYYY-MM-DD")
		}
		lot.ReceivedDate = d
	}

	if err := s.lots.Create(ctx, clinicID, lot); err != nil {
		return nil, err
	}

	if req.Quantity > 0 {
		if _, err := s.lots.RecordMovement(ctx, clinicID, lot.ID, userID, &models.CreateStockMovementRequest{
			Reason: "stock_in",
			Delta:  req.Quantity,
			Notes:  "initial receipt",
		}); err != nil {
			return nil, err
		}
	}
	return s.lots.GetByID(ctx, clinicID, lot.ID)
}

func (s *ItemService) GetLot(ctx context.Context, clinicID, lotID int) (*models.InventoryLot, error) {
	return s.lots.GetByID(ctx, clinicID, lotID)
}

func (s *ItemService) ListLots(ctx context.Context, clinicID, itemID int) ([]*models.InventoryLot, error) {
	return s.lots.ListByItem(ctx, clinicID, itemID)
}

func (s *ItemService) UpdateLot(ctx context.Context, clinicID, lotID int, req models.UpdateInventoryLotRequest) (*models.InventoryLot, error) {
	return s.lots.Update(ctx, clinicID, lotID, &req)
}

// RecordMovement is the single stock-op path (stock_in/out/adjustment/waste).
// The ledger is append-only: no update or delete exists.
func (s *ItemService) RecordMovement(ctx context.Context, clinicID, lotID, userID int, req models.CreateStockMovementRequest) (*models.StockMovement, error) {
	movement, err := s.lots.RecordMovement(ctx, clinicID, lotID, userID, &req)
	if err != nil {
		return nil, err
	}

	s.audit.Record(ctx, clinicID, userID, "inventory.stock_movement", "inventory_lot", lotID, map[string]interface{}{
		"type":     req.Reason,
		"quantity": req.Delta,
		"reason":   req.Reason,
	})

	return movement, nil
}

func (s *ItemService) ListMovements(ctx context.Context, clinicID, lotID int) ([]*models.StockMovement, error) {
	return s.lots.ListMovementsByLot(ctx, clinicID, lotID)
}
