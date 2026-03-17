package models

import (
	"database/sql"
	"encoding/json"
	"time"
)

type Visit struct {
	ID                     int             `json:"id"`
	ClinicID               int             `json:"clinicId"`
	CustomID               string          `json:"customId"`
	PetID                  int             `json:"petId"`
	AppointmentID          sql.NullInt32   `json:"appointmentId,omitempty"`
	PetName                string          `json:"petName"`
	OwnerName              string          `json:"ownerName"`
	Type                   string          `json:"type"`
	Purpose                string          `json:"purpose"`
	Status                 string          `json:"status"`
	AssignedVetID          sql.NullInt32   `json:"assignedVetId,omitempty"`
	AssignedVetName        sql.NullString  `json:"assignedVetName,omitempty"`
	Steps                  json.RawMessage `json:"steps"`
	ChiefComplaint         sql.NullString  `json:"chiefComplaint,omitempty"`
	Vitals                 json.RawMessage `json:"vitals"`
	Examination            sql.NullString  `json:"examination,omitempty"`
	DifferentialDiagnosis  sql.NullString  `json:"differentialDiagnosis,omitempty"`
	FinalDiagnosis         sql.NullString  `json:"finalDiagnosis,omitempty"`
	Treatment              sql.NullString  `json:"treatment,omitempty"`
	Advice                 sql.NullString  `json:"advice,omitempty"`
	FollowUpDate           sql.NullTime    `json:"followUpDate,omitempty"`
	Medications            json.RawMessage `json:"medications"`
	HasMedicationEnvelope  bool            `json:"hasMedicationEnvelope"`
	HistoryNotes           sql.NullString  `json:"historyNotes,omitempty"`
	BillingStatus          string          `json:"billingStatus"`
	CreatedBy              int             `json:"createdBy"`
	CreatedAt              time.Time       `json:"createdAt"`
	UpdatedAt              time.Time       `json:"updatedAt"`
}

type VisitImage struct {
	ID           int            `json:"id"`
	VisitID      int            `json:"visitId"`
	FileKey      string         `json:"fileKey"`
	URL          string         `json:"url"`
	ThumbnailURL sql.NullString `json:"thumbnailUrl,omitempty"`
	Caption      sql.NullString `json:"caption,omitempty"`
	FileSize     int            `json:"fileSize"`
	MimeType     string         `json:"mimeType"`
	UploadedBy   int            `json:"uploadedBy"`
	UploadedAt   time.Time      `json:"uploadedAt"`
}

type CreateVisitRequest struct {
	PetID           int    `json:"petId" validate:"required"`
	AppointmentID   int    `json:"appointmentId,omitempty"`
	PetName         string `json:"petName" validate:"required"`
	OwnerName       string `json:"ownerName" validate:"required"`
	Type            string `json:"type" validate:"required,oneof=OPD IPD"`
	Purpose         string `json:"purpose" validate:"required"`
	AssignedVetID   int    `json:"assignedVetId,omitempty"`
	AssignedVetName string `json:"assignedVetName,omitempty"`
}

type UpdateVisitRequest struct {
	Status                 string          `json:"status,omitempty"`
	Steps                  json.RawMessage `json:"steps,omitempty"`
	ChiefComplaint         string          `json:"chiefComplaint,omitempty"`
	Vitals                 json.RawMessage `json:"vitals,omitempty"`
	Examination            string          `json:"examination,omitempty"`
	DifferentialDiagnosis  string          `json:"differentialDiagnosis,omitempty"`
	FinalDiagnosis         string          `json:"finalDiagnosis,omitempty"`
	Treatment              string          `json:"treatment,omitempty"`
	Advice                 string          `json:"advice,omitempty"`
	FollowUpDate           string          `json:"followUpDate,omitempty"`
	Medications            json.RawMessage `json:"medications,omitempty"`
	HasMedicationEnvelope  *bool           `json:"hasMedicationEnvelope,omitempty"`
	HistoryNotes           string          `json:"historyNotes,omitempty"`
	BillingStatus          string          `json:"billingStatus,omitempty"`
}

type VisitListQuery struct {
	Page      int    `query:"page"`
	Limit     int    `query:"limit"`
	Status    string `query:"status"`
	PetID     int    `query:"petId"`
	Type      string `query:"type"`
	VetID     int    `query:"vetId"`
}
