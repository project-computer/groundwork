package models

import "time"

// Supplier is an external vendor an InventoryLot was purchased from. Tenant-scoped.
type Supplier struct {
	ID        int        `json:"id"`
	ClinicID  int        `json:"clinicId"`
	Name      string     `json:"name"`
	Phone     NullString `json:"phone,omitempty"`
	Email     NullString `json:"email,omitempty"`
	Address   NullString `json:"address,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
	DeletedAt NullTime   `json:"deletedAt,omitempty"`
}

type CreateSupplierRequest struct {
	Name    string `json:"name" validate:"required"`
	Phone   string `json:"phone,omitempty"`
	Email   string `json:"email,omitempty"`
	Address string `json:"address,omitempty"`
}

type UpdateSupplierRequest struct {
	Name    string `json:"name,omitempty"`
	Phone   string `json:"phone,omitempty"`
	Email   string `json:"email,omitempty"`
	Address string `json:"address,omitempty"`
}

// InventoryItem is a clinic's stock-keeping definition (e.g. "Amoxicillin 250mg").
// OnHand is derived: SUM of its active lots' quantity (slice 0008).
type InventoryItem struct {
	ID           int        `json:"id"`
	ClinicID     int        `json:"clinicId"`
	Name         string     `json:"name"`
	Category     string     `json:"category"` // medicine | vaccine | equipment | supply
	Unit         string     `json:"unit"`
	ReorderLevel int        `json:"reorderLevel"`
	SellingPrice float64    `json:"sellingPrice"`
	Notes        NullString `json:"notes,omitempty"`
	OnHand       int        `json:"onHand"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
	DeletedAt    NullTime   `json:"deletedAt,omitempty"`
}

type CreateInventoryItemRequest struct {
	Name         string  `json:"name" validate:"required"`
	Category     string  `json:"category" validate:"required,oneof=medicine vaccine equipment supply"`
	Unit         string  `json:"unit" validate:"required"`
	ReorderLevel int     `json:"reorderLevel,omitempty"`
	SellingPrice float64 `json:"sellingPrice" validate:"required,gte=0"`
	Notes        string  `json:"notes,omitempty"`
}

type UpdateInventoryItemRequest struct {
	Name         string  `json:"name,omitempty"`
	Category     string  `json:"category,omitempty" validate:"omitempty,oneof=medicine vaccine equipment supply"`
	Unit         string  `json:"unit,omitempty"`
	ReorderLevel *int    `json:"reorderLevel,omitempty"`
	SellingPrice float64 `json:"sellingPrice,omitempty"`
	Notes        string  `json:"notes,omitempty"`
}

type InventoryItemListQuery struct {
	Page     int    `query:"page"`
	Limit    int    `query:"limit"`
	Category string `query:"category"`
	Search   string `query:"search"`
}

// InventoryLot is a specific batch of an InventoryItem from a Supplier.
type InventoryLot struct {
	ID           int         `json:"id"`
	ClinicID     int         `json:"clinicId"`
	ItemID       int         `json:"itemId"`
	ItemName     string      `json:"itemName,omitempty"`
	LotNumber    string      `json:"lotNumber"`
	Quantity     int         `json:"quantity"`
	ExpiryDate   NullTime    `json:"expiryDate,omitempty"`
	SupplierID   NullInt32   `json:"supplierId,omitempty"`
	SupplierName NullString  `json:"supplierName,omitempty"`
	CostPerUnit  NullFloat64 `json:"costPerUnit,omitempty"`
	ReceivedDate time.Time   `json:"receivedDate"`
	CreatedAt    time.Time   `json:"createdAt"`
	UpdatedAt    time.Time   `json:"updatedAt"`
	DeletedAt    NullTime    `json:"deletedAt,omitempty"`
}

type CreateInventoryLotRequest struct {
	ItemID       int     `json:"itemId" validate:"required"`
	LotNumber    string  `json:"lotNumber" validate:"required"`
	Quantity     int     `json:"quantity" validate:"required,gte=0"`
	ExpiryDate   string  `json:"expiryDate,omitempty"` // YYYY-MM-DD
	SupplierID   int     `json:"supplierId,omitempty"`
	CostPerUnit  float64 `json:"costPerUnit,omitempty"`
	ReceivedDate string  `json:"receivedDate,omitempty"` // YYYY-MM-DD; empty → today
}

type UpdateInventoryLotRequest struct {
	LotNumber   string  `json:"lotNumber,omitempty"`
	ExpiryDate  string  `json:"expiryDate,omitempty"`
	CostPerUnit float64 `json:"costPerUnit,omitempty"`
}

// StockMovement is an append-only ledger entry recording a change in a lot's quantity.
type StockMovement struct {
	ID        int        `json:"id"`
	ClinicID  int        `json:"clinicId"`
	LotID     int        `json:"lotId"`
	ItemID    int        `json:"itemId,omitempty"`
	ItemName  string     `json:"itemName,omitempty"`
	LotNumber string     `json:"lotNumber,omitempty"`
	Delta     int        `json:"delta"`
	Reason    string     `json:"reason"` // stock_in | stock_out | adjustment | waste
	RefType   NullString `json:"refType,omitempty"`
	RefID     NullInt32  `json:"refId,omitempty"`
	UserID    int        `json:"userId"`
	UserName  NullString `json:"userName,omitempty"`
	Notes     NullString `json:"notes,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
}

type CreateStockMovementRequest struct {
	Reason  string `json:"reason" validate:"required,oneof=stock_in stock_out adjustment waste"`
	Delta   int    `json:"delta" validate:"required,ne=0"`
	RefType string `json:"refType,omitempty"`
	RefID   int    `json:"refId,omitempty"`
	Notes   string `json:"notes,omitempty"`
}
