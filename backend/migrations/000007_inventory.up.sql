-- 000007_inventory
-- Per slices 0007 + 0008: suppliers, inventory_items, inventory_lots (batch stock),
-- and the append-only stock_movements ledger. See docs/issues/0007 and 0008.

CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    clinic_id INT NOT NULL REFERENCES clinics(id),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_suppliers_clinic_id ON suppliers(clinic_id);

CREATE TABLE inventory_items (
    id SERIAL PRIMARY KEY,
    clinic_id INT NOT NULL REFERENCES clinics(id),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('medicine', 'vaccine', 'equipment', 'supply')),
    unit VARCHAR(50) NOT NULL,
    reorder_level INT NOT NULL DEFAULT 0,
    selling_price NUMERIC(12,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_inventory_items_clinic_id ON inventory_items(clinic_id);
CREATE INDEX idx_inventory_items_category  ON inventory_items(category);

CREATE TABLE inventory_lots (
    id SERIAL PRIMARY KEY,
    clinic_id INT NOT NULL REFERENCES clinics(id),
    item_id INT NOT NULL REFERENCES inventory_items(id),
    lot_number VARCHAR(120) NOT NULL,
    quantity INT NOT NULL CHECK (quantity >= 0),
    expiry_date DATE,
    supplier_id INT REFERENCES suppliers(id),
    cost_per_unit NUMERIC(12,2),
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,
    UNIQUE(item_id, lot_number)
);

CREATE INDEX idx_inventory_lots_item_id    ON inventory_lots(item_id);
CREATE INDEX idx_inventory_lots_clinic_id  ON inventory_lots(clinic_id);
CREATE INDEX idx_inventory_lots_expiry     ON inventory_lots(expiry_date);

-- Append-only ledger: no UPDATE/DELETE endpoints exist (slice 0008).
CREATE TABLE stock_movements (
    id SERIAL PRIMARY KEY,
    clinic_id INT NOT NULL REFERENCES clinics(id),
    lot_id INT NOT NULL REFERENCES inventory_lots(id),
    delta INT NOT NULL,
    reason VARCHAR(20) NOT NULL CHECK (reason IN ('stock_in', 'stock_out', 'adjustment', 'waste')),
    ref_type VARCHAR(30),
    ref_id INT,
    user_id INT NOT NULL REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_stock_movements_lot_id     ON stock_movements(lot_id);
CREATE INDEX idx_stock_movements_clinic_id  ON stock_movements(clinic_id);
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at);
