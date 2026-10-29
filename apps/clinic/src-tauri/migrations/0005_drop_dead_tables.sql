-- The VetDesk tables from 0002 (patients, appointments, medical_records,
-- clinic_settings) have no readers: since 0003 the app persists the single
-- clinic_state document, and the legacy sidecar that queried these tables is
-- deleted. Children drop before parents so FK enforcement stays quiet.
DROP TABLE IF EXISTS medical_records;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS patients;
DROP TABLE IF EXISTS clinic_settings;
