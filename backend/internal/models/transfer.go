package models

import "time"

type CaseTransfer struct {
	ID                int             `json:"id"`
	ClinicID          int             `json:"clinicId"`
	CustomID          string          `json:"customId"`
	PetID             int             `json:"petId"`
	SourceVisitID     int             `json:"sourceVisitId"`
	PetName           string          `json:"petName"`
	OwnerName         string          `json:"ownerName"`
	OwnerPhone        NullString      `json:"ownerPhone,omitempty"`
	ReferralClinic    string          `json:"referralClinic"`
	ReferralReason    string          `json:"referralReason"`
	TransferData      TransferData    `json:"transferData"`
	Status            string          `json:"status"`
	ShareToken        string          `json:"shareToken"`
	ExpiresAt         NullTime        `json:"expiresAt,omitempty"`
	CreatedBy         int             `json:"createdBy"`
	CreatedAt         time.Time       `json:"createdAt"`
	UpdatedAt         time.Time       `json:"updatedAt"`
}

type TransferData struct {
	PetInfo     PetInfoTransfer    `json:"petInfo"`
	VisitInfo   VisitInfoTransfer  `json:"visitInfo"`
	Vitals      map[string]any     `json:"vitals,omitempty"`
	Diagnosis   string             `json:"diagnosis,omitempty"`
	Treatment   string             `json:"treatment,omitempty"`
	Medications []MedicationItem   `json:"medications,omitempty"`
	History     []HistoryItem      `json:"history,omitempty"`
}

type PetInfoTransfer struct {
	Name      string  `json:"name"`
	Species   string  `json:"species"`
	Breed     string  `json:"breed,omitempty"`
	Age       float64 `json:"age,omitempty"`
	Weight    float64 `json:"weight,omitempty"`
}

type VisitInfoTransfer struct {
	Date          string `json:"date"`
	Type          string `json:"type"`
	Purpose       string `json:"purpose"`
	ChiefComplaint string `json:"chiefComplaint,omitempty"`
	Examination   string `json:"examination,omitempty"`
	AssignedVet   string `json:"assignedVet,omitempty"`
}

type MedicationItem struct {
	Name     string `json:"name"`
	Dosage   string `json:"dosage"`
	Frequency string `json:"frequency"`
	Duration string `json:"duration"`
	Notes    string `json:"notes,omitempty"`
}

type HistoryItem struct {
	Date       string `json:"date"`
	Diagnosis  string `json:"diagnosis"`
	Treatment  string `json:"treatment"`
	Clinic     string `json:"clinic"`
}

type CreateTransferRequest struct {
	PetID            int    `json:"petId" validate:"required"`
	SourceVisitID    int    `json:"sourceVisitId" validate:"required"`
	ReferralClinic   string `json:"referralClinic" validate:"required"`
	ReferralReason   string `json:"referralReason" validate:"required"`
}

type TransferListQuery struct {
	Page   int    `query:"page"`
	Limit  int    `query:"limit"`
	Status string `query:"status"`
	PetID  int    `query:"petId"`
}
