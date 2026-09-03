-- This file sets up the three tables the app uses.
-- an employee can have many assets, and an asset can have many maintenance records.

PRAGMA foreign_keys = ON; -- makes sure the FOREIGN KEY rules below are actually enforced

-- people who equipment can be assigned to
CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    department TEXT NOT NULL
);

-- the actual pieces of equipment (laptops, monitors, phones, etc.)
CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_tag TEXT NOT NULL UNIQUE, -- the label/id sticker on the device, has to be unique
    type TEXT NOT NULL,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    serial_number TEXT,
    status TEXT NOT NULL DEFAULT 'Available',
    employee_id INTEGER, -- who it's assigned to, empty if unassigned
    purchase_date TEXT,
    warranty_end TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- if an employee is deleted, don't delete their assets, just unassign them
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

-- repair/service history for each asset
CREATE TABLE IF NOT EXISTS maintenance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    service_date TEXT NOT NULL,
    issue TEXT NOT NULL,
    action_taken TEXT NOT NULL,
    cost REAL DEFAULT 0,
    -- if an asset is deleted, delete its maintenance history along with it
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);
