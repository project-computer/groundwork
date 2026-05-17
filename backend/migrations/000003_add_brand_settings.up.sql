CREATE TABLE brand_settings (
    id SERIAL PRIMARY KEY,
    clinic_id INT REFERENCES clinics(id),
    primary_color VARCHAR(7) NOT NULL DEFAULT '#1a8a8a',
    primary_foreground VARCHAR(7) NOT NULL DEFAULT '#ffffff',
    accent_color VARCHAR(7) NOT NULL DEFAULT '#d5eded',
    accent_foreground VARCHAR(7) NOT NULL DEFAULT '#0d4a4a',
    secondary_color VARCHAR(7) NOT NULL DEFAULT '#e0e8ec',
    secondary_foreground VARCHAR(7) NOT NULL DEFAULT '#1e2d3d',
    sidebar_color VARCHAR(7) NOT NULL DEFAULT '#1a2533',
    sidebar_foreground VARCHAR(7) NOT NULL DEFAULT '#dfe5ea',
    sidebar_primary VARCHAR(7) NOT NULL DEFAULT '#1a8a8a',
    sidebar_accent VARCHAR(7) NOT NULL DEFAULT '#243340',
    chart_1 VARCHAR(7) NOT NULL DEFAULT '#1a8a8a',
    chart_2 VARCHAR(7) NOT NULL DEFAULT '#3aae8e',
    chart_3 VARCHAR(7) NOT NULL DEFAULT '#2d4f72',
    chart_4 VARCHAR(7) NOT NULL DEFAULT '#c4a035',
    chart_5 VARCHAR(7) NOT NULL DEFAULT '#b84a1a',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO brand_settings (clinic_id) VALUES (1);
