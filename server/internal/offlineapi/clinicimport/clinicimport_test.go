package clinicimport

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/project-computer/groundwork/server/internal/offlineapi/db"
)

const sampleDocument = `{
  "clinic": {
    "id": "clinic-01", "name": "Happy Paws", "timezone": "Asia/Bangkok",
    "currency": "THB", "vatRate": 7, "address": "1 Sukhumvit", "phone": "02 234 5678"
  },
  "users": [
    { "id": "u-admin", "name": "Somchai", "role": "admin", "active": true },
    { "id": "u-vet", "name": "Somchai", "role": "vet", "active": true },
    { "id": "u-front", "name": "Ploy", "role": "reception", "active": false }
  ],
  "owners": [
    { "id": "o-1", "name": "Nok", "phone": "0812345678", "email": "nok@example.com", "address": "12 Sukhumvit" }
  ],
  "patients": [
    {
      "id": "p-1", "ownerId": "o-1", "mrn": "PT-2026-0001", "name": "Mochi",
      "species": "Cat", "breed": "mix", "sex": "Female (spayed)",
      "birthDate": "2021-03-01", "weightKg": "4.0", "microchip": "98511",
      "allergies": ["penicillin"], "medicalAlerts": ["aggressive"]
    },
    { "id": "p-2", "ownerId": "o-ghost", "mrn": "PT-2026-0002", "name": "Ghost", "species": "Dog", "sex": "Male" }
  ],
  "appointments": [
    { "id": "a-1", "patientId": "p-1", "startsAt": "2026-11-01T09:00:00Z", "durationMin": 30, "reason": "checkup", "vetId": "u-vet", "status": "booked" },
    { "id": "a-2", "patientId": "p-1", "startsAt": "2026-11-02T09:00:00Z", "durationMin": 30, "reason": "vaccine", "vetId": "u-ghost", "status": "checked_in" },
    { "id": "a-3", "patientId": "p-1", "startsAt": "2026-11-03T09:00:00Z", "durationMin": 30, "reason": "follow-up", "vetId": "u-vet", "status": "in_consult" }
  ],
  "encounters": [
    {
      "id": "e-1", "patientId": "p-1", "appointmentId": "a-1", "attendingId": "u-vet",
      "status": "closed", "openedAt": "2026-11-01T09:05:00Z", "closedAt": "2026-11-01T09:40:00Z",
      "vitals": { "weightKg": "4.2", "tempC": "38.6", "heartRate": "96", "respRate": "24" },
      "notes": [
        { "id": "n-1", "authorId": "u-vet", "body": "mild plaque", "createdAt": "2026-11-01T09:10:00Z" },
        { "id": "n-2", "authorId": "u-vet", "body": "amended: mild plaque + gingivitis", "createdAt": "2026-11-01T09:30:00Z", "amends": "n-1", "amendReason": "completeness" }
      ],
      "diagnoses": [
        { "id": "d-1", "description": "gingivitis", "status": "confirmed" }
      ],
      "prescriptions": [
        { "id": "rx-1", "productId": "prod-amox", "medication": "Amoxicillin 250mg", "dose": "1 tab", "route": "PO", "frequency": "BID", "duration": "7 days", "quantity": 14, "prescriberId": "u-vet" },
        { "id": "rx-2", "medication": "free-form med", "dose": "0.5 ml", "route": "SC", "frequency": "SID", "duration": "3 days", "quantity": 2, "prescriberId": "u-ghost" }
      ]
    },
    {
      "id": "e-2", "patientId": "p-1", "attendingId": "u-vet", "status": "open",
      "openedAt": "2026-11-03T09:05:00Z",
      "vitals": { "weightKg": "", "tempC": "", "heartRate": "", "respRate": "" }
    }
  ],
  "products": [
    { "id": "prod-amox", "sku": "AMX-250", "name": "Amoxicillin 250mg", "unit": "tab", "unitPrice": 1500, "reorderThreshold": 0, "kind": "medication" },
    { "id": "prod-consult", "sku": "SRV-CON", "name": "Consultation", "unit": "visit", "unitPrice": 30000, "reorderThreshold": 0, "kind": "service" }
  ],
  "invoices": [
    {
      "id": "inv-1", "number": "INV-2026-0001", "ownerId": "o-1", "encounterId": "e-1",
      "status": "posted", "createdAt": "2026-11-01T09:45:00Z",
      "items": [
        { "id": "ii-1", "description": "Consultation", "quantity": 1, "unitPrice": 30000, "productId": "prod-consult" },
        { "id": "ii-2", "description": "Amoxicillin 250mg", "quantity": 14, "unitPrice": 1500, "productId": "prod-amox" }
      ]
    },
    { "id": "inv-2", "number": "INV-2026-0002", "ownerId": "o-1", "status": "draft", "createdAt": "2026-11-02T10:00:00Z",
      "items": [ { "id": "ii-3", "description": "Nail trim", "quantity": 1, "unitPrice": 25000 } ] },
    { "id": "inv-3", "number": "INV-2026-0003", "ownerId": "o-1", "status": "void", "createdAt": "2026-11-02T11:00:00Z",
      "items": [ { "id": "ii-4", "description": "mistake", "quantity": 1, "unitPrice": 10000 } ] }
  ],
  "payments": [
    { "id": "pay-1", "invoiceId": "inv-1", "amount": 40000, "method": "cash", "receivedAt": "2026-11-01T09:50:00Z" },
    { "id": "pay-2", "invoiceId": "inv-1", "amount": 10500, "method": "promptpay", "receivedAt": "2026-11-01T09:55:00Z" },
    { "id": "pay-3", "invoiceId": "inv-1", "amount": -5000, "method": "cash", "receivedAt": "2026-11-01T10:00:00Z", "kind": "refund", "refundOf": "pay-1", "note": "partial refund" }
  ],
  "vaccinations": [
    { "id": "vac-1", "patientId": "p-1", "vaccineName": "rabies", "administeredAt": "2026-11-01T09:35:00Z", "vetId": "u-vet" }
  ],
  "inventoryItems": [ { "id": "i-1", "name": "gauze", "category": "supply", "unit": "pack", "reorderLevel": 5, "sellingPrice": 2000 } ],
  "inventoryLots": [],
  "stockMovements": [],
  "suppliers": [ { "id": "s-1", "name": "ThaiVet Pharma" } ],
  "caseTransfers": [],
  "audit": [
    { "id": "aud-1", "actorId": "u-vet", "action": "visit.closed", "entityType": "visit", "entityId": "e-1", "summary": "closed", "occurredAt": "2026-11-01T09:40:00Z" }
  ],
  "outbox": []
}`

