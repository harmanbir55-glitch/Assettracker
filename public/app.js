// This is the front-end script. It talks to the server's API and updates
// the page whenever data changes (loading assets, saving forms, etc).

// grab the three popup dialogs used in the app
const assetDialog = document.getElementById('assetDialog');
const detailsDialog = document.getElementById('detailsDialog');
const maintenanceDialog = document.getElementById('maintenanceDialog');

// grab the forms and the main table/dropdown elements
const assetForm = document.getElementById('assetForm');
const maintenanceForm = document.getElementById('maintenanceForm');
const assetTableBody = document.getElementById('assetTableBody');
const employeeSelect = document.getElementById('employeeId');
const emptyMessage = document.getElementById('emptyMessage');

let employees = []; // keeps the list of employees so we don't have to re-fetch it every time
let selectedAssetId = null; // remembers which asset's details popup is currently open

// helper function that wraps fetch() so we don't have to repeat the same
// error handling in every function below. every API call goes through this.
async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    let message = 'Something went wrong.';
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (error) {
      // Response did not contain JSON.
    }
    throw new Error(message);
  }

  // DELETE requests send back a 204 (no content), so there's nothing to parse
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

// fetches the dashboard numbers from the server and puts them into the
// summary cards at the top of the page
async function loadDashboard() {
  const data = await apiRequest('/api/dashboard');
  document.getElementById('totalCount').textContent = data.total || 0;
  document.getElementById('assignedCount').textContent = data.assigned || 0;
  document.getElementById('availableCount').textContent = data.available || 0;
  document.getElementById('repairCount').textContent = data.repair || 0;
  document.getElementById('warrantyCount').textContent = data.warrantySoon || 0;
}

// fetches the employee list and fills the "Assigned Employee" dropdown in the asset form
async function loadEmployees() {
  employees = await apiRequest('/api/employees');
  employeeSelect.innerHTML = '<option value="">Unassigned</option>';

  employees.forEach((employee) => {
    const option = document.createElement('option');
    option.value = employee.id;
    option.textContent = `${employee.name} — ${employee.department}`;
    employeeSelect.appendChild(option);
  });
}

// reads the current search box and filter dropdowns, then asks the server
// for the matching assets and displays them in the table
async function loadAssets() {
  const search = document.getElementById('searchInput').value.trim();
  const status = document.getElementById('statusFilter').value;
  const type = document.getElementById('typeFilter').value;

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (type) params.set('type', type);

  const assets = await apiRequest(`/api/assets?${params.toString()}`);
  renderAssets(assets);
}

// takes the list of assets returned by the server and builds the table rows for them
function renderAssets(assets) {
  assetTableBody.innerHTML = '';
  emptyMessage.hidden = assets.length > 0;

  assets.forEach((asset) => {
    const row = document.createElement('tr');
    const warrantyText = formatDate(asset.warranty_end);

    row.innerHTML = `
      <td><strong>${escapeHtml(asset.asset_tag)}</strong></td>
      <td>
        <span class="device-name">${escapeHtml(asset.brand)} ${escapeHtml(asset.model)}</span>
        <span class="device-model">${escapeHtml(asset.type)}</span>
      </td>
      <td><span class="badge ${asset.status.toLowerCase()}">${escapeHtml(asset.status)}</span></td>
      <td>${asset.employee_name ? escapeHtml(asset.employee_name) : '—'}</td>
      <td>${warrantyText}</td>
      <td class="row-actions">
        <button class="text-button" data-action="view" data-id="${asset.id}">View</button>
        <button class="text-button" data-action="edit" data-id="${asset.id}">Edit</button>
        <button class="danger-button" data-action="delete" data-id="${asset.id}">Delete</button>
      </td>
    `;

    assetTableBody.appendChild(row);
  });
}

// clears out the "Add/Edit Asset" form and puts it back to its default state,
// ready for adding a brand new asset
function resetAssetForm() {
  assetForm.reset();
  document.getElementById('assetId').value = '';
  document.getElementById('status').value = 'Available';
  document.getElementById('assetDialogTitle').textContent = 'Add Asset';
  document.getElementById('assetFormMessage').textContent = '';
}

