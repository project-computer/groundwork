// Package clinicimport converts a clinic_state document (the ADR-0012 model,
// see apps/clinic/src/lib/vet/types.ts and fixtures/clinic-document.json)
// into the offline-MVP normalized schema (ADR 0023). It is the phase-4 gate:
// after a successful import the REST backend serves the clinic's history.
//
// Mapping decisions (deliberate, lossless where the schema allows):
//
//   - Ids are preserved, so audit trails and cross-references stay coherent.
//   - StaffUser has no username; one is derived (slug of the name, disambiguated
//     with a short id suffix). PBKDF2 document PIN hashes cannot be verified by
//     bcrypt, so imported accounts carry an empty hash — every member needs a
//     PIN reset before signing in (reported per user).
//   - Patient sex folds neutered/spayed into the base sex with a note (the
//     normalized schema has no neutered flag); allergies, medical alerts and
//     the owner-reported baseline weight move into `notes` under labeled
//     prefixes.
//   - Encounter vitals become consultation vital columns, and a positive
//     weightKg also lands in pet_weights (ADR 0022: weight is a history).
//   - Clinical notes (amend-aware in the document) are flattened to text with
//     author/timestamp prefixes; the full edit trail is preserved verbatim.
//   - Products become services (kind=service → category service; medication/
//     supply → product) and additionally medications for kind=medication, so
//     prescriptions keep their catalog link via productId.
//   - Invoices: the document has no subtotal/discount/tax fields, so
//     subtotal = total = Σ line totals and discount/tax are zero. Status is
//     derived from the document's payment ledger (void stays void; otherwise
//     unpaid/partial/paid).
//   - The document ledger allows negative payments (refunds); the normalized
//     schema does not (CHECK amount_satang > 0). Refunds are imported as
//     status='refunded' rows carrying the absolute amount and a reference
//     noting what they reverse; allocations exist only for positive payments.
//   - Skipped (no normalized counterpart yet — reported, never silently
//     dropped): inventoryItems, inventoryLots, stockMovements, suppliers,
//     vaccinations, caseTransfers, outbox.
package clinicimport

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode"

	"database/sql"
	"github.com/google/uuid"

	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

// ---------------------------------------------------------------------------
// Document model (mirrors apps/clinic/src/lib/vet/types.ts)
// ---------------------------------------------------------------------------

type documentClinic struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Timezone string  `json:"timezone"`
	Currency string  `json:"currency"`
	VatRate  float64 `json:"vatRate"`
	Address  string  `json:"address"`
	Phone    string  `json:"phone"`
	Email    string  `json:"email"`
}

type documentUser struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Role   string `json:"role"`
	Active *bool  `json:"active"`
}

type documentOwner struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Phone   string `json:"phone"`
	Email   string `json:"email"`
	Address string `json:"address"`
}

type documentPatient struct {
	ID            string   `json:"id"`
	OwnerID       string   `json:"ownerId"`
	Mrn           string   `json:"mrn"`
	Name          string   `json:"name"`
	Species       string   `json:"species"`
	Breed         string   `json:"breed"`
	Sex           string   `json:"sex"`
	BirthDate     string   `json:"birthDate"`
	WeightKg      string   `json:"weightKg"`
	Microchip     string   `json:"microchip"`
	Allergies     []string `json:"allergies"`
	MedicalAlerts []string `json:"medicalAlerts"`
}

type documentAppointment struct {
	ID          string `json:"id"`
	PatientID   string `json:"patientId"`
	StartsAt    string `json:"startsAt"`
	DurationMin int64  `json:"durationMin"`
	Reason      string `json:"reason"`
	VetID       string `json:"vetId"`
	Status      string `json:"status"`
}

type documentVitals struct {
	WeightKg  string `json:"weightKg"`
	TempC     string `json:"tempC"`
	HeartRate string `json:"heartRate"`
	RespRate  string `json:"respRate"`
}

