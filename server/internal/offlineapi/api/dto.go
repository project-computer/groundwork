package api

import (
	"database/sql"

	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

// Response models are separate from the sqlc row structs so the wire shape
// does not drift when the schema changes (plan §3).

type clinicDTO struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Address   string `json:"address"`
	Phone     string `json:"phone"`
	Email     string `json:"email"`
	Currency  string `json:"currency"`
	Locale    string `json:"locale"`
	Timezone  string `json:"timezone"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

func clinicFrom(row db.Clinic) clinicDTO {
	return clinicDTO{
		ID: row.ID, Name: row.Name, Address: row.Address, Phone: row.Phone,
		Email: row.Email, Currency: row.Currency, Locale: row.Locale,
		Timezone: row.Timezone, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

type userDTO struct {
	ID       string   `json:"id"`
	ClinicID string   `json:"clinicId"`
	Name     string   `json:"name"`
	Username string   `json:"username"`
	Active   bool     `json:"active"`
	Roles    []string `json:"roles"`
}

func userFrom(row db.User, roles []string) userDTO {
	return userDTO{
		ID: row.ID, ClinicID: row.ClinicID, Name: row.Name,
		Username: row.Username, Active: row.Active == 1, Roles: roles,
	}
}

type ownerDTO struct {
	ID                    string `json:"id"`
	ClinicID              string `json:"clinicId"`
	Name                  string `json:"name"`
	Phone                 string `json:"phone"`
	Email                 string `json:"email"`
	Address               string `json:"address"`
	SecondaryContactName  string `json:"secondaryContactName"`
	SecondaryContactPhone string `json:"secondaryContactPhone"`
	Notes                 string `json:"notes"`
	CreatedAt             string `json:"createdAt"`
	UpdatedAt             string `json:"updatedAt"`
}

func ownerFrom(row db.Owner) ownerDTO {
	return ownerDTO{
		ID: row.ID, ClinicID: row.ClinicID, Name: row.Name, Phone: row.Phone,
		Email: row.Email, Address: row.Address,
		SecondaryContactName:  row.SecondaryContactName,
		SecondaryContactPhone: row.SecondaryContactPhone,
		Notes:                 row.Notes,
		CreatedAt:             row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

type petDTO struct {
	ID              string `json:"id"`
	ClinicID        string `json:"clinicId"`
	OwnerID         string `json:"ownerId"`
	OwnerName       string `json:"ownerName,omitempty"`
	OwnerPhone      string `json:"ownerPhone,omitempty"`
	MRN             string `json:"mrn"`
	Name            string `json:"name"`
	Species         string `json:"species"`
	Breed           string `json:"breed"`
	Sex             string `json:"sex"`
	DateOfBirth     string `json:"dateOfBirth"`
	Color           string `json:"color"`
	MicrochipNumber string `json:"microchipNumber"`
	Notes           string `json:"notes"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

func petFrom(row db.Pet, ownerName, ownerPhone string) petDTO {
	return petDTO{
		ID: row.ID, ClinicID: row.ClinicID, OwnerID: row.OwnerID,
		OwnerName: ownerName, OwnerPhone: ownerPhone, MRN: row.Mrn,
		Name: row.Name, Species: row.Species, Breed: row.Breed, Sex: row.Sex,
		DateOfBirth: row.DateOfBirth, Color: row.Color,
		MicrochipNumber: row.MicrochipNumber, Notes: row.Notes,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

type weightDTO struct {
	ID          string `json:"id"`
	ClinicID    string `json:"clinicId"`
	PetID       string `json:"petId"`
	WeightGrams int64  `json:"weightGrams"`
	MeasuredAt  string `json:"measuredAt"`
	RecordedBy  string `json:"recordedBy,omitempty"`
	CreatedAt   string `json:"createdAt"`
}

func weightFrom(row db.PetWeight) weightDTO {
	recordedBy := ""
	if row.RecordedBy.Valid {
		recordedBy = row.RecordedBy.String
	}
	return weightDTO{
		ID: row.ID, ClinicID: row.ClinicID, PetID: row.PetID,
		WeightGrams: row.WeightGrams, MeasuredAt: row.MeasuredAt,
		RecordedBy: recordedBy, CreatedAt: row.CreatedAt,
	}
}

type appointmentDTO struct {
	ID                 string `json:"id"`
	ClinicID           string `json:"clinicId"`
	PetID              string `json:"petId"`
	PetName            string `json:"petName,omitempty"`
	PetMRN             string `json:"petMrn,omitempty"`
	OwnerID            string `json:"ownerId,omitempty"`
	OwnerName          string `json:"ownerName,omitempty"`
	OwnerPhone         string `json:"ownerPhone,omitempty"`
	VeterinarianID     string `json:"veterinarianId,omitempty"`
	ScheduledAt        string `json:"scheduledAt"`
	DurationMinutes    int64  `json:"durationMinutes"`
	Reason             string `json:"reason"`
	Status             string `json:"status"`
	CancellationReason string `json:"cancellationReason,omitempty"`
	CheckedInAt        string `json:"checkedInAt,omitempty"`
	StartedAt          string `json:"startedAt,omitempty"`
	CompletedAt        string `json:"completedAt,omitempty"`
	Notes              string `json:"notes"`
	CreatedAt          string `json:"createdAt"`
	UpdatedAt          string `json:"updatedAt"`
}

func appointmentFrom(row db.Appointment, petName, petMRN, ownerID, ownerName, ownerPhone string) appointmentDTO {
	return appointmentDTO{
		ID: row.ID, ClinicID: row.ClinicID, PetID: row.PetID,
		PetName: petName, PetMRN: petMRN, OwnerID: ownerID,
		OwnerName: ownerName, OwnerPhone: ownerPhone,
		VeterinarianID: nullString(row.VeterinarianID),
		ScheduledAt:    row.ScheduledAt, DurationMinutes: row.DurationMinutes,
		Reason: row.Reason, Status: row.Status,
		CancellationReason: row.CancellationReason,
		CheckedInAt:        nullString(row.CheckedInAt),
		StartedAt:          nullString(row.StartedAt),
		CompletedAt:        nullString(row.CompletedAt),
		Notes:              row.Notes,
		CreatedAt:          row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func appointmentFromGet(row db.GetAppointmentRow) appointmentDTO {
	return appointmentFrom(appointmentFields(row), row.PetName, row.PetMrn, row.OwnerID, row.OwnerName, row.OwnerPhone)
}

func appointmentFromList(row db.ListAppointmentsRow) appointmentDTO {
	return appointmentFrom(appointmentListFields(row), row.PetName, row.PetMrn, row.OwnerID, row.OwnerName, row.OwnerPhone)
}

func appointmentFields(row db.GetAppointmentRow) db.Appointment {
	return db.Appointment{
		ID: row.ID, ClinicID: row.ClinicID, PetID: row.PetID,
		VeterinarianID: row.VeterinarianID, ScheduledAt: row.ScheduledAt,
		DurationMinutes: row.DurationMinutes, Reason: row.Reason,
		Status: row.Status, CancellationReason: row.CancellationReason,
		CheckedInAt: row.CheckedInAt, StartedAt: row.StartedAt,
		CompletedAt: row.CompletedAt, Notes: row.Notes,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func appointmentListFields(row db.ListAppointmentsRow) db.Appointment {
	return db.Appointment{
		ID: row.ID, ClinicID: row.ClinicID, PetID: row.PetID,
		VeterinarianID: row.VeterinarianID, ScheduledAt: row.ScheduledAt,
		DurationMinutes: row.DurationMinutes, Reason: row.Reason,
		Status: row.Status, CancellationReason: row.CancellationReason,
		CheckedInAt: row.CheckedInAt, StartedAt: row.StartedAt,
		CompletedAt: row.CompletedAt, Notes: row.Notes,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

type vitalsDTO struct {
	WeightGrams        *int64   `json:"weightGrams,omitempty"`
	TemperatureCelsius *float64 `json:"temperatureCelsius,omitempty"`
	HeartRateBpm       *int64   `json:"heartRateBpm,omitempty"`
	RespiratoryRateBpm *int64   `json:"respiratoryRateBpm,omitempty"`
}

type diagnosisDTO struct {
	ID          string `json:"id"`
	Code        string `json:"code"`
	Description string `json:"description"`
	Notes       string `json:"notes"`
	CreatedAt   string `json:"createdAt"`
}

type treatmentDTO struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	Notes       string `json:"notes"`
	CreatedAt   string `json:"createdAt"`
}

type consultationDTO struct {
	ID             string         `json:"id"`
	ClinicID       string         `json:"clinicId"`
	PetID          string         `json:"petId"`
	AppointmentID  string         `json:"appointmentId,omitempty"`
	VeterinarianID string         `json:"veterinarianId,omitempty"`
	ChiefComplaint string         `json:"chiefComplaint"`
	Symptoms       string         `json:"symptoms"`
	Examination    string         `json:"examination"`
	DiagnosisNotes string         `json:"diagnosisNotes"`
	TreatmentPlan  string         `json:"treatmentPlan"`
	Notes          string         `json:"notes"`
	Vitals         vitalsDTO      `json:"vitals"`
	Status         string         `json:"status"`
	StartedAt      string         `json:"startedAt"`
	CompletedAt    string         `json:"completedAt,omitempty"`
	CreatedAt      string         `json:"createdAt"`
	UpdatedAt      string         `json:"updatedAt"`
	Diagnoses      []diagnosisDTO `json:"diagnoses"`
	Treatments     []treatmentDTO `json:"treatments"`
}

func consultationFrom(row db.Consultation, diagnoses []db.Diagnosis, treatments []db.Treatment) consultationDTO {
	out := consultationDTO{
		ID: row.ID, ClinicID: row.ClinicID, PetID: row.PetID,
		AppointmentID:  nullString(row.AppointmentID),
		VeterinarianID: nullString(row.VeterinarianID),
		ChiefComplaint: row.ChiefComplaint, Symptoms: row.Symptoms,
		Examination: row.Examination, DiagnosisNotes: row.DiagnosisNotes,
		TreatmentPlan: row.TreatmentPlan, Notes: row.Notes,
		Vitals: vitalsDTO{
			WeightGrams:        nullInt64(row.WeightGrams),
			TemperatureCelsius: nullFloat64(row.TemperatureCelsius),
			HeartRateBpm:       nullInt64(row.HeartRateBpm),
			RespiratoryRateBpm: nullInt64(row.RespiratoryRateBpm),
		},
		Status: row.Status, StartedAt: row.StartedAt,
		CompletedAt: nullString(row.CompletedAt),
		CreatedAt:   row.CreatedAt, UpdatedAt: row.UpdatedAt,
		Diagnoses:  make([]diagnosisDTO, 0, len(diagnoses)),
		Treatments: make([]treatmentDTO, 0, len(treatments)),
	}
	for _, diagnosis := range diagnoses {
		out.Diagnoses = append(out.Diagnoses, diagnosisDTO{
			ID: diagnosis.ID, Code: diagnosis.Code,
			Description: diagnosis.Description, Notes: diagnosis.Notes,
			CreatedAt: diagnosis.CreatedAt,
		})
	}
	for _, treatment := range treatments {
		out.Treatments = append(out.Treatments, treatmentDTO{
			ID: treatment.ID, Description: treatment.Description,
			Notes: treatment.Notes, CreatedAt: treatment.CreatedAt,
		})
	}
	return out
}

type prescriptionItemDTO struct {
	ID                string `json:"id"`
	MedicationID      string `json:"medicationId,omitempty"`
	MedicationName    string `json:"medicationName"`
	Strength          string `json:"strength"`
	DoseAmount        string `json:"doseAmount"`
	DoseUnit          string `json:"doseUnit"`
	Route             string `json:"route"`
	Frequency         string `json:"frequency"`
	DurationDays      *int64 `json:"durationDays,omitempty"`
	QuantityDispensed int64  `json:"quantityDispensed"`
	Instructions      string `json:"instructions"`
}

type prescriptionDTO struct {
	ID             string                `json:"id"`
	ClinicID       string                `json:"clinicId"`
	ConsultationID string                `json:"consultationId"`
	PetID          string                `json:"petId"`
	VeterinarianID string                `json:"veterinarianId,omitempty"`
	Instructions   string                `json:"instructions"`
	Status         string                `json:"status"`
	IssuedAt       string                `json:"issuedAt"`
	CreatedAt      string                `json:"createdAt"`
	UpdatedAt      string                `json:"updatedAt"`
	Items          []prescriptionItemDTO `json:"items"`
}

func prescriptionFrom(row db.Prescription, items []db.PrescriptionItem) prescriptionDTO {
	out := prescriptionDTO{
		ID: row.ID, ClinicID: row.ClinicID, ConsultationID: row.ConsultationID,
		PetID: row.PetID, VeterinarianID: nullString(row.VeterinarianID),
		Instructions: row.Instructions, Status: row.Status,
		IssuedAt: row.IssuedAt, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
		Items: make([]prescriptionItemDTO, 0, len(items)),
	}
	for _, item := range items {
		out.Items = append(out.Items, prescriptionItemDTO{
			ID: item.ID, MedicationID: nullString(item.MedicationID),
			MedicationName: item.MedicationName, Strength: item.Strength,
			DoseAmount: item.DoseAmount, DoseUnit: item.DoseUnit,
			Route: item.Route, Frequency: item.Frequency,
			DurationDays:      nullInt64(item.DurationDays),
			QuantityDispensed: item.QuantityDispensed,
			Instructions:      item.Instructions,
		})
	}
	return out
}

type medicationDTO struct {
	ID        string `json:"id"`
	ClinicID  string `json:"clinicId"`
	Name      string `json:"name"`
	Strength  string `json:"strength"`
	Form      string `json:"form"`
	Active    bool   `json:"active"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

func medicationFrom(row db.Medication) medicationDTO {
	return medicationDTO{
		ID: row.ID, ClinicID: row.ClinicID, Name: row.Name,
		Strength: row.Strength, Form: row.Form, Active: row.IsActive == 1,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func nullString(value sql.NullString) string {
	if value.Valid {
		return value.String
	}
	return ""
}

func nullInt64(value sql.NullInt64) *int64 {
	if value.Valid {
		v := value.Int64
		return &v
	}
	return nil
}

func nullFloat64(value sql.NullFloat64) *float64 {
	if value.Valid {
		v := value.Float64
		return &v
	}
	return nil
}
