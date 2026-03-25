package models

import (
	"time"
)

type Appointment struct {
	ID                int        `json:"id"`
	ClinicID          int        `json:"clinicId"`
	CustomID          string     `json:"customId"`
	PetID             int        `json:"petId"`
	PetName           string     `json:"petName"`
	OwnerName         string     `json:"ownerName"`
	Date              time.Time  `json:"date"`
	Time              string     `json:"time"`
	Type              string     `json:"type"`
	Status            string     `json:"status"`
	Notes             NullString `json:"notes,omitempty"`
	VeterinarianID    NullInt32  `json:"veterinarianId,omitempty"`
	VeterinarianName  NullString `json:"veterinarianName,omitempty"`
	CreatedBy         int        `json:"createdBy"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

type CreateAppointmentRequest struct {
	PetID            int    `json:"petId" validate:"required"`
	PetName          string `json:"petName" validate:"required"`
	OwnerName        string `json:"ownerName" validate:"required"`
	Date             string `json:"date" validate:"required"`
	Time             string `json:"time" validate:"required"`
	Type             string `json:"type" validate:"required"`
	Notes            string `json:"notes,omitempty"`
	VeterinarianID   int    `json:"veterinarianId,omitempty"`
	VeterinarianName string `json:"veterinarianName,omitempty"`
}

type UpdateAppointmentRequest struct {
	Date             string `json:"date,omitempty"`
	Time             string `json:"time,omitempty"`
	Type             string `json:"type,omitempty"`
	Status           string `json:"status,omitempty"`
	Notes            string `json:"notes,omitempty"`
	VeterinarianID   int    `json:"veterinarianId,omitempty"`
	VeterinarianName string `json:"veterinarianName,omitempty"`
}

type AppointmentListQuery struct {
	Page           int    `query:"page"`
	Limit          int    `query:"limit"`
	Date           string `query:"date"`
	Status         string `query:"status"`
	VeterinarianID int    `query:"veterinarianId"`
}
