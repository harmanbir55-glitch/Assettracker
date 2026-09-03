// This file sets up the database connection and creates the tables if they
// don't exist yet. It also fills the database with some sample data the
// first time the app runs, so the page isn't empty on first load.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// this creates (or opens, if it already exists) the assettrack.db file
const dbPath = path.join(__dirname, 'assettrack.db');
const db = new Database(dbPath);

// read the table definitions from schema.sql and run them
// (CREATE TABLE IF NOT EXISTS means this is safe to run every time the server starts)
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// adds a few sample employees, assets and a maintenance record, but only if
// the tables are empty. this way it won't duplicate data every time the server restarts
function seedDatabase() {
  const employeeCount = db.prepare('SELECT COUNT(*) AS count FROM employees').get().count;

  if (employeeCount === 0) {
    const addEmployee = db.prepare(
      'INSERT INTO employees (name, email, department) VALUES (?, ?, ?)'
    );

    const insertMany = db.transaction(() => {
      addEmployee.run('Maya Patel', 'maya.patel@example.com', 'Finance');
      addEmployee.run('Daniel Wong', 'daniel.wong@example.com', 'Operations');
      addEmployee.run('Sophia Chen', 'sophia.chen@example.com', 'Human Resources');
      addEmployee.run('Noah Singh', 'noah.singh@example.com', 'IT');
    });

    insertMany();
  }

  const assetCount = db.prepare('SELECT COUNT(*) AS count FROM assets').get().count;

  if (assetCount === 0) {
    // build a quick lookup so we can go from an employee's name to their id
    // when adding the sample assets below
    const employees = db.prepare('SELECT id, name FROM employees').all();
    const employeeMap = Object.fromEntries(employees.map((employee) => [employee.name, employee.id]));

    const addAsset = db.prepare(`
      INSERT INTO assets
      (asset_tag, type, brand, model, serial_number, status, employee_id, purchase_date, warranty_end, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAssets = db.transaction(() => {
      addAsset.run('LT-1001', 'Laptop', 'Dell', 'Latitude 5440', 'DL5440-001', 'Assigned', employeeMap['Maya Patel'], '2025-09-15', '2028-09-15', 'Finance laptop');
      addAsset.run('LT-1002', 'Laptop', 'Lenovo', 'ThinkPad T14', 'LNT14-114', 'Available', null, '2026-02-10', '2029-02-10', 'Spare laptop');
      addAsset.run('MN-2001', 'Monitor', 'LG', '27UP600', 'LG27-8841', 'Assigned', employeeMap['Daniel Wong'], '2025-05-05', '2028-05-05', '4K office monitor');
      addAsset.run('PH-3001', 'Phone', 'Samsung', 'Galaxy S25', 'SGS25-662', 'Repair', employeeMap['Sophia Chen'], '2026-01-22', '2028-01-22', 'Screen damage reported');
      addAsset.run('LT-1003', 'Laptop', 'HP', 'EliteBook 840', 'HPE840-903', 'Assigned', employeeMap['Noah Singh'], '2024-11-12', '2027-11-12', 'IT support laptop');
    });

    insertAssets();
  }

  // add one sample maintenance record for the phone, so the "View" popup has
  // something to show for at least one asset
  const recordCount = db.prepare('SELECT COUNT(*) AS count FROM maintenance_records').get().count;

  if (recordCount === 0) {
    const phone = db.prepare("SELECT id FROM assets WHERE asset_tag = 'PH-3001'").get();
    if (phone) {
      db.prepare(`
        INSERT INTO maintenance_records (asset_id, service_date, issue, action_taken, cost)
        VALUES (?, ?, ?, ?, ?)
      `).run(phone.id, '2026-08-28', 'Cracked display', 'Sent to repair vendor for assessment', 0);
    }
  }
}

seedDatabase();

// export the db connection so server.js can run queries on it
module.exports = db;
