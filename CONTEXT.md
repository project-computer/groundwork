# VetCare Clinic Management System

VetCare is the first application built on the Groundwork foundation — free, local-first business software (see `README.md`).

A veterinary clinic management system covering patient medical records, appointments, vaccinations, and inventory. Single-clinic at launch, multi-branch ready via schema.

## Language

### People & Animals

**Patient**:
An animal receiving care at a clinic. Identified by a unique Medical Record Number (MRN).
_Avoid_: Pet, animal.

**Owner**:
The person responsible for one or more Patients. Primary recipient of reminders and the contact for clinical communication. An Owner may carry an optional secondary contact (e.g. a partner) for joint-custody cases without becoming a many-to-many relationship.
_Avoid_: Client, customer, guardian, pet parent.

**Veterinarian**:
A clinical staff User licensed to diagnose, prescribe, and administer treatments.
_Avoid_: Vet (informal), doctor.

**User**:
Any authenticated clinic staff account (admin, veterinarian, receptionist, pharmacist).
_Avoid_: Account (overloaded).

### Clinical Records

**Visit**:
A single clinical encounter with a Patient (OPD or IPD). The atomic unit of medical history. Carries vitals, diagnosis, treatment, medications, notes, and images.
_Avoid_: Medical record, encounter, consultation, appointment.

**Medical Record**:
The derived, ordered set of all Visits (and Vaccinations) for one Patient. Not a table — a read model surfaced as the "medical timeline."
_Avoid_: Patient file, chart, history (ambiguous).

**Medical Record Number (MRN)**:
A unique human-readable identifier assigned to each Patient (e.g. `PT-2026-0042`). Used for search.
_Avoid_: Patient ID, record number.

**Vaccination**:
A discrete clinical event in which a vaccine was administered to a Patient. Carries vaccine name, lot, date, administering vet, and a computed next-due date. May optionally link to the Visit where it was given.
_Avoid_: Shot, immunization, vaccine (the substance).

**Vaccine Protocol**:
A canonical schedule for a vaccine (name, species, default interval in days). Drives the default `next_due_date` on a Vaccination. Globally maintained, not per-clinic.
_Avoid_: Vaccine schedule, booster series.

### Scheduling & Workflow

**Appointment**:
A scheduled future encounter between a Patient and a Veterinarian. May result in a Visit when it occurs.
_Avoid_: Booking, reservation, slot.

**CaseTransfer**:
A shareable bundle of one Patient's selected Visits, sent from one clinic to another via a token-protected link. On receipt, the receiving clinic creates its own copy of the Patient and Visits, stamped with `original_clinic_id` for audit. Tenant isolation is preserved — no shared rows across clinics.
_Avoid_: Referral (informal), handoff.

### Inventory

**InventoryItem**:
A clinic's stock-keeping definition for a medicine, vaccine, equipment, or supply (e.g. "Amoxicillin 250mg"). Carries category, unit, reorder level, and selling price. Tenant-scoped.
_Avoid_: Product, SKU.

**InventoryLot**:
A specific batch of an InventoryItem received from a Supplier — identified by lot number, with its own quantity, expiry date, and cost per unit. Quantity-on-hand for an item is the sum of its active lots.
_Avoid_: Batch (informal), stock entry.

**StockMovement**:
An append-only ledger entry recording a change in an InventoryLot's quantity (`stock_in`, `stock_out`, `adjustment`, `waste`). Current quantity is a cached projection of the ledger.
_Avoid_: Transaction (overloaded), adjustment (subtype, not the whole concept).

**Supplier**:
An external vendor an InventoryLot was purchased from. Tenant-scoped.
_Avoid_: Vendor, distributor, manufacturer.

### Operations

**Clinic**:
A tenant in the system. Every operational record (Patient, Visit, InventoryItem, etc.) belongs to exactly one Clinic. Multi-branch is deferred: a single `ClinicContext` resolver returns `1` today and will read from a JWT claim when multi-branch goes live.
_Avoid_: Branch, location, practice (overloaded).

**NotificationLog**:
A persisted record of one attempt to send a notification (vaccination reminder, appointment reminder, staff alert) via a specific channel (LINE, SMS, Email). Carries delivery state.
_Avoid_: Message, alert (subtype, not the whole concept).

**SecondaryContact**:
An optional partner/co-owner contact stored on an Owner (name + phone). Does not create a second Owner row; exists for joint-custody reminder delivery.
_Avoid_: Co-owner (implies a second entity), secondary owner.
