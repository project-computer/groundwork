package models

import "time"

type SecondaryContact struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
}

type Owner struct {
	ID               int              `json:"id"`
	ClinicID         int              `json:"clinicId"`
	Name             string           `json:"name"`
	Phone            string           `json:"phone"`
	Email            NullString       `json:"email,omitempty"`
	NationalID       NullString       `json:"nationalId,omitempty"`
	Notes            NullString       `json:"notes,omitempty"`
	SecondaryContact *SecondaryContact `json:"secondaryContact,omitempty"`
	CreatedAt        time.Time        `json:"createdAt"`
	UpdatedAt        time.Time        `json:"updatedAt"`
}

type CreateOwnerRequest struct {
	Name             string           `json:"name" validate:"required"`
	Phone            string           `json:"phone" validate:"required"`
	Email            string           `json:"email,omitempty"`
	NationalID       string           `json:"nationalId,omitempty"`
	Notes            string           `json:"notes,omitempty"`
	SecondaryContact *SecondaryContact `json:"secondaryContact,omitempty"`
}

type UpdateOwnerRequest struct {
	Name             string           `json:"name,omitempty"`
	Phone            string           `json:"phone,omitempty"`
	Email            string           `json:"email,omitempty"`
	NationalID       string           `json:"nationalId,omitempty"`
	Notes            string           `json:"notes,omitempty"`
	SecondaryContact *SecondaryContact `json:"secondaryContact,omitempty"`
}

type OwnerListQuery struct {
	Page   int    `query:"page"`
	Limit  int    `query:"limit"`
	Search string `query:"search"`
}