// loads one asset's data and fills the form fields with it so the user can edit it
async function openEditAsset(id) {
  const asset = await apiRequest(`/api/assets/${id}`);

  document.getElementById('assetId').value = asset.id;
  document.getElementById('assetTag').value = asset.asset_tag;
  document.getElementById('assetType').value = asset.type;
  document.getElementById('brand').value = asset.brand;
  document.getElementById('model').value = asset.model;
  document.getElementById('serialNumber').value = asset.serial_number || '';
  document.getElementById('status').value = asset.status;
  document.getElementById('employeeId').value = asset.employee_id || '';
  document.getElementById('purchaseDate').value = asset.purchase_date || '';
  document.getElementById('warrantyEnd').value = asset.warranty_end || '';
  document.getElementById('notes').value = asset.notes || '';
  document.getElementById('assetDialogTitle').textContent = `Edit ${asset.asset_tag}`;
  document.getElementById('assetFormMessage').textContent = '';

  assetDialog.showModal();
}

// opens the "View" popup for one asset: shows its details and its
// maintenance history
async function openAssetDetails(id) {
  selectedAssetId = id;
  const asset = await apiRequest(`/api/assets/${id}`);

  document.getElementById('detailsTitle').textContent = asset.asset_tag;
  document.getElementById('detailsSubtitle').textContent = `${asset.brand} ${asset.model}`;

  const details = [
    ['Type', asset.type],
    ['Status', asset.status],
    ['Assigned To', asset.employee_name || 'Unassigned'],
    ['Serial Number', asset.serial_number || '—'],
    ['Purchase Date', formatDate(asset.purchase_date)],
    ['Warranty End', formatDate(asset.warranty_end)],
    ['Notes', asset.notes || '—']
  ];

  const detailsContainer = document.getElementById('assetDetails');
  detailsContainer.innerHTML = details.map(([label, value]) => `
    <div class="detail-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `).join('');

  renderMaintenance(asset.maintenance);
  detailsDialog.showModal();
}

// builds the list of maintenance records shown inside the asset details popup
function renderMaintenance(records) {
  const list = document.getElementById('maintenanceList');

  if (records.length === 0) {
    list.innerHTML = '<p class="empty-message">No maintenance records yet.</p>';
    return;
  }

  list.innerHTML = records.map((record) => `
    <div class="maintenance-item">
      <strong>${escapeHtml(record.issue)}</strong>
      <div>${escapeHtml(record.action_taken)}</div>
      <div class="maintenance-meta">
        ${formatDate(record.service_date)} · Cost: $${Number(record.cost || 0).toFixed(2)}
      </div>
    </div>
  `).join('');
}

