package models

import (
	"time"
)

type Pet struct {
	ID                  int        `json:"id"`
	ClinicID            int        `json:"clinicId"`
	CustomID            string     `json:"customId"`
	Name                string     `json:"name"`
	Species             string     `json:"species"`
	Breed               NullString `json:"breed,omitempty"`
	Age                 NullFloat64 `json:"age,omitempty"`
	Weight              NullFloat64 `json:"weight,omitempty"`
	OwnerName           string     `json:"ownerName"`
	OwnerPhone          string     `json:"ownerPhone"`
	OwnerEmail          NullString `json:"ownerEmail,omitempty"`
	OwnerNationalID     NullString `json:"ownerNationalId,omitempty"`
	OwnerNotes          NullString `json:"ownerNotes,omitempty"`
	OwnerLabel          NullString `json:"ownerLabel,omitempty"`
	Status              string     `json:"status"`
	LastAppointmentDate NullTime   `json:"lastAppointmentDate,omitempty"`
	NextAppointmentDate NullTime   `json:"nextAppointmentDate,omitempty"`
	CreatedAt           time.Time  `json:"createdAt"`
	UpdatedAt           time.Time  `json:"updatedAt"`
	DeletedAt           NullTime   `json:"-"`
}

type CreatePetRequest struct {
	Name            string  `json:"name" validate:"required"`
	Species         string  `json:"species" validate:"required"`
	Breed           string  `json:"breed,omitempty"`
	Age             float64 `json:"age,omitempty"`
	Weight          float64 `json:"weight,omitempty"`
	OwnerName       string  `json:"ownerName" validate:"required"`
	OwnerPhone      string  `json:"ownerPhone" validate:"required"`
	OwnerEmail      string  `json:"ownerEmail,omitempty"`
	OwnerNationalID string  `json:"ownerNationalId,omitempty"`
	OwnerNotes      string  `json:"ownerNotes,omitempty"`
	OwnerLabel      string  `json:"ownerLabel,omitempty"`
}

type UpdatePetRequest struct {
	Name            string  `json:"name,omitempty"`
	Species         string  `json:"species,omitempty"`
	Breed           string  `json:"breed,omitempty"`
	Age             float64 `json:"age,omitempty"`
	Weight          float64 `json:"weight,omitempty"`
	OwnerName       string  `json:"ownerName,omitempty"`
	OwnerPhone      string  `json:"ownerPhone,omitempty"`
	OwnerEmail      string  `json:"ownerEmail,omitempty"`
	OwnerNationalID string  `json:"ownerNationalId,omitempty"`
	OwnerNotes      string  `json:"ownerNotes,omitempty"`
	OwnerLabel      string  `json:"ownerLabel,omitempty"`
	Status          string  `json:"status,omitempty"`
}

type PetListQuery struct {
	Page       int    `query:"page"`
	Limit      int    `query:"limit"`
	Search     string `query:"search"`
	Species    string `query:"species"`
	Status     string `query:"status"`
	OwnerPhone string `query:"ownerPhone"`
}
