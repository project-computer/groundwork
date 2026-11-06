-- 001: clinics, users, roles, user_roles, sessions.
CREATE TABLE clinics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'THB',
    locale TEXT NOT NULL DEFAULT 'th',
    timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

INSERT INTO roles (id, name) VALUES
    ('role-admin', 'admin'),
    ('role-veterinarian', 'veterinarian'),
    ('role-receptionist', 'receptionist'),
    ('role-pharmacist', 'pharmacist');

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    username TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (clinic_id, username)
);
CREATE INDEX idx_users_clinic ON users(clinic_id);

CREATE TABLE user_roles (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);
