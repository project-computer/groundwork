package models

import (
	"encoding/json"
	"time"
)

type Prescription struct {
	ID               int             `json:"id"`
	ClinicID         int             `json:"clinicId"`
	CustomID         string          `json:"customId"`
	VisitID          NullInt32       `json:"visitId,omitempty"`
	PetID            int             `json:"petId"`
	PetName          string          `json:"petName"`
	OwnerName        string          `json:"ownerName"`
	Date             time.Time       `json:"date"`
	VeterinarianID   NullInt32       `json:"veterinarianId,omitempty"`
	VeterinarianName NullString      `json:"veterinarianName,omitempty"`
	Diagnosis        NullString      `json:"diagnosis,omitempty"`
	Medicines        json.RawMessage `json:"medicines"`
	Notes            NullString      `json:"notes,omitempty"`
	CreatedAt        time.Time       `json:"createdAt"`
}

type Medicine struct {
	Name         string `json:"name"`
	Dosage       string `json:"dosage"`
	Frequency    string `json:"frequency"`
	Duration     string `json:"duration"`
	Instructions string `json:"instructions"`
}

type CreatePrescriptionRequest struct {
	VisitID          int        `json:"visitId,omitempty"`
	PetID            int        `json:"petId" validate:"required"`
	PetName          string     `json:"petName" validate:"required"`
	OwnerName        string     `json:"ownerName" validate:"required"`
	Date             string     `json:"date" validate:"required"`
	VeterinarianID   int        `json:"veterinarianId,omitempty"`
	VeterinarianName string     `json:"veterinarianName,omitempty"`
	Diagnosis        string     `json:"diagnosis,omitempty"`
	Medicines        []Medicine `json:"medicines" validate:"required,min=1"`
	Notes            string     `json:"notes,omitempty"`
}

type PrescriptionListQuery struct {
	Page      int    `query:"page"`
	Limit     int    `query:"limit"`
	PetID     int    `query:"petId"`
	VetID     int    `query:"vetId"`
	StartDate string `query:"startDate"`
	EndDate   string `query:"endDate"`
}
