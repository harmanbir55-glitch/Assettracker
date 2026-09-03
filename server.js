// This is the main backend file. It starts the server and has all the routes
// (API endpoints) the front end calls to get or change data.
const path = require('path');
const express = require('express');
const db = require('./db'); // this connects to the sqlite database, set up in db.js

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json()); // lets us read JSON data sent from the front end (like when adding an asset)
app.use(express.static(path.join(__dirname, 'public'))); // serves the HTML/CSS/JS files in the public folder

// these are the only status values an asset is allowed to have
const validStatuses = ['Available', 'Assigned', 'Repair', 'Retired'];

// GET /api/dashboard
// sends back the numbers shown on the dashboard cards at the top of the page
// (total assets, how many are assigned/available/in repair, and warranties ending soon)
app.get('/api/dashboard', (req, res) => {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'Assigned' THEN 1 ELSE 0 END) AS assigned,
      SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN status = 'Repair' THEN 1 ELSE 0 END) AS repair
    FROM assets
  `).get();

  const warrantySoon = db.prepare(`
    SELECT COUNT(*) AS count
    FROM assets
    WHERE warranty_end IS NOT NULL
      AND date(warranty_end) BETWEEN date('now') AND date('now', '+90 days')
  `).get().count;

  // combine the counts with the warranty number and send it all back as one object
  res.json({ ...totals, warrantySoon });
});

// GET /api/employees
// sends back the full list of employees, sorted by name (used to fill the "assign to" dropdown)
app.get('/api/employees', (req, res) => {
  const employees = db.prepare('SELECT * FROM employees ORDER BY name').all();
  res.json(employees);
});

// POST /api/employees
// adds a new employee to the database
app.post('/api/employees', (req, res) => {
  const { name, email, department } = req.body;

  // name and department are required, email is optional
  if (!name || !department) {
    return res.status(400).json({ message: 'Name and department are required.' });
  }

  try {
    const result = db.prepare(
      'INSERT INTO employees (name, email, department) VALUES (?, ?, ?)'
    ).run(name.trim(), email?.trim() || null, department.trim());

    // grab the employee we just added so we can send it back with its new id
    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(employee);
  } catch (error) {
    // this error code means the email is already used by someone else
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ message: 'That employee email already exists.' });
    }
    res.status(500).json({ message: 'Could not add employee.' });
  }
});

// GET /api/assets
// sends back the list of assets shown in the table.
// also handles searching and filtering using the query string, e.g. ?search=dell&status=Assigned
app.get('/api/assets', (req, res) => {
  const { search = '', status = '', type = '' } = req.query;

  // start with a query that gets every asset plus the name/department of whoever it's assigned to
  let sql = `
    SELECT
      assets.*,
      employees.name AS employee_name,
      employees.department AS employee_department
    FROM assets
    LEFT JOIN employees ON assets.employee_id = employees.id
    WHERE 1 = 1
  `;
  const params = []; // holds the values that go in place of the "?" marks above, in order

  // if the user typed something in the search box, look for it in a bunch of columns at once
  if (search) {
    sql += ` AND (
      assets.asset_tag LIKE ? OR
      assets.brand LIKE ? OR
      assets.model LIKE ? OR
      assets.serial_number LIKE ? OR
      employees.name LIKE ?
    )`;
    const value = `%${search}%`; // % means "match anything before/after", so it's a partial match
    params.push(value, value, value, value, value);
  }

  // only add the status filter if one was picked
  if (status) {
    sql += ' AND assets.status = ?';
    params.push(status);
  }

  // only add the type filter if one was picked
  if (type) {
    sql += ' AND assets.type = ?';
    params.push(type);
  }

  sql += ' ORDER BY assets.id DESC'; // newest assets first

  const assets = db.prepare(sql).all(...params);
  res.json(assets);
});

// GET /api/assets/:id
// sends back one specific asset (by its id) along with its maintenance history.
// this is used for the "View" popup.
app.get('/api/assets/:id', (req, res) => {
  const asset = db.prepare(`
    SELECT assets.*, employees.name AS employee_name
    FROM assets
    LEFT JOIN employees ON assets.employee_id = employees.id
    WHERE assets.id = ?
  `).get(req.params.id);

  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  // get all the repair/maintenance records for this asset, newest first
  const maintenance = db.prepare(`
    SELECT * FROM maintenance_records
    WHERE asset_id = ?
    ORDER BY service_date DESC, id DESC
  `).all(req.params.id);

  // send the asset details and its maintenance list together
  res.json({ ...asset, maintenance });
});

// POST /api/assets
// creates a new asset from the "Add Asset" form
app.post('/api/assets', (req, res) => {
  const {
    asset_tag,
    type,
    brand,
    model,
    serial_number,
    status = 'Available',
    employee_id,
    purchase_date,
    warranty_end,
    notes
  } = req.body;

  // these fields have to be filled in, everything else is optional
  if (!asset_tag || !type || !brand || !model) {
    return res.status(400).json({ message: 'Asset tag, type, brand and model are required.' });
  }

  // make sure the status is one of the four allowed values
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid asset status.' });
  }

  const assignedEmployee = employee_id || null;
  // if an employee was picked but the status was left as "Available", switch it to "Assigned"
  // so the data makes sense (can't be assigned to someone and still be available)
  const finalStatus = assignedEmployee && status === 'Available' ? 'Assigned' : status;

  try {
    const result = db.prepare(`
      INSERT INTO assets
      (asset_tag, type, brand, model, serial_number, status, employee_id, purchase_date, warranty_end, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      asset_tag.trim(),
      type.trim(),
      brand.trim(),
      model.trim(),
      serial_number?.trim() || null,
      finalStatus,
      assignedEmployee,
      purchase_date || null,
      warranty_end || null,
      notes?.trim() || null
    );

    // fetch the asset we just created so we can send it back with its new id
    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(asset);
  } catch (error) {
    // this error means the asset_tag is already used (it has to be unique)
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ message: 'Asset tag must be unique.' });
    }
    res.status(500).json({ message: 'Could not add asset.' });
  }
});

