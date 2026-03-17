package models

import (
	"database/sql"
	"time"
)

type Pet struct {
	ID                  int            `json:"id"`
	ClinicID            int            `json:"clinicId"`
	CustomID            string         `json:"customId"`
	Name                string         `json:"name"`
	Species             string         `json:"species"`
	Breed               sql.NullString `json:"breed,omitempty"`
	Age                 sql.NullFloat64 `json:"age,omitempty"`
	Weight              sql.NullFloat64 `json:"weight,omitempty"`
	OwnerName           string         `json:"ownerName"`
	OwnerPhone          string         `json:"ownerPhone"`
	OwnerEmail          sql.NullString `json:"ownerEmail,omitempty"`
	OwnerNationalID     sql.NullString `json:"ownerNationalId,omitempty"`
	OwnerNotes          sql.NullString `json:"ownerNotes,omitempty"`
	OwnerLabel          sql.NullString `json:"ownerLabel,omitempty"`
	Status              string         `json:"status"`
	LastAppointmentDate sql.NullTime   `json:"lastAppointmentDate,omitempty"`
	NextAppointmentDate sql.NullTime   `json:"nextAppointmentDate,omitempty"`
	CreatedAt           time.Time      `json:"createdAt"`
	UpdatedAt           time.Time      `json:"updatedAt"`
	DeletedAt           sql.NullTime   `json:"-"`
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
