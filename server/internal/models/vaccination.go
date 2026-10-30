package models

import "time"

// VaccineProtocol is the canonical, globally-maintained definition of a vaccine's
// schedule. Per ADR-0017, protocols are NOT tenant-scoped — rabies is annual everywhere.
// clinic_id deliberately absent.
type VaccineProtocol struct {
	ID                  int       `json:"id"`
	Name                string    `json:"name"`
	Species             string    `json:"species"`
	DefaultIntervalDays int       `json:"defaultIntervalDays"`
	CreatedAt           time.Time `json:"createdAt"`
}

// Vaccination is a discrete clinical event in which a vaccine was administered.
// Per CONTEXT.md glossary.
type Vaccination struct {
	ID                    int        `json:"id"`
	ClinicID              int        `json:"clinicId"`
	PatientID             int        `json:"patientId"`
	PatientName           string     `json:"patientName,omitempty"`
	VisitID               NullInt32  `json:"visitId,omitempty"`
	AdministeredByVetID   NullInt32  `json:"administeredByVetId,omitempty"`
	AdministeredByVetName NullString `json:"administeredByVetName,omitempty"`
	VaccineName           string     `json:"vaccineName"`
	Manufacturer          NullString `json:"manufacturer,omitempty"`
	LotNumber             NullString `json:"lotNumber,omitempty"`
	InventoryLotID        NullInt32  `json:"inventoryLotId,omitempty"`
	AdministeredDate      time.Time  `json:"administeredDate"`
	NextDueDate           NullTime   `json:"nextDueDate,omitempty"`
	Notes                 NullString `json:"notes,omitempty"`
	CreatedAt             time.Time  `json:"createdAt"`
	UpdatedAt             time.Time  `json:"updatedAt"`
}

type CreateVaccinationRequest struct {
	PatientID           int    `json:"patientId" validate:"required"`
	VisitID             int    `json:"visitId,omitempty"`
	AdministeredByVetID int    `json:"administeredByVetId,omitempty"`
	VaccineName         string `json:"vaccineName" validate:"required"`
	Manufacturer        string `json:"manufacturer,omitempty"`
	LotNumber           string `json:"lotNumber,omitempty"`
	AdministeredDate    string `json:"administeredDate" validate:"required"` // YYYY-MM-DD
	NextDueDate         string `json:"nextDueDate,omitempty"`                // YYYY-MM-DD; empty → auto-calc
	Notes               string `json:"notes,omitempty"`
}

type UpdateVaccinationRequest struct {
	VaccineName      string `json:"vaccineName,omitempty"`
	Manufacturer     string `json:"manufacturer,omitempty"`
	LotNumber        string `json:"lotNumber,omitempty"`
	AdministeredDate string `json:"administeredDate,omitempty"`
	NextDueDate      string `json:"nextDueDate,omitempty"`
	Notes            string `json:"notes,omitempty"`
}

type VaccinationListQuery struct {
	Page        int    `query:"page"`
	Limit       int    `query:"limit"`
	PatientID   int    `query:"patientId"`
	VaccineName string `query:"vaccineName"`
	OverdueOnly bool   `query:"overdueOnly"`
}