func importSample(t *testing.T) (*sql.DB, *Report) {
	t.Helper()
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	doc, err := Parse([]byte(sampleDocument))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	tx, err := conn.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	report, err := Run(context.Background(), db.New(tx), doc)
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}
	return conn, report
}

func TestImportJourney(t *testing.T) {
	conn, report := importSample(t)
	ctx := context.Background()
	q := db.New(conn)

	if report.Counts["users"] != 3 || report.Counts["owners"] != 1 ||
		report.Counts["patients"] != 1 || report.Counts["appointments"] != 3 ||
		report.Counts["encounters"] != 2 || report.Counts["products"] != 2 ||
		report.Counts["invoices"] != 3 || report.Counts["payments"] != 3 ||
		report.Counts["auditEvents"] != 1 || report.Counts["weightObservations"] != 1 {
		t.Fatalf("unexpected counts: %+v", report.Counts)
	}
	if report.Skipped["vaccinations"] != 1 || report.Skipped["inventoryItems"] != 1 ||
		report.Skipped["suppliers"] != 1 {
		t.Fatalf("unexpected skips: %+v", report.Skipped)
	}

	// Users: username derivation with collision suffix, role mapping, PIN reset.
	// The receptionist is inactive, so the active-username lookup doesn't see
	// them — assert through the table instead.
	var frontRoles int64
	if err := conn.QueryRow(
		`SELECT COUNT(*) FROM user_roles ur JOIN roles r ON r.id = ur.role_id
		 WHERE ur.user_id = ? AND r.name = 'receptionist'`, "u-front",
	).Scan(&frontRoles); err != nil || frontRoles != 1 {
		t.Fatalf("reception role mapping (roles=%d err=%v)", frontRoles, err)
	}
	var frontActive int64
	if err := conn.QueryRow(`SELECT active FROM users WHERE id = 'u-front'`).Scan(&frontActive); err != nil || frontActive != 0 {
		t.Fatalf("inactive member imported as active (active=%d err=%v)", frontActive, err)
	}
	if _, err := q.GetUserByUsername(ctx, db.GetUserByUsernameParams{ClinicID: "clinic-01", Username: "somchai"}); err != nil {
		t.Fatalf("first somchai: %v", err)
	}
	if _, err := q.GetUserByUsername(ctx, db.GetUserByUsernameParams{
		ClinicID: "clinic-01", Username: "somchai." + lastSegment(onlyLettersDigits("u-vet"), 4),
	}); err != nil {
		t.Fatalf("collision username not derived: %v", err)
	}
	vet, err := q.GetUserByUsername(ctx, db.GetUserByUsernameParams{ClinicID: "clinic-01", Username: "somchai"})
	if err != nil {
		t.Fatalf("first somchai: %v", err)
	}
	if vet.PinHash != "" {
		t.Fatal("imported users must not carry a usable hash")
	}

	// Patient: species/sex normalized, clinical data folded into notes.
	pet, err := q.GetPet(ctx, db.GetPetParams{ClinicID: "clinic-01", ID: "p-1"})
	if err != nil {
		t.Fatalf("get pet: %v", err)
	}
	if pet.Species != "cat" || pet.Sex != "female" || pet.Mrn != "PT-2026-0001" {
		t.Fatalf("pet normalization wrong: %+v", pet)
	}
	for _, fragment := range []string{"allergies: penicillin", "medical alerts: aggressive", "spayed", "baseline weight: 4.0 kg"} {
		if !strings.Contains(pet.Notes, fragment) {
			t.Fatalf("notes missing %q: %q", fragment, pet.Notes)
		}
	}
	// The patient with an unknown owner is skipped with a warning, not imported.
	if _, err := q.GetPet(ctx, db.GetPetParams{ClinicID: "clinic-01", ID: "p-2"}); err == nil {
		t.Fatal("ghost-owned patient must not import")
	}

	// Appointment status mapping + unknown vet cleared.
	a1, err := q.GetAppointment(ctx, db.GetAppointmentParams{ClinicID: "clinic-01", ID: "a-1"})
	if err != nil || a1.Status != "scheduled" {
		t.Fatalf("booked → scheduled failed: %+v %v", a1, err)
	}
	a2, _ := q.GetAppointment(ctx, db.GetAppointmentParams{ClinicID: "clinic-01", ID: "a-2"})
	if a2.Status != "arrived" || a2.VeterinarianID.Valid {
		t.Fatalf("checked_in → arrived with cleared ghost vet failed: %+v", a2)
	}
	a3, _ := q.GetAppointment(ctx, db.GetAppointmentParams{ClinicID: "clinic-01", ID: "a-3"})
	if a3.Status != "in_progress" {
		t.Fatalf("in_consult → in_progress failed: %+v", a3)
	}

	// Products became services + a medication catalog entry.
	service, err := q.GetService(ctx, db.GetServiceParams{ClinicID: "clinic-01", ID: "prod-consult"})
	if err != nil || service.Category != "service" || service.UnitPriceSatang != 30000 {
		t.Fatalf("service product: %+v %v", service, err)
	}
	amox, err := q.GetService(ctx, db.GetServiceParams{ClinicID: "clinic-01", ID: "prod-amox"})
	if err != nil || amox.Category != "product" {
		t.Fatalf("medication product as service: %+v %v", amox, err)
	}
	if _, err := q.GetMedication(ctx, db.GetMedicationParams{ClinicID: "clinic-01", ID: "prod-amox"}); err != nil {
		t.Fatalf("medication catalog entry missing: %v", err)
	}

	// Encounter: vitals on the consultation, weight in the history, notes
	// flattened with timestamps, diagnoses and prescriptions linked.
	consultation, err := q.GetConsultation(ctx, db.GetConsultationParams{ClinicID: "clinic-01", ID: "e-1"})
	if err != nil {
		t.Fatalf("get consultation: %v", err)
	}
	if !consultation.WeightGrams.Valid || consultation.WeightGrams.Int64 != 4200 {
		t.Fatalf("weight = %+v, want 4200g", consultation.WeightGrams)
	}
	if consultation.TemperatureCelsius.Float64 < 38.5 || consultation.HeartRateBpm.Int64 != 96 ||
		consultation.RespiratoryRateBpm.Int64 != 24 {
		t.Fatalf("vitals wrong: %+v", consultation)
	}
	if consultation.Status != "completed" || !consultation.CompletedAt.Valid {
		t.Fatalf("closed encounter not completed: %+v", consultation)
	}
	if !strings.Contains(consultation.Notes, "[2026-11-01T09:30:00Z] amended:") {
		t.Fatalf("notes lost the edit trail: %q", consultation.Notes)
	}
	weights, err := q.ListPetWeights(ctx, db.ListPetWeightsParams{ClinicID: "clinic-01", PetID: "p-1"})
	if err != nil || len(weights) != 1 || weights[0].WeightGrams != 4200 {
		t.Fatalf("pet_weights rows = %v %v, want one 4200g row", weights, err)
	}
	openEncounter, _ := q.GetConsultation(ctx, db.GetConsultationParams{ClinicID: "clinic-01", ID: "e-2"})
	if openEncounter.Status != "open" || openEncounter.CompletedAt.Valid {
		t.Fatalf("open encounter imported as closed: %+v", openEncounter)
	}

	diagnoses, _ := q.ListDiagnoses(ctx, db.ListDiagnosesParams{ClinicID: "clinic-01", ConsultationID: "e-1"})
	if len(diagnoses) != 1 || diagnoses[0].Description != "gingivitis" || diagnoses[0].Notes != "confirmed" {
		t.Fatalf("diagnoses = %+v", diagnoses)
	}

	prescriptions, _ := q.ListPrescriptionsByConsultation(ctx, db.ListPrescriptionsByConsultationParams{
		ClinicID: "clinic-01", ConsultationID: "e-1",
	})
	if len(prescriptions) != 2 {
		t.Fatalf("prescriptions = %d, want 2", len(prescriptions))
	}
	items, _ := q.ListPrescriptionItems(ctx, db.ListPrescriptionItemsParams{
		ClinicID: "clinic-01", PrescriptionID: prescriptions[0].ID,
	})
	if len(items) != 1 || !items[0].MedicationID.Valid || items[0].MedicationID.String != "prod-amox" {
		t.Fatalf("catalog link lost: %+v", items)
	}

	// Invoices: totals recomputed, status derived from the document ledger.
	invoice, err := q.GetInvoice(ctx, db.GetInvoiceParams{ClinicID: "clinic-01", ID: "inv-1"})
	if err != nil {
		t.Fatalf("get invoice: %v", err)
	}
	if invoice.InvoiceNumber != "INV-2026-0001" || invoice.SubtotalSatang != 51000 ||
		invoice.TotalSatang != 51000 {
		t.Fatalf("invoice totals wrong: %+v", invoice)
	}
	// Ledger: 40000 + 10500 − 5000 = 45500 of 51000 → partial.
	if invoice.Status != "partial" {
		t.Fatalf("status = %s, want partial", invoice.Status)
	}
	if !invoice.ConsultationID.Valid || invoice.ConsultationID.String != "e-1" {
		t.Fatalf("encounter link lost: %+v", invoice)
	}
	draft, _ := q.GetInvoice(ctx, db.GetInvoiceParams{ClinicID: "clinic-01", ID: "inv-2"})
	if draft.Status != "unpaid" {
		t.Fatalf("draft → unpaid failed: %s", draft.Status)
	}
	voided, _ := q.GetInvoice(ctx, db.GetInvoiceParams{ClinicID: "clinic-01", ID: "inv-3"})
	if voided.Status != "void" {
		t.Fatalf("void must stay void: %s", voided.Status)
	}

	// Payments: refund imported as a refunded row with the absolute amount.
	payments, _ := q.ListPaymentsByInvoice(ctx, db.ListPaymentsByInvoiceParams{
		ClinicID: "clinic-01", InvoiceID: "inv-1",
	})
	if len(payments) != 3 {
		t.Fatalf("payments = %d, want 3", len(payments))
	}
	for _, payment := range payments {
		if payment.AmountSatang <= 0 {
			t.Fatalf("amount must be positive after mapping: %+v", payment)
		}
		if payment.Status == "refunded" && !strings.Contains(payment.Reference, "pay-1") {
			t.Fatalf("refund lost its reference: %+v", payment)
		}
		// promptpay lands on `other` (schema CHECK), nothing else lost.
		if payment.ID == "pay-2" && payment.Method != "other" {
			t.Fatalf("promptpay method mapping: %+v", payment)
		}
	}

	// Audit history preserved.
	events, err := q.ListAuditLogs(ctx, db.ListAuditLogsParams{ClinicID: "clinic-01", Limit: 10})
	if err != nil || len(events) != 1 || events[0].ID != "aud-1" {
		t.Fatalf("audit events = %v %v", events, err)
	}
}

