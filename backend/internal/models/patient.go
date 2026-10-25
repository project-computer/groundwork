package models

import (
	"time"
)

// Patient represents an animal receiving care at a clinic. Identified by MRN (Medical
// Record Number) per CONTEXT.md. Owner fields below (OwnerName/OwnerPhone/Email/etc.)
// are read-only projections from the linked owner row — they live on this struct only
// to avoid an extra JOIN at the call site.
type Patient struct {
	ID              int        `json:"id"`
	ClinicID        int        `json:"clinicId"`
	MRN             string     `json:"mrn"`
	Name            string     `json:"name"`
	Species         string     `json:"species"`
	Breed           NullString `json:"breed,omitempty"`
	DateOfBirth     NullTime   `json:"dateOfBirth,omitempty"`
	Weight          NullFloat64 `json:"weight,omitempty"`

	OwnerID  int    `json:"ownerId"`
	// Derived from JOIN owners
	OwnerName       string     `json:"ownerName"`
	OwnerPhone      string     `json:"ownerPhone"`
	OwnerEmail      NullString `json:"ownerEmail,omitempty"`
	OwnerNationalID NullString `json:"ownerNationalId,omitempty"`
	OwnerNotes      NullString `json:"ownerNotes,omitempty"`

	Status              string  `json:"status"`
	LastAppointmentDate NullTime `json:"lastAppointmentDate,omitempty"`
	NextAppointmentDate NullTime `json:"nextAppointmentDate,omitempty"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
	DeletedAt           NullTime  `json:"-"`
}

// CreatePatientRequest — incoming payload for POST /patients.
// OwnerName/OwnerPhone are kept as required fields because creating a Patient typically
// involves resolving-or-creating the Owner in the same call (a typical walk-in flow).
// Slice 0006 (Owner entity) provides a richer /owners endpoint for managing owners
// independently of patients.
type CreatePatientRequest struct {
	Name            string  `json:"name" validate:"required"`
	Species         string  `json:"species" validate:"required"`
	Breed           string  `json:"breed,omitempty"`
	DateOfBirth     string  `json:"dateOfBirth,omitempty"`
	Weight          float64 `json:"weight,omitempty"`
	OwnerName       string  `json:"ownerName" validate:"required"`
	OwnerPhone      string  `json:"ownerPhone" validate:"required"`
	OwnerEmail      string  `json:"ownerEmail,omitempty"`
	OwnerNationalID string  `json:"ownerNationalId,omitempty"`
	OwnerNotes      string  `json:"ownerNotes,omitempty"`
}

type UpdatePatientRequest struct {
	Name        string  `json:"name,omitempty"`
	Species     string  `json:"species,omitempty"`
	Breed       string  `json:"breed,omitempty"`
	DateOfBirth string  `json:"dateOfBirth,omitempty"`
	Weight      float64 `json:"weight,omitempty"`
	Status      string  `json:"status,omitempty"`
}

type PatientListQuery struct {
	Page    int    `query:"page"`
	Limit   int    `query:"limit"`
	Search  string `query:"search"`
	Species string `query:"species"`
	Status  string `query:"status"`
	MRN     string `query:"mrn"`
}