type documentNote struct {
	ID        string `json:"id"`
	AuthorID  string `json:"authorId"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
	Amends    string `json:"amends"`
}

type documentDiagnosis struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	Status      string `json:"status"`
}

type documentPrescription struct {
	ID           string `json:"id"`
	ProductID    string `json:"productId"`
	Medication   string `json:"medication"`
	Dose         string `json:"dose"`
	Route        string `json:"route"`
	Frequency    string `json:"frequency"`
	Duration     string `json:"duration"`
	Quantity     int64  `json:"quantity"`
	PrescriberID string `json:"prescriberId"`
}

type documentEncounter struct {
	ID            string                 `json:"id"`
	PatientID     string                 `json:"patientId"`
	AppointmentID string                 `json:"appointmentId"`
	AttendingID   string                 `json:"attendingId"`
	Status        string                 `json:"status"`
	OpenedAt      string                 `json:"openedAt"`
	ClosedAt      string                 `json:"closedAt"`
	Vitals        documentVitals         `json:"vitals"`
	Notes         []documentNote         `json:"notes"`
	Diagnoses     []documentDiagnosis    `json:"diagnoses"`
	Prescriptions []documentPrescription `json:"prescriptions"`
}

type documentProduct struct {
	ID        string `json:"id"`
	SKU       string `json:"sku"`
	Name      string `json:"name"`
	Unit      string `json:"unit"`
	UnitPrice int64  `json:"unitPrice"`
	Kind      string `json:"kind"`
}

type documentInvoiceItem struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	Quantity    int64  `json:"quantity"`
	UnitPrice   int64  `json:"unitPrice"`
	ProductID   string `json:"productId"`
}

type documentInvoice struct {
	ID          string                `json:"id"`
	Number      string                `json:"number"`
	OwnerID     string                `json:"ownerId"`
	EncounterID string                `json:"encounterId"`
	Status      string                `json:"status"`
	Items       []documentInvoiceItem `json:"items"`
	CreatedAt   string                `json:"createdAt"`
}

type documentPayment struct {
	ID         string `json:"id"`
	InvoiceID  string `json:"invoiceId"`
	Amount     int64  `json:"amount"`
	Method     string `json:"method"`
	ReceivedAt string `json:"receivedAt"`
	Kind       string `json:"kind"`
	RefundOf   string `json:"refundOf"`
	Note       string `json:"note"`
}

type documentAudit struct {
	ID         string `json:"id"`
	ActorID    string `json:"actorId"`
	Action     string `json:"action"`
	EntityType string `json:"entityType"`
	EntityID   string `json:"entityId"`
	Summary    string `json:"summary"`
	OccurredAt string `json:"occurredAt"`
}

type Document struct {
	Clinic documentClinic `json:"clinic"`

	Users          []documentUser        `json:"users"`
	Owners         []documentOwner       `json:"owners"`
	Patients       []documentPatient     `json:"patients"`
	Appointments   []documentAppointment `json:"appointments"`
	Encounters     []documentEncounter   `json:"encounters"`
	Products       []documentProduct     `json:"products"`
	StockMovements []map[string]any      `json:"stockMovements"`
	Suppliers      []map[string]any      `json:"suppliers"`
	InventoryItems []map[string]any      `json:"inventoryItems"`
	InventoryLots  []map[string]any      `json:"inventoryLots"`
	Invoices       []documentInvoice     `json:"invoices"`
	Payments       []documentPayment     `json:"payments"`
	Vaccinations   []map[string]any      `json:"vaccinations"`
	CaseTransfers  []map[string]any      `json:"caseTransfers"`
	Audit          []documentAudit       `json:"audit"`
	Outbox         []map[string]any      `json:"outbox"`
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

// Parse validates a raw document. Mirrors parseClinicState: a missing
// collection is an empty array; a collection that is present but not an array
// means the shape has drifted and importing would silently drop data — reject.
func Parse(raw []byte) (*Document, error) {
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(raw, &probe); err != nil {
		return nil, fmt.Errorf("document is not JSON: %w", err)
	}
	if probe["clinic"] == nil {
		return nil, fmt.Errorf("document has no clinic record")
	}
	for key, value := range probe {
		if key == "clinic" || key == "lastSyncedAt" || key == "$comment" {
			continue
		}
		var arr []json.RawMessage
		if err := json.Unmarshal(value, &arr); err != nil {
			return nil, fmt.Errorf("collection %q is not an array", key)
		}
	}
	doc := &Document{}
	if err := json.Unmarshal(raw, doc); err != nil {
		return nil, fmt.Errorf("document does not match the clinic_state shape: %w", err)
	}
	if doc.Clinic.ID == "" || doc.Clinic.Name == "" {
		return nil, fmt.Errorf("clinic id and name are required")
	}
	return doc, nil
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

// Report summarizes one import run.
type Report struct {
	ClinicID string
	Counts   map[string]int
	Warnings []string
	Skipped  map[string]int
	Duration time.Duration
}

func (r *Report) warnf(format string, args ...any) {
	r.Warnings = append(r.Warnings, fmt.Sprintf(format, args...))
}

// Run imports the document inside the caller's transaction. On error the
// caller must roll back — partial imports never commit.
func Run(ctx context.Context, q *db.Queries, doc *Document) (*Report, error) {
	start := time.Now()
	report := &Report{Counts: map[string]int{}, Skipped: map[string]int{}, ClinicID: doc.Clinic.ID}
	now := db.UtcNow()
	clinicID := doc.Clinic.ID

	// 1. Clinic tenant + document settings with no clinic column.
	if _, err := q.CreateClinic(ctx, db.CreateClinicParams{
		ID: clinicID, Name: doc.Clinic.Name, Address: doc.Clinic.Address,
		Phone: doc.Clinic.Phone, Email: doc.Clinic.Email,
		Currency: orDefault(doc.Clinic.Currency, "THB"),
		Locale:   "th", Timezone: orDefault(doc.Clinic.Timezone, "Asia/Bangkok"),
		CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		return nil, fmt.Errorf("create clinic: %w", err)
	}
	for key, value := range map[string]string{
		"billing.vatRate": fmt.Sprintf("%v", doc.Clinic.VatRate),
	} {
		if err := q.UpsertSetting(ctx, db.UpsertSettingParams{
			ClinicID: clinicID, Key: key, Value: value, UpdatedAt: now,
		}); err != nil {
			return nil, fmt.Errorf("save setting %s: %w", key, err)
		}
	}
	report.Counts["clinics"] = 1

	// 2. Users (role vocabulary mapped, usernames derived, PINs reset).
	userIDs := map[string]bool{}
	usernames := map[string]bool{}
	for _, user := range doc.Users {
		if user.ID == "" || strings.TrimSpace(user.Name) == "" {
			report.warnf("skipped a user without id or name")
			continue
		}
		username := deriveUsername(user.Name, user.ID, usernames)
		usernames[username] = true
		role := mapRole(user.Role)
		active := int64(1)
		if user.Active != nil && !*user.Active {
			active = 0
		}
		if _, err := q.CreateUser(ctx, db.CreateUserParams{
			ID: user.ID, ClinicID: clinicID, Name: user.Name, Username: username,
			// Document PIN hashes are PBKDF2; bcrypt cannot verify them, so
			// every imported account needs a PIN reset before first sign-in.
			PinHash: "", Active: active, CreatedAt: now, UpdatedAt: now,
		}); err != nil {
			return nil, fmt.Errorf("create user %s: %w", user.Name, err)
		}
		if err := q.AssignRole(ctx, db.AssignRoleParams{
			UserID: user.ID, RoleID: "role-" + role,
		}); err != nil {
			return nil, fmt.Errorf("assign role to %s: %w", user.Name, err)
		}
		userIDs[user.ID] = true
		report.warnf("user %s (%s): PIN reset required, signs in as %q", user.Name, role, username)
		report.Counts["users"]++
	}

	// 3. Owners.
	for _, owner := range doc.Owners {
		if owner.ID == "" || strings.TrimSpace(owner.Name) == "" {
			report.warnf("skipped an owner without id or name")
			continue
		}
		if _, err := q.CreateOwner(ctx, db.CreateOwnerParams{
			ID: owner.ID, ClinicID: clinicID, Name: owner.Name, Phone: owner.Phone,
			Email: owner.Email, Address: owner.Address, CreatedAt: now, UpdatedAt: now,
		}); err != nil {
			return nil, fmt.Errorf("create owner %s: %w", owner.Name, err)
		}
		report.Counts["owners"]++
	}

	// 4. Patients (species/sex normalized, clinical data folded into notes).
	for _, pet := range doc.Patients {
		if pet.ID == "" || strings.TrimSpace(pet.Name) == "" {
			report.warnf("skipped a patient without id or name")
			continue
		}
		if _, err := q.GetOwner(ctx, db.GetOwnerParams{ClinicID: clinicID, ID: pet.OwnerID}); err != nil {
			report.warnf("patient %s skipped: ownerId %q is unknown", pet.Name, pet.OwnerID)
			continue
		}
		if _, err := q.CreatePet(ctx, db.CreatePetParams{
			ID: pet.ID, ClinicID: clinicID, OwnerID: pet.OwnerID, Mrn: pet.Mrn,
			Name: pet.Name, Species: normalizeSpecies(pet.Species), Breed: pet.Breed,
			Sex: normalizeSex(pet.Sex), DateOfBirth: pet.BirthDate,
			MicrochipNumber: pet.Microchip, Notes: patientNotes(pet),
			CreatedAt: now, UpdatedAt: now,
		}); err != nil {
			return nil, fmt.Errorf("create patient %s: %w", pet.Name, err)
		}
		report.Counts["patients"]++
	}

	// 5. Appointments (status mapped; timestamps the document never stored
	// stay NULL rather than being invented).
	appointmentIDs := map[string]bool{}
	for _, appt := range doc.Appointments {
		if appt.ID == "" {
			continue
		}
		if _, err := q.GetPet(ctx, db.GetPetParams{ClinicID: clinicID, ID: appt.PatientID}); err != nil {
			report.warnf("appointment %s skipped: patientId %q is unknown", appt.ID, appt.PatientID)
			continue
		}
		duration := appt.DurationMin
		if duration <= 0 {
			duration = 30
		}
		if _, err := q.CreateAppointment(ctx, db.CreateAppointmentParams{
			ID: appt.ID, ClinicID: clinicID, PetID: appt.PatientID,
			VeterinarianID: nullableUser(appt.VetID, userIDs, report, "appointment "+appt.ID),
			ScheduledAt:    orDefault(appt.StartsAt, now), DurationMinutes: duration,
			Reason: appt.Reason, Status: mapAppointmentStatus(appt.Status),
			CreatedAt: now, UpdatedAt: now,
		}); err != nil {
			return nil, fmt.Errorf("create appointment %s: %w", appt.ID, err)
		}
		appointmentIDs[appt.ID] = true
		report.Counts["appointments"]++
	}

	// 6. Products → services (+ medications) before encounters, so
	// prescriptions and invoice items can link their catalog ids.
	serviceIDByProduct := map[string]string{}
	medicationIDByProduct := map[string]string{}
	for _, product := range doc.Products {
		if product.ID == "" || strings.TrimSpace(product.Name) == "" {
			continue
		}
		category := "product"
		if product.Kind == "service" {
			category = "service"
		}
		if _, err := q.CreateService(ctx, db.CreateServiceParams{
			ID: product.ID, ClinicID: clinicID, Name: product.Name, Category: category,
			Unit: orDefault(product.Unit, "unit"), UnitPriceSatang: product.UnitPrice,
			IsActive: 1, CreatedAt: now, UpdatedAt: now,
		}); err != nil {
			return nil, fmt.Errorf("create service from product %s: %w", product.Name, err)
		}
		serviceIDByProduct[product.ID] = product.ID
		if product.Kind == "medication" {
			if _, err := q.CreateMedication(ctx, db.CreateMedicationParams{
				ID: product.ID, ClinicID: clinicID, Name: product.Name,
				IsActive: 1, CreatedAt: now, UpdatedAt: now,
			}); err != nil {
				return nil, fmt.Errorf("create medication from product %s: %w", product.Name, err)
			}
			medicationIDByProduct[product.ID] = product.ID
		}
		report.Counts["products"]++
	}

	// 7. Encounters → consultations (+ vitals → pet_weights per ADR 0022,
	// notes, diagnoses, prescriptions).
	for _, encounter := range doc.Encounters {
		if encounter.ID == "" {
			continue
		}
		if _, err := q.GetPet(ctx, db.GetPetParams{ClinicID: clinicID, ID: encounter.PatientID}); err != nil {
			report.warnf("encounter %s skipped: patientId %q is unknown", encounter.ID, encounter.PatientID)
			continue
		}
		started := orDefault(encounter.OpenedAt, now)
		status := "completed"
		completed := sql.NullString{String: orDefault(encounter.ClosedAt, started), Valid: true}
		if encounter.Status == "open" {
			status = "open"
			completed = sql.NullString{}
		}
		appointmentID := sql.NullString{}
		if encounter.AppointmentID != "" {
			if appointmentIDs[encounter.AppointmentID] {
				appointmentID = sql.NullString{String: encounter.AppointmentID, Valid: true}
			} else {
				report.warnf("encounter %s: appointmentId %q is unknown, reference cleared",
					encounter.ID, encounter.AppointmentID)
			}
		}
		weightGrams, weightOK := kgToGrams(encounter.Vitals.WeightKg)
		consultation, err := q.CreateConsultation(ctx, db.CreateConsultationParams{
			ID: encounter.ID, ClinicID: clinicID, PetID: encounter.PatientID,
			AppointmentID:  appointmentID,
			VeterinarianID: nullableUser(encounter.AttendingID, userIDs, report, "encounter "+encounter.ID),
			DiagnosisNotes: joinDiagnoses(encounter.Diagnoses),
			Notes:          joinNotes(encounter.Notes),
			WeightGrams:    nullInt64(weightOK, weightGrams),
			TemperatureCelsius: nullFloat64(
				parseFloat(encounter.Vitals.TempC)),
			HeartRateBpm:       nullInt64(parseFloat(encounter.Vitals.HeartRate) != nil, int64Value(parseFloat(encounter.Vitals.HeartRate))),
			RespiratoryRateBpm: nullInt64(parseFloat(encounter.Vitals.RespRate) != nil, int64Value(parseFloat(encounter.Vitals.RespRate))),
			Status:             status,
			StartedAt:          started, CompletedAt: completed,
			CreatedAt: now, UpdatedAt: now,
		})
		if err != nil {
			return nil, fmt.Errorf("create consultation %s: %w", encounter.ID, err)
		}
		if weightOK {
			// ADR 0022: every recorded weight is a measurement in the history.
			if _, err := q.CreatePetWeight(ctx, db.CreatePetWeightParams{
				ID: uuid.NewString(), ClinicID: clinicID, PetID: encounter.PatientID,
				WeightGrams: weightGrams, MeasuredAt: started,
				RecordedBy: nullableUser(encounter.AttendingID, userIDs, report, ""),
				CreatedAt:  now,
			}); err != nil {
				return nil, fmt.Errorf("create weight for encounter %s: %w", encounter.ID, err)
			}
			report.Counts["weightObservations"]++
		}
		for _, diagnosis := range encounter.Diagnoses {
			description := strings.TrimSpace(diagnosis.Description)
			if description == "" {
				continue
			}
			if _, err := q.CreateDiagnosis(ctx, db.CreateDiagnosisParams{
				ID: orDefault(diagnosis.ID, uuid.NewString()), ClinicID: clinicID,
				ConsultationID: consultation.ID, Description: description,
				Notes: diagnosis.Status, CreatedAt: now,
			}); err != nil {
				return nil, fmt.Errorf("create diagnosis for %s: %w", encounter.ID, err)
			}
		}
		for _, rx := range encounter.Prescriptions {
			if strings.TrimSpace(rx.Medication) == "" {
				continue
			}
			issuedAt := orDefault(encounter.ClosedAt, started)
			instructions := strings.Join(nonEmpty(rx.Dose, rx.Route, rx.Frequency, rx.Duration), " · ")
			prescription, err := q.CreatePrescription(ctx, db.CreatePrescriptionParams{
				ID: orDefault(rx.ID, uuid.NewString()), ClinicID: clinicID,
				ConsultationID: consultation.ID, PetID: encounter.PatientID,
				VeterinarianID: nullableUser(rx.PrescriberID, userIDs, report, "prescription "+rx.ID),
				Instructions:   instructions, Status: "issued",
				IssuedAt: issuedAt, CreatedAt: now, UpdatedAt: now,
			})
			if err != nil {
				return nil, fmt.Errorf("create prescription for %s: %w", encounter.ID, err)
			}
			var medicationID sql.NullString
			if id, ok := medicationIDByProduct[rx.ProductID]; ok {
				medicationID = sql.NullString{String: id, Valid: true}
			}
			quantity := rx.Quantity
			if quantity < 0 {
				quantity = 0
			}
			if _, err := q.CreatePrescriptionItem(ctx, db.CreatePrescriptionItemParams{
				ID: uuid.NewString(), ClinicID: clinicID, PrescriptionID: prescription.ID,
				MedicationID: medicationID, MedicationName: rx.Medication,
				DoseAmount: rx.Dose, Route: rx.Route, Frequency: rx.Frequency,
				DurationDays: sql.NullInt64{}, QuantityDispensed: quantity,
				Instructions: instructions, CreatedAt: now,
			}); err != nil {
				return nil, fmt.Errorf("create prescription item for %s: %w", encounter.ID, err)
			}
			report.Counts["prescriptions"]++
		}
		report.Counts["encounters"]++
	}

	// 8. Invoices + items (status derived from the document's ledger).
	invoiceTotal := map[string]int64{}
	for _, invoice := range doc.Invoices {
		if invoice.ID == "" || strings.TrimSpace(invoice.Number) == "" {
			report.warnf("skipped an invoice without id or number")
			continue
		}
		if _, err := q.GetOwner(ctx, db.GetOwnerParams{ClinicID: clinicID, ID: invoice.OwnerID}); err != nil {
			report.warnf("invoice %s skipped: ownerId %q is unknown", invoice.Number, invoice.OwnerID)
			continue
		}
		var subtotal int64
		for _, item := range invoice.Items {
			line := item.Quantity * item.UnitPrice
			if line < 0 {
				line = 0
			}
			subtotal += line
		}
		invoiceTotal[invoice.ID] = subtotal
		petID := sql.NullString{}
		consultationID := sql.NullString{}
		if invoice.EncounterID != "" {
			if consultation, err := q.GetConsultation(ctx, db.GetConsultationParams{
				ClinicID: clinicID, ID: invoice.EncounterID,
			}); err == nil {
				consultationID = sql.NullString{String: consultation.ID, Valid: true}
				petID = sql.NullString{String: consultation.PetID, Valid: true}
			}
		}
		if _, err := q.CreateInvoice(ctx, db.CreateInvoiceParams{
			ID: invoice.ID, ClinicID: clinicID, OwnerID: invoice.OwnerID,
			PetID: petID, ConsultationID: consultationID, InvoiceNumber: invoice.Number,
			Status:         deriveInvoiceStatus(invoice.Status, subtotal, doc.Payments, invoice.ID),
			SubtotalSatang: subtotal, TotalSatang: subtotal,
			Notes: "", IssuedAt: orDefault(invoice.CreatedAt, now),
			CreatedAt: now, UpdatedAt: now,
		}); err != nil {
			return nil, fmt.Errorf("create invoice %s: %w", invoice.Number, err)
		}
		for _, item := range invoice.Items {
			if strings.TrimSpace(item.Description) == "" && item.ProductID == "" {
				continue
			}
			line := item.Quantity * item.UnitPrice
			if line < 0 {
				line = 0
			}
			serviceID := sql.NullString{}
			if _, ok := serviceIDByProduct[item.ProductID]; ok {
				serviceID = sql.NullString{String: item.ProductID, Valid: true}
			}
			quantity := item.Quantity
			if quantity <= 0 {
				quantity = 1
			}
			if _, err := q.CreateInvoiceItem(ctx, db.CreateInvoiceItemParams{
				ID: orDefault(item.ID, uuid.NewString()), ClinicID: clinicID,
				InvoiceID: invoice.ID, ServiceID: serviceID,
				Description: orDefault(item.Description, "item"), Quantity: quantity,
				UnitPriceSatang: item.UnitPrice, LineTotalSatang: line, CreatedAt: now,
			}); err != nil {
				return nil, fmt.Errorf("create invoice item for %s: %w", invoice.Number, err)
			}
		}
		report.Counts["invoices"]++
	}

	// 9. Payments (refunds become status='refunded' rows with the absolute
	// amount — see the package comment for the ledger caveat).
	for _, payment := range doc.Payments {
		if payment.ID == "" || payment.InvoiceID == "" || payment.Amount == 0 {
			report.warnf("skipped a payment without id, invoice or amount")
			continue
		}
		if _, err := q.GetInvoice(ctx, db.GetInvoiceParams{ClinicID: clinicID, ID: payment.InvoiceID}); err != nil {
			report.warnf("payment %s skipped: invoiceId %q is unknown", payment.ID, payment.InvoiceID)
			continue
		}
		status := "paid"
		amount := payment.Amount
		reference := payment.Note
		if payment.Amount < 0 || payment.Kind == "refund" {
			status = "refunded"
			amount = -payment.Amount
			reference = strings.TrimSpace(orDefault(payment.RefundOf, "") + " " + payment.Note)
		}
		if _, err := q.CreatePayment(ctx, db.CreatePaymentParams{
			ID: payment.ID, ClinicID: clinicID, InvoiceID: payment.InvoiceID,
			AmountSatang: amount, Method: mapPaymentMethod(payment.Method),
			Reference: reference, Status: status,
			ReceivedAt: orDefault(payment.ReceivedAt, now), CreatedAt: now,
		}); err != nil {
			return nil, fmt.Errorf("create payment %s: %w", payment.ID, err)
		}
		if status == "paid" {
			if _, err := q.CreatePaymentAllocation(ctx, db.CreatePaymentAllocationParams{
				ID: uuid.NewString(), ClinicID: clinicID, PaymentID: payment.ID,
				InvoiceID: payment.InvoiceID, AmountSatang: amount, CreatedAt: now,
			}); err != nil {
				return nil, fmt.Errorf("allocate payment %s: %w", payment.ID, err)
			}
		}
		report.Counts["payments"]++
	}

	// 10. Audit history (append-only, actor kept as recorded).
	for _, event := range doc.Audit {
		if event.ID == "" {
			continue
		}
		if _, err := q.CreateAuditLog(ctx, db.CreateAuditLogParams{
			ID: event.ID, ClinicID: clinicID,
			ActorUserID: sql.NullString{String: event.ActorID, Valid: event.ActorID != ""},
			Action:      event.Action, EntityType: event.EntityType, EntityID: event.EntityID,
			Summary: event.Summary, Payload: "{}", CreatedAt: orDefault(event.OccurredAt, now),
		}); err != nil {
			return nil, fmt.Errorf("create audit event %s: %w", event.ID, err)
		}
		report.Counts["auditEvents"]++
	}

	// 11. Collections with no normalized counterpart yet — counted, never
	// dropped silently.
	for name, count := range map[string]int{
		"inventoryItems": len(doc.InventoryItems), "inventoryLots": len(doc.InventoryLots),
		"stockMovements": len(doc.StockMovements), "suppliers": len(doc.Suppliers),
		"vaccinations": len(doc.Vaccinations), "caseTransfers": len(doc.CaseTransfers),
		"outbox": len(doc.Outbox),
	} {
		if count > 0 {
			report.Skipped[name] = count
		}
	}

	report.Duration = time.Since(start)
	return report, nil
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

func orDefault(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func nonEmpty(values ...string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			out = append(out, strings.TrimSpace(value))
		}
	}
	return out
}

func mapRole(role string) string {
	switch role {
	case "reception":
		return "receptionist"
	case "vet":
		return "veterinarian"
	case "admin", "veterinarian", "receptionist", "pharmacist":
		return role
	default:
		return "receptionist"
	}
}

func deriveUsername(name, id string, taken map[string]bool) string {
	slug := strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return unicode.ToLower(r)
		}
		return -1
	}, strings.ToLower(strings.Join(strings.Fields(name), "")))
	if slug == "" {
		slug = "staff"
	}
	if _, clash := taken[slug]; clash {
		return slug + "." + lastSegment(onlyLettersDigits(id), 4)
	}
	return slug
}

func lastSegment(id string, n int) string {
	if len(id) <= n {
		return id
	}
	return id[len(id)-n:]
}

func onlyLettersDigits(id string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return r
		}
		return -1
	}, id)
}

func patientNotes(pet documentPatient) string {
	var parts []string
	if len(pet.Allergies) > 0 {
		parts = append(parts, "allergies: "+strings.Join(pet.Allergies, ", "))
	}
	if len(pet.MedicalAlerts) > 0 {
		parts = append(parts, "medical alerts: "+strings.Join(pet.MedicalAlerts, ", "))
	}
	switch pet.Sex {
	case "Male (neutered)":
		parts = append(parts, "neutered")
	case "Female (spayed)":
		parts = append(parts, "spayed")
	}
	if strings.TrimSpace(pet.WeightKg) != "" {
		parts = append(parts, "owner-reported baseline weight: "+pet.WeightKg+" kg")
	}
	return strings.Join(parts, "; ")
}

func normalizeSpecies(species string) string {
	if strings.TrimSpace(species) == "" {
		return "other"
	}
	return strings.ToLower(species)
}

func normalizeSex(sex string) string {
	switch {
	case strings.HasPrefix(sex, "Male"):
		return "male"
	case strings.HasPrefix(sex, "Female"):
		return "female"
	default:
		return "unknown"
	}
}

func mapAppointmentStatus(status string) string {
	switch status {
	case "checked_in":
		return "arrived"
	case "in_consult":
		return "in_progress"
	case "completed", "cancelled", "no_show":
		return status
	default:
		return "scheduled"
	}
}

func mapPaymentMethod(method string) string {
	switch method {
	case "cash", "transfer", "other":
		return method
	case "card", "promptpay":
		// The normalized schema's method CHECK is cash/transfer/other; card
		// and promptpay are recorded under `other` with nothing lost (the
		// amount and timestamp are what the receipt needs).
		return "other"
	default:
		return "cash"
	}
}

func nullableUser(id string, known map[string]bool, report *Report, what string) sql.NullString {
	if id == "" {
		return sql.NullString{}
	}
	if known == nil || known[id] {
		return sql.NullString{String: id, Valid: true}
	}
	if what != "" {
		report.warnf("%s: staff id %q is unknown, reference cleared", what, id)
	}
	return sql.NullString{}
}

func joinNotes(notes []documentNote) string {
	lines := make([]string, 0, len(notes))
	for _, note := range notes {
		body := strings.TrimSpace(note.Body)
		if body == "" {
			continue
		}
		prefix := ""
		if strings.TrimSpace(note.CreatedAt) != "" {
			prefix = "[" + note.CreatedAt + "] "
		}
		lines = append(lines, prefix+body)
	}
	return strings.Join(lines, "\n")
}

func joinDiagnoses(diagnoses []documentDiagnosis) string {
	descriptions := make([]string, 0, len(diagnoses))
	for _, diagnosis := range diagnoses {
		if strings.TrimSpace(diagnosis.Description) != "" {
			descriptions = append(descriptions, diagnosis.Description)
		}
	}
	return strings.Join(descriptions, "; ")
}

// kgToGrams parses a decimal kilograms string (document vitals) into grams.
func kgToGrams(kg string) (int64, bool) {
	value := strings.TrimSpace(kg)
	if value == "" {
		return 0, false
	}
	var kilograms float64
	if _, err := fmt.Sscanf(value, "%g", &kilograms); err != nil || kilograms <= 0 {
		return 0, false
	}
	return int64(kilograms*1000 + 0.5), true
}

func parseFloat(value string) *float64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	var number float64
	if _, err := fmt.Sscanf(value, "%g", &number); err != nil {
		return nil
	}
	return &number
}

func int64Value(value *float64) int64 {
	if value == nil {
		return 0
	}
	return int64(*value + 0.5)
}

func nullInt64(ok bool, value int64) sql.NullInt64 {
	if !ok {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: value, Valid: true}
}

func nullFloat64(value *float64) sql.NullFloat64 {
	if value == nil {
		return sql.NullFloat64{}
	}
	return sql.NullFloat64{Float64: *value, Valid: true}
}

// deriveInvoiceStatus maps the document status and settles
// draft/posted against the document's payment ledger (negative payments
// subtract).
func deriveInvoiceStatus(status string, total int64, payments []documentPayment, invoiceID string) string {
	if status == "void" {
		return "void"
	}
	var paid int64
	for _, payment := range payments {
		if payment.InvoiceID != invoiceID {
			continue
		}
		paid += payment.Amount
	}
	switch {
	case paid >= total:
		return "paid"
	case paid > 0:
		return "partial"
	default:
		return "unpaid"
	}
}