// PUT /api/assets/:id
// updates an existing asset with new values from the edit form
app.put('/api/assets/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);

  if (!current) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  // build the updated version of the asset: use the new value if one was sent,
  // otherwise keep whatever it already had
  const updated = {
    asset_tag: req.body.asset_tag ?? current.asset_tag,
    type: req.body.type ?? current.type,
    brand: req.body.brand ?? current.brand,
    model: req.body.model ?? current.model,
    serial_number: req.body.serial_number ?? current.serial_number,
    status: req.body.status ?? current.status,
    employee_id: req.body.employee_id === '' ? null : (req.body.employee_id ?? current.employee_id),
    purchase_date: req.body.purchase_date ?? current.purchase_date,
    warranty_end: req.body.warranty_end ?? current.warranty_end,
    notes: req.body.notes ?? current.notes
  };

  if (!validStatuses.includes(updated.status)) {
    return res.status(400).json({ message: 'Invalid asset status.' });
  }

  // keep the status in sync with whether an employee is assigned:
  // no employee but marked "Assigned" -> switch back to "Available"
  if (!updated.employee_id && updated.status === 'Assigned') {
    updated.status = 'Available';
  }

  // has an employee but marked "Available" -> switch to "Assigned"
  if (updated.employee_id && updated.status === 'Available') {
    updated.status = 'Assigned';
  }

  try {
    db.prepare(`
      UPDATE assets
      SET asset_tag = ?, type = ?, brand = ?, model = ?, serial_number = ?,
          status = ?, employee_id = ?, purchase_date = ?, warranty_end = ?, notes = ?
      WHERE id = ?
    `).run(
      updated.asset_tag,
      updated.type,
      updated.brand,
      updated.model,
      updated.serial_number || null,
      updated.status,
      updated.employee_id || null,
      updated.purchase_date || null,
      updated.warranty_end || null,
      updated.notes || null,
      req.params.id
    );

    // return the updated asset so the front end can refresh with the latest data
    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
    res.json(asset);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ message: 'Asset tag must be unique.' });
    }
    res.status(500).json({ message: 'Could not update asset.' });
  }
});

// DELETE /api/assets/:id
// removes an asset from the database completely (its maintenance records get
// deleted too because of the ON DELETE CASCADE rule in schema.sql)
app.delete('/api/assets/:id', (req, res) => {
  const result = db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);

  // result.changes tells us how many rows were actually deleted
  if (result.changes === 0) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  res.status(204).send(); // 204 = success, nothing to send back
});

// POST /api/assets/:id/maintenance
// adds a repair/maintenance record for an asset and moves the asset's
// status to "Repair" since it's now being worked on
app.post('/api/assets/:id/maintenance', (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  const { service_date, issue, action_taken, cost = 0 } = req.body;

  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  if (!service_date || !issue || !action_taken) {
    return res.status(400).json({ message: 'Service date, issue and action taken are required.' });
  }

  const result = db.prepare(`
    INSERT INTO maintenance_records (asset_id, service_date, issue, action_taken, cost)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, service_date, issue.trim(), action_taken.trim(), Number(cost) || 0);

  // once something needs maintenance, the asset counts as "in repair"
  db.prepare("UPDATE assets SET status = 'Repair' WHERE id = ?").run(req.params.id);

  const record = db.prepare('SELECT * FROM maintenance_records WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(record);
});

// start the server and listen for requests
app.listen(PORT, () => {
  console.log(`AssetTrack is running at http://localhost:${PORT}`);
});