// runs when the "Add/Edit Asset" form is submitted.
// sends a POST if it's a new asset, or a PUT if we're editing one that already exists
assetForm.addEventListener('submit', async (event) => {
  event.preventDefault(); // stop the page from refreshing, since we're using fetch instead

  const id = document.getElementById('assetId').value;
  const payload = {
    asset_tag: document.getElementById('assetTag').value,
    type: document.getElementById('assetType').value,
    brand: document.getElementById('brand').value,
    model: document.getElementById('model').value,
    serial_number: document.getElementById('serialNumber').value,
    status: document.getElementById('status').value,
    employee_id: document.getElementById('employeeId').value || null,
    purchase_date: document.getElementById('purchaseDate').value || null,
    warranty_end: document.getElementById('warrantyEnd').value || null,
    notes: document.getElementById('notes').value
  };

  try {
    if (id) {
      // there's already an id, so this asset exists — update it
      await apiRequest(`/api/assets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      // no id yet, so this is a new asset — create it
      await apiRequest('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    assetDialog.close();
    resetAssetForm();
    await refreshPageData(); // reload the dashboard and table so the change shows up
  } catch (error) {
    // show the error message from the server instead of crashing silently
    document.getElementById('assetFormMessage').textContent = error.message;
  }
});

// runs when the "Add Maintenance Record" form is submitted
maintenanceForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const assetId = document.getElementById('maintenanceAssetId').value;
  const payload = {
    service_date: document.getElementById('serviceDate').value,
    issue: document.getElementById('serviceIssue').value,
    action_taken: document.getElementById('actionTaken').value,
    cost: document.getElementById('serviceCost').value
  };

  try {
    await apiRequest(`/api/assets/${assetId}/maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    maintenanceDialog.close();
    maintenanceForm.reset();
    document.getElementById('serviceCost').value = '0';
    await refreshPageData();
    await openAssetDetails(assetId); // reopen the details popup so the new record shows up right away
  } catch (error) {
    document.getElementById('maintenanceFormMessage').textContent = error.message;
  }
});

// "+ Add Asset" button at the top of the page — opens a blank form
document.getElementById('addAssetBtn').addEventListener('click', () => {
  resetAssetForm();
  assetDialog.showModal();
});

// "Add Record" button inside the asset details popup — opens the maintenance form
// pre-filled with today's date and the current asset's id
document.getElementById('addMaintenanceBtn').addEventListener('click', () => {
  if (!selectedAssetId) return;
  maintenanceForm.reset();
  document.getElementById('maintenanceAssetId').value = selectedAssetId;
  document.getElementById('serviceDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('serviceCost').value = '0';
  document.getElementById('maintenanceFormMessage').textContent = '';
  detailsDialog.close();
  maintenanceDialog.showModal();
});

// handles clicks on the View/Edit/Delete buttons inside the asset table.
// using one listener on the whole table body instead of one per button
// (this is called "event delegation")
assetTableBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;

  if (action === 'view') {
    await openAssetDetails(id);
  }

  if (action === 'edit') {
    await openEditAsset(id);
  }

  if (action === 'delete') {
    const confirmed = window.confirm('Delete this asset and its maintenance history?');
    if (!confirmed) return;

    await apiRequest(`/api/assets/${id}`, { method: 'DELETE' });
    await refreshPageData();
  }
});

// every button with a data-close attribute closes the dialog whose id matches that value
// (e.g. the "Cancel" and "×" buttons on the popups)
document.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => {
    document.getElementById(button.dataset.close).close();
  });
});

// waits a quarter second after the user stops typing in the search box before
// actually searching, so we're not sending a request on every single keystroke
let searchTimer;
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadAssets, 250);
});

// re-run the search whenever a filter dropdown changes
document.getElementById('statusFilter').addEventListener('change', loadAssets);
document.getElementById('typeFilter').addEventListener('change', loadAssets);

// "Clear" button resets the search box and both filters, then reloads the table
document.getElementById('clearFiltersBtn').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  document.getElementById('statusFilter').value = '';
  document.getElementById('typeFilter').value = '';
  loadAssets();
});

// if the user picks an employee while the status is still "Available",
// automatically switch the status to "Assigned" so it stays consistent
document.getElementById('employeeId').addEventListener('change', (event) => {
  if (event.target.value && document.getElementById('status').value === 'Available') {
    document.getElementById('status').value = 'Assigned';
  }
});

// turns a date like "2026-09-03" into a friendlier format like "Sep 3, 2026"
// for display. returns a dash if there's no date.
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

// replaces special HTML characters with their safe equivalents before we
// insert text into the page, so things like "<" or "&" in an asset name
// can't accidentally break the layout or run as code
function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// reloads the dashboard cards and the asset table together — called after
// any change (add, edit, delete) so the page stays up to date
async function refreshPageData() {
  await Promise.all([loadDashboard(), loadAssets()]);
}

// runs once when the page first loads: loads employees, then the dashboard and assets
async function startApp() {
  try {
    await loadEmployees();
    await refreshPageData();
  } catch (error) {
    console.error(error);
    window.alert('Could not load AssetTrack. Make sure the server is running.');
  }
}

startApp();
