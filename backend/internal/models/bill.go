package models

import (
	"encoding/json"
	"time"
)

type Bill struct {
	ID             int             `json:"id"`
	ClinicID       int             `json:"clinicId"`
	CustomID       string          `json:"customId"`
	VisitID        NullInt32       `json:"visitId,omitempty"`
	PetID          int             `json:"petId"`
	PetName        string          `json:"petName"`
	OwnerName      string          `json:"ownerName"`
	Date           time.Time       `json:"date"`
	Items          json.RawMessage `json:"items"`
	Subtotal       float64         `json:"subtotal"`
	Tax            float64         `json:"tax"`
	Discount       float64         `json:"discount"`
	Total          float64         `json:"total"`
	Status         string          `json:"status"`
	PaymentMethod  NullString      `json:"paymentMethod,omitempty"`
	PaymentNotes   NullString      `json:"paymentNotes,omitempty"`
	CreatedBy      int             `json:"createdBy"`
	CreatedAt      time.Time       `json:"createdAt"`
	UpdatedAt      time.Time       `json:"updatedAt"`
}

type BillItem struct {
	Description string  `json:"description"`
	Quantity    int     `json:"quantity"`
	Price       float64 `json:"price"`
}

type CreateBillRequest struct {
	VisitID  int        `json:"visitId,omitempty"`
	PetID    int        `json:"petId" validate:"required"`
	PetName  string     `json:"petName" validate:"required"`
	OwnerName string    `json:"ownerName" validate:"required"`
	Date     string     `json:"date" validate:"required"`
	Items    []BillItem `json:"items" validate:"required,min=1"`
	Discount float64    `json:"discount,omitempty"`
}

type UpdateBillRequest struct {
	Items         []BillItem `json:"items,omitempty"`
	Discount      float64    `json:"discount,omitempty"`
	Status        string     `json:"status,omitempty"`
	PaymentMethod string     `json:"paymentMethod,omitempty"`
	PaymentNotes  string     `json:"paymentNotes,omitempty"`
}

type BillListQuery struct {
	Page      int    `query:"page"`
	Limit     int    `query:"limit"`
	Status    string `query:"status"`
	PetID     int    `query:"petId"`
	StartDate string `query:"startDate"`
	EndDate   string `query:"endDate"`
}