func TestImportRollsBackCompletely(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	// Two invoices sharing one number violate the (clinic_id, invoice_number)
	// uniqueness — Run must fail and the caller's rollback must leave
	// nothing behind, including the clinic and users created earlier.
	duplicate := strings.Replace(sampleDocument, `"number": "INV-2026-0002"`, `"number": "INV-2026-0001"`, 1)
	doc, err := Parse([]byte(duplicate))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	tx, err := conn.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	if _, err := Run(context.Background(), db.New(tx), doc); err == nil {
		t.Fatal("duplicate invoice number must fail the import")
	}
	if err := tx.Rollback(); err != nil {
		t.Fatalf("rollback: %v", err)
	}
	var clinics int64
	if err := conn.QueryRow("SELECT COUNT(*) FROM clinics").Scan(&clinics); err != nil || clinics != 0 {
		t.Fatalf("rollback left %d clinics (err=%v)", clinics, err)
	}
	var users int64
	if err := conn.QueryRow("SELECT COUNT(*) FROM users").Scan(&users); err != nil || users != 0 {
		t.Fatalf("rollback left %d users (err=%v)", users, err)
	}
}

// TestParseRejectsDriftedShapes pins the structural guard: a collection that
// is present but not an array means the shape drifted and importing would
// silently drop data.
func TestParseRejectsDriftedShapes(t *testing.T) {
	if _, err := Parse([]byte(`{"users": {}}`)); err == nil {
		t.Fatal("non-array collection must be rejected")
	}
	if _, err := Parse([]byte(`{"clinic": {"id": "x"}}`)); err == nil {
		t.Fatal("document without clinic.name must be rejected")
	}
	if _, err := Parse([]byte(`not json`)); err == nil {
		t.Fatal("non-JSON must be rejected")
	}

	// The pinned fixture parses: it is the shape's single source.
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "fixtures", "clinic-document.json"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	if _, err := Parse(raw); err != nil {
		t.Fatalf("pinned fixture must parse: %v", err)
	}
}
