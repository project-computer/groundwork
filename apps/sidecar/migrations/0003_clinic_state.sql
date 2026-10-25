-- Full clinic state document (Vettera model). The frontend reducer owns the
-- domain logic; SQLite stores the committed document atomically.
CREATE TABLE IF NOT EXISTS clinic_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
