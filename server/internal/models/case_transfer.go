package models

import (
	"encoding/json"
	"time"
)

// CaseTransfer is a shareable bundle of one Patient's selected Visits, sent
// from one clinic to another via a token-protected link (see CONTEXT.md). The
// bundle never shares rows across clinics: on acceptance the receiving clinic
// creates its own copies stamped with original_clinic_id.
type CaseTransfer struct {
	ID           int        `json:"id"`
	FromClinicID int        `json:"fromClinicId"`
	ToClinicID   NullInt32  `json:"toClinicId,omitempty"`
	PatientID    int        `json:"patientId"`
	VisitIDs     []int      `json:"visitIds"`
	Token        string     `json:"token"`
	Status       string     `json:"status"`
	Note         NullString `json:"note,omitempty"`
	CreatedBy    int        `json:"createdBy"`
	AcceptedBy   NullInt32  `json:"acceptedBy,omitempty"`
	AcceptedAt   NullTime   `json:"acceptedAt,omitempty"`
	ExpiresAt    time.Time  `json:"expiresAt"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`

	// Enriched for list/preview rendering
	FromClinicName string `json:"fromClinicName,omitempty"`
	ToClinicName   string `json:"toClinicName,omitempty"`
	PatientName    string `json:"patientName,omitempty"`
	Species        string `json:"species,omitempty"`
	OwnerName      string `json:"ownerName,omitempty"`
	VisitCount     int    `json:"visitCount"`
}

// CaseTransferPreview is the sanitized bundle a receiving clinic sees via the
// token link before accepting. Clinical content is included; internal ids,
// audit fields and billing state are not.
type CaseTransferPreview struct {
	Token          string                  `json:"token"`
	Status         string                  `json:"status"`
	ExpiresAt      time.Time               `json:"expiresAt"`
	FromClinicName string                  `json:"fromClinicName"`
	Note           NullString              `json:"note,omitempty"`
	Patient        CaseTransferPatientInfo `json:"patient"`
	Owner          CaseTransferOwnerInfo   `json:"owner"`
	Visits         []CaseTransferVisit     `json:"visits"`
}

type CaseTransferPatientInfo struct {
	Name        string      `json:"name"`
	Species     string      `json:"species"`
	Breed       NullString  `json:"breed,omitempty"`
	DateOfBirth NullTime    `json:"dateOfBirth,omitempty"`
	Weight      NullFloat64 `json:"weight,omitempty"`
	MRN         string      `json:"mrn"`
}

type CaseTransferOwnerInfo struct {
	Name  string     `json:"name"`
	Phone string     `json:"phone"`
	Email NullString `json:"email,omitempty"`
}

type CaseTransferVisit struct {
	ID                    int             `json:"id"`
	Date                  time.Time       `json:"date"`
	Type                  string          `json:"type"`
	Purpose               string          `json:"purpose"`
	ChiefComplaint        NullString      `json:"chiefComplaint,omitempty"`
	Vitals                json.RawMessage `json:"vitals"`
	Examination           NullString      `json:"examination,omitempty"`
	DifferentialDiagnosis NullString      `json:"differentialDiagnosis,omitempty"`
	FinalDiagnosis        NullString      `json:"finalDiagnosis,omitempty"`
	Treatment             NullString      `json:"treatment,omitempty"`
	Advice                NullString      `json:"advice,omitempty"`
	Medications           json.RawMessage `json:"medications"`
}

type CreateCaseTransferRequest struct {
	PatientID  int    `json:"patientId" validate:"required"`
	VisitIDs   []int  `json:"visitIds" validate:"required,min=1"`
	ToClinicID int    `json:"toClinicId,omitempty"`
	Note       string `json:"note,omitempty"`
	// ExpiresInDays overrides the default share-link lifetime (14 days).
	ExpiresInDays int `json:"expiresInDays,omitempty"`
}

// AcceptCaseTransferResult reports what the receiving clinic's copy operation created.
type AcceptCaseTransferResult struct {
	PatientID    int    `json:"patientId"`
	MRN          string `json:"mrn"`
	VisitsCopied int    `json:"visitsCopied"`
}
