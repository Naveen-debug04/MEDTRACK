const API_BASE = `${String(window.MEDTRACK_API_URL || '').replace(/\/+$/, '')}/api`;
const state = {
  alertDays: 30,
  page: 'dashboard',
  user: null,
  medicines: [],
  batches: [],
  search: '',
  cameraStream: null,
  scannerTimer: null
};
const pageNames = {
  dashboard: 'Overview',
  medicines: 'Medicines',
  batches: 'Batches & stock',
  appointments: 'Appointments',
  scanner: 'Barcode scanner',
  alerts: 'Alerts',
  assistant: 'Inventory assistant',
  reports: 'Reports',
  settings: 'Settings'
};

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const dateText = (value, calendarOnly = false) => {
  if (!value) return '—';
  const date = calendarOnly
    ? new Date(`${(typeof value === 'string' ? value : value.toISOString()).slice(0, 10)}T12:00:00`)
    : new Date(value);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const dateTimeText = (value) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';
const numberText = (value) => new Intl.NumberFormat().format(value || 0);

async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  if (!response.ok) {
    let message = 'Something went wrong';
    try { message = (await response.json()).error || message; } catch { /* use the generic message */ }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  const type = response.headers.get('content-type') || '';
  return type.includes('application/json') ? response.json() : response.text();
}

function toast(message, error = false) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.toggle('error', error);
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 3400);
}

function emptyState(title, message, icon = '▤') {
  return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><strong>${esc(title)}</strong><span>${esc(message)}</span></div>`;
}

function statusPill(status) {
  const label = status === 'low_stock' ? 'Low stock' : status;
  return `<span class="status ${esc(status)}">${esc(label)}</span>`;
}

function showApp() {
  $('#auth-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  const name = state.user?.fullName || 'MedTrack user';
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  $('#user-name').textContent = name;
  $('#user-role').textContent = state.user?.organizationName || state.user?.role || 'Workspace';
  $('#user-avatar').textContent = initials;
  $('#profile-avatar').textContent = initials;
  document.title = 'MedTrack — Medicine inventory';
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  navigate(state.page);
}

function showAuthPage(page) {
  const isRegister = page === 'register';
  $('#auth-view').classList.remove('hidden');
  $('#app-view').classList.add('hidden');
  $('#login-panel').classList.toggle('hidden', isRegister);
  $('#register-panel').classList.toggle('hidden', !isRegister);
  document.title = `${isRegister ? 'Create account' : 'Sign in'} — MedTrack`;
  history.replaceState(null, '', isRegister ? '#register' : '#login');
}

function setLoading() {
  $('#content').innerHTML = '<div class="loading">Loading your inventory…</div>';
}

async function navigate(page) {
  if (!pageNames[page]) return;
  stopCamera();
  state.page = page;
  $('#page-title').textContent = pageNames[page];
  document.querySelectorAll('.nav-link[data-page]').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
  $('#sidebar').classList.remove('open');
  $('#content').focus({ preventScroll: true });
  setLoading();
  try {
    if (page === 'dashboard') await renderDashboard();
    else if (page === 'medicines') await renderMedicines();
    else if (page === 'batches') await renderBatches();
    else if (page === 'appointments') await renderAppointments();
    else if (page === 'scanner') renderScanner();
    else if (page === 'alerts') await renderAlerts();
    else if (page === 'assistant') renderAssistant();
    else if (page === 'reports') await renderReports();
    else if (page === 'settings') await renderSettings();
  } catch (error) {
    $('#content').innerHTML = emptyState('Could not load this page', error.message, '!');
    toast(error.message, true);
  }
}

function pageHead(title, description, button = '') {
  return `<div class="page-head"><div><p class="eyebrow">MEDTRACK WORKSPACE</p><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${button}</div>`;
}

function metricCard(label, value, note, icon) {
  return `<article class="metric-card"><div class="metric-top"><span>${esc(label)}</span><span class="metric-icon">${icon}</span></div><div class="metric-value">${numberText(value)}</div><div class="metric-note">${esc(note)}</div></article>`;
}

async function renderDashboard() {
  const data = await api('/dashboard');
  const max = Math.max(1, ...data.expiryOverview.map((item) => item.count));
  const total = data.stockSummary.available + data.stockSummary.expired;
  const availablePct = total ? Math.round((data.stockSummary.available / total) * 100) : 0;
  const expiryRows = data.alerts.length ? data.alerts.map((item) => `<div class="list-row"><div class="row-main"><strong>${esc(item.medicineName)}</strong><span>Batch ${esc(item.batchNumber)} · expires ${dateText(item.expiryDate, true)}</span></div>${statusPill(item.status)}</div>`).join('') : emptyState('All clear for now', 'Batches approaching expiry will appear here.', '✓');
  const activityRows = data.recentActivity.length ? data.recentActivity.map((item) => `<div class="activity-item"><div class="activity-icon">${item.change >= 0 ? '+' : '−'}</div><div class="activity-copy"><strong>${esc(item.medicineName)} · ${item.change > 0 ? '+' : ''}${numberText(item.change)} units</strong><span>${esc(item.reason)} · ${dateText(item.createdAt)}</span></div></div>`).join('') : emptyState('No activity yet', 'Add a medicine batch or update stock to start a history.', '↗');
  $('#content').innerHTML = `
    ${pageHead('Inventory overview', 'Here is what is happening with your inventory today.', '<button class="button" data-action="add-medicine">＋ Add medicine</button>')}
    <section class="metric-grid">
      ${metricCard('Medicine products', data.summary.products, 'Products in your inventory', '▤')}
      ${metricCard('Available stock', data.summary.stock, 'Units excluding expired stock', '◫')}
      ${metricCard('Low stock products', data.summary.lowStock, 'At or below configured thresholds', '⌁')}
      ${metricCard('Expiry attention', data.summary.expiring + data.summary.expired, `${data.summary.expiring} approaching · ${data.summary.expired} expired`, '◷')}
    </section>
    <section class="dashboard-grid">
      <article class="panel"><div class="panel-head"><div><h2>Expiry overview</h2><p>Batch expiry dates by month</p></div><span class="status">Next 6 months</span></div>
        <div class="chart-area">${data.expiryOverview.map((item) => `<div class="chart-column"><em>${item.count || ''}</em><i style="height:${Math.max(3, (item.count / max) * 72)}%"></i><span>${esc(item.month)}</span></div>`).join('')}</div>
      </article>
      <article class="panel"><div class="panel-head"><div><h2>Stock summary</h2><p>Current recorded stock levels</p></div></div>
        <div class="donut-wrap"><div class="donut" style="background:conic-gradient(#4c80f4 0 ${availablePct}%, #e8eef8 ${availablePct}% 100%)"><div class="donut-center"><strong>${numberText(data.stockSummary.available)}</strong><span>available units</span></div></div>
        <div class="legend"><div class="legend-row"><i class="legend-dot"></i>Available stock</div><div class="legend-row"><i class="legend-dot gray"></i>Expired stock (${numberText(data.stockSummary.expired)})</div></div></div>
      </article>
    </section>
    <section class="lower-grid">
      <article class="panel"><div class="panel-head"><div><h2>Expiry attention</h2><p>Products that may need a closer look</p></div><button class="text-button" data-page="alerts">View alerts →</button></div>${expiryRows}</article>
      <article class="panel"><div class="panel-head"><div><h2>Recent activity</h2><p>Latest inventory changes</p></div><button class="text-button" data-page="reports">View reports →</button></div>${activityRows}</article>
    </section>`;
}

async function renderMedicines() {
  const result = await api('/medicines');
  state.medicines = result.medicines;
  const categories = [...new Set(state.medicines.map((item) => item.category).filter(Boolean))].sort();
  $('#content').innerHTML = `${pageHead('Medicines', 'Manage your medicine catalog and product details.', '<button class="button" data-action="add-medicine">＋ Add medicine</button>')}
    <div class="toolbar"><div class="toolbar-left"><input id="medicine-search" class="field search-field" type="search" value="${esc(state.search)}" placeholder="Search name or barcode"><select id="category-filter" class="select"><option value="">All categories</option>${categories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join('')}</select></div><div class="toolbar-right"><span class="form-hint">${state.medicines.length} product${state.medicines.length === 1 ? '' : 's'}</span></div></div>
    <div class="table-panel"><div class="table-scroll"><table><thead><tr><th>Medicine</th><th>Barcode</th><th>Category</th><th>Manufacturer</th><th>Added</th><th>Actions</th></tr></thead><tbody id="medicine-rows"></tbody></table></div></div>`;
  drawMedicineRows();
  $('#medicine-search').addEventListener('input', (event) => {
    state.search = event.target.value;
    drawMedicineRows();
  });
  $('#category-filter').addEventListener('change', drawMedicineRows);
}

async function renderAppointments() {
  const { appointments } = await api('/appointments');
  const now = Date.now();
  const upcoming = appointments.filter((item) => item.status === 'scheduled' && new Date(item.appointmentDate).getTime() >= now).length;
  const completed = appointments.filter((item) => item.status === 'completed').length;
  const cancelled = appointments.filter((item) => item.status === 'cancelled').length;
  const rows = appointments.length ? appointments.map((item) => `<tr>
    <td><strong>${esc(item.doctorName)}</strong>${item.isSample ? '<span class="sample-badge">Sample</span>' : ''}</td>
    <td>${esc(item.specialty || '—')}</td><td>${dateTimeText(item.appointmentDate)}</td><td>${esc(item.location || '—')}</td><td>${statusPill(item.status)}</td>
    <td><div class="table-actions">${item.status === 'scheduled' ? `<button class="text-button" data-action="complete-appointment" data-id="${esc(item._id)}">Complete</button><button class="text-button" data-action="cancel-appointment" data-id="${esc(item._id)}">Cancel</button>` : ''}<button class="text-button delete" data-action="delete-appointment" data-id="${esc(item._id)}">Delete</button></div></td>
  </tr>`).join('') : `<tr><td colspan="6">${emptyState('No appointments yet', 'Add an appointment or load development samples with npm run seed:appointments.', '▦')}</td></tr>`;
  $('#content').innerHTML = `${pageHead('Doctor appointments', 'Keep your upcoming appointments and visit details organized.', '<button class="button" data-action="add-appointment">＋ Add appointment</button>')}
    <section class="metric-grid">
      ${metricCard('Upcoming appointments', upcoming, 'Scheduled for a future date', '◷')}
      ${metricCard('Completed', completed, 'Appointments marked complete', '✓')}
      ${metricCard('Cancelled', cancelled, 'Appointments cancelled', '×')}
      ${metricCard('Total appointments', appointments.length, 'In your private workspace', '▦')}
    </section>
    <div class="table-panel report-list"><div class="table-scroll"><table><thead><tr><th>Doctor</th><th>Specialty</th><th>Date & time</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function localDateTimeValue(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function openAppointmentForm() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  openModal('Add doctor appointment', `<form id="appointment-form">
    <div class="form-field"><label for="appointment-doctor">Doctor name</label><input id="appointment-doctor" name="doctorName" required minlength="2" maxlength="120" placeholder="e.g. Dr. Avery Chen"></div>
    <div class="form-grid"><div class="form-field"><label for="appointment-specialty">Specialty</label><input id="appointment-specialty" name="specialty" maxlength="100" placeholder="Optional"></div>
      <div class="form-field"><label for="appointment-date">Date and time</label><input id="appointment-date" name="appointmentDate" type="datetime-local" min="${localDateTimeValue(new Date())}" value="${localDateTimeValue(tomorrow)}" required></div></div>
    <div class="form-field"><label for="appointment-location">Location</label><input id="appointment-location" name="location" maxlength="180" placeholder="Clinic or office"></div>
    <div class="settings-actions"><span class="form-hint">Appointment details are private to your account.</span><button class="button" type="submit">Save appointment</button></div></form>`);
}

function drawMedicineRows() {
  const query = ($('#medicine-search')?.value || state.search).trim().toLowerCase();
  const category = $('#category-filter')?.value || '';
  const rows = state.medicines.filter((item) =>
    (!category || item.category === category) &&
    (!query || `${item.name} ${item.barcode}`.toLowerCase().includes(query))
  );
  $('#medicine-rows').innerHTML = rows.length ? rows.map((item) => `<tr>
    <td><strong>${esc(item.name)}</strong><div class="form-hint">${esc(item.description || '')}</div></td><td>${esc(item.barcode || '—')}</td><td>${esc(item.category)}</td><td>${esc(item.manufacturer || '—')}</td><td>${dateText(item.createdAt)}</td>
    <td><div class="table-actions"><button class="text-button" data-action="edit-medicine" data-id="${esc(item._id)}">Edit</button><button class="text-button delete" data-action="delete-medicine" data-id="${esc(item._id)}">Delete</button></div></td>
  </tr>`).join('') : `<tr><td colspan="6">${emptyState('No medicines found', state.search ? 'Try another search or add a new medicine.' : 'Add your first product to start tracking stock.', '▤')}</td></tr>`;
}

async function renderBatches() {
  const [batchData, medicineData] = await Promise.all([api('/batches'), api('/medicines')]);
  state.batches = batchData.batches;
  state.medicines = medicineData.medicines;
  const rows = state.batches.length ? state.batches.map((batch) => `<tr>
    <td><strong>${esc(batch.medicineId?.name || 'Medicine')}</strong><div class="form-hint">${esc(batch.medicineId?.category || '')}</div></td><td>${esc(batch.batchNumber)}</td><td>${dateText(batch.expiryDate, true)}</td><td>${numberText(batch.quantity)}</td><td>${numberText(batch.availableQuantity)}</td><td>${statusPill(batch.status)}</td>
    <td><div class="table-actions"><button class="text-button" data-action="adjust-stock" data-id="${esc(batch._id)}">Adjust</button><button class="text-button delete" data-action="delete-batch" data-id="${esc(batch._id)}">Remove</button></div></td>
  </tr>`).join('') : `<tr><td colspan="7">${emptyState('No batches yet', 'Add a batch to track quantities, suppliers and expiry dates.', '◫')}</td></tr>`;
  $('#content').innerHTML = `${pageHead('Batches & stock', 'Track batch-level quantities, thresholds and expiry dates.', '<button class="button" data-action="add-batch">＋ Add batch</button>')}
    <div class="toolbar"><div class="toolbar-left"><input id="batch-search" class="field search-field" type="search" placeholder="Search medicine or batch"></div><div class="toolbar-right"><span class="form-hint">Expired stock is excluded from available units.</span></div></div>
    <div class="table-panel"><div class="table-scroll"><table><thead><tr><th>Medicine</th><th>Batch no.</th><th>Expiry</th><th>Recorded qty.</th><th>Available</th><th>Status</th><th>Actions</th></tr></thead><tbody id="batch-rows">${rows}</tbody></table></div></div>`;
  $('#batch-search').addEventListener('input', (event) => {
    const query = event.target.value.toLowerCase();
    const filtered = state.batches.filter((batch) => `${batch.medicineId?.name} ${batch.batchNumber}`.toLowerCase().includes(query));
    $('#batch-rows').innerHTML = filtered.length ? filtered.map(batchRow).join('') : `<tr><td colspan="7">${emptyState('No batches found', 'Try another search.', '⌕')}</td></tr>`;
  });
}

function batchRow(batch) {
  return `<tr><td><strong>${esc(batch.medicineId?.name || 'Medicine')}</strong><div class="form-hint">${esc(batch.medicineId?.category || '')}</div></td><td>${esc(batch.batchNumber)}</td><td>${dateText(batch.expiryDate, true)}</td><td>${numberText(batch.quantity)}</td><td>${numberText(batch.availableQuantity)}</td><td>${statusPill(batch.status)}</td><td><div class="table-actions"><button class="text-button" data-action="adjust-stock" data-id="${esc(batch._id)}">Adjust</button><button class="text-button delete" data-action="delete-batch" data-id="${esc(batch._id)}">Remove</button></div></td></tr>`;
}

async function renderAlerts() {
  const data = await api('/notifications');
  const items = data.notifications;
  const unread = items.filter((item) => !item.read).length;
  $('#alert-dot').classList.toggle('hidden', unread === 0);
  const rows = items.length ? items.map((item) => `<div class="list-row"><div class="activity-icon">${item.kind === 'expired' ? '!' : item.kind === 'low_stock' ? '⌁' : item.kind === 'expiring' ? '◷' : '✓'}</div><div class="row-main"><strong>${esc(item.title)}</strong><span>${esc(item.message)} · ${dateText(item.createdAt)}</span></div><div class="table-actions">${item.kind !== 'activity' ? statusPill(item.kind) : ''}${item.read ? '<span class="form-hint">Read</span>' : `<button class="text-button" data-action="mark-read" data-id="${esc(item.id)}">Mark read</button>`}</div></div>`).join('') : emptyState('You’re all caught up', 'Inventory alerts and recent updates will appear here.', '✓');
  $('#content').innerHTML = `${pageHead('Alerts & notifications', `${unread} unread inventory update${unread === 1 ? '' : 's'}. Expiry alerts use the ${state.alertDays}-day workspace setting.`)}<section class="panel">${rows}</section>`;
}

function renderScanner() {
  $('#content').innerHTML = `${pageHead('Barcode scanner', 'Scan a product barcode or enter it manually to find a matching medicine.')}
    <div class="scanner-layout"><section class="panel"><div class="panel-head"><div><h2>Camera scanner</h2><p>Camera access requires HTTPS or localhost.</p></div></div>
      <div class="scanner-box" id="scanner-box"><div class="scanner-placeholder"><div class="empty-state-icon">▦</div><b>Ready to scan</b><span>Use your device camera to read a barcode. If your browser does not support scanning, enter the barcode manually.</span><button class="button" data-action="start-scanner">Start camera</button></div></div>
      <div class="manual-row"><input id="barcode-input" class="field" placeholder="Enter barcode number" inputmode="numeric" autocomplete="off"><button class="button secondary" data-action="lookup-barcode">Search</button></div>
      <div id="scanner-result" class="scanner-result"></div></section>
      <section class="panel"><h2 class="section-title">Barcode lookup</h2><p class="form-hint" style="line-height:1.7;margin:12px 0">A barcode helps you find an existing item in your own catalog. It does not retrieve product details from an external database. Verify product information before adding a new medicine.</p><div class="warning-box">Camera permission is requested only after you select “Start camera”. You can always use manual entry instead.</div></section>
    </div>`;
}

function renderAssistant() {
  $('#content').innerHTML = `${pageHead('Inventory assistant', 'Ask questions about your stock, batches and expiry dates.')}
    <section class="assistant-card"><div class="assistant-intro"><h2>Inventory, in plain language</h2><p>Get quick summaries from your workspace data. This assistant is limited to inventory topics and cannot provide medical, dosage, treatment, recommendation or dispensing advice.</p>
      <div class="suggestions"><button class="suggestion" data-question="Which products are low on stock?">Which products are low on stock?</button><button class="suggestion" data-question="What is expiring soon?">What is expiring soon?</button><button class="suggestion" data-question="Summarize my inventory">Summarize my inventory</button></div>
    </div><div class="chat-messages" id="chat-messages"><div class="chat-message">Ask me about product quantities, low stock, batches or expiry dates.</div></div><form class="chat-compose" id="assistant-form"><input class="field" id="assistant-question" name="query" maxlength="500" required placeholder="Ask an inventory question…"><button class="button" type="submit">Ask <span>→</span></button></form></section>`;
}

async function renderReports() {
  const params = new URLSearchParams();
  const from = $('#report-from')?.value;
  const to = $('#report-to')?.value;
  if (from) params.set('from', from);
  if (to) params.set('to', `${to}T23:59:59.999`);
  const [data, auditData] = await Promise.all([
    api(`/reports/inventory${params.size ? `?${params}` : ''}`),
    api(`/audit${params.size ? `?${params}` : ''}`)
  ]);
  const movementRows = data.movements.length ? data.movements.map((item) => `<tr><td><strong>${esc(item.medicine)}</strong></td><td>${item.change > 0 ? '+' : ''}${numberText(item.change)}</td><td>${numberText(item.resultingQuantity)}</td><td>${esc(item.reason)}</td><td>${dateText(item.date)}</td></tr>`).join('') : `<tr><td colspan="5">${emptyState('No stock movements', 'Adjustments and batch additions will appear here.', '↗')}</td></tr>`;
  const auditRows = auditData.entries.length ? auditData.entries.map((item) => `<tr><td><strong>${esc(item.action.replaceAll('.', ' '))}</strong></td><td>${esc(item.entityType)}</td><td>${esc(item.actor)}</td><td>${esc(item.details)}</td><td>${dateText(item.createdAt)}</td></tr>`).join('') : `<tr><td colspan="5">${emptyState('No audit records', 'Important inventory changes will be recorded here.', '✓')}</td></tr>`;
  $('#content').innerHTML = `${pageHead('Inventory reports', 'Review current inventory and stock movement history.', '<button class="button secondary" data-action="export-report">↓ Export CSV</button>')}
    <div class="toolbar"><div class="toolbar-left"><label class="form-hint">From <input id="report-from" class="field" type="date" value="${esc(from || '')}"></label><label class="form-hint">To <input id="report-to" class="field" type="date" value="${esc(to || '')}"></label></div><div class="toolbar-right"><button class="button secondary small" data-action="apply-report-filter">Apply dates</button></div></div>
    <section class="metric-grid report-cards">
      ${metricCard('Medicine products', data.summary.products, 'Catalog items', '▤')}
      ${metricCard('Total recorded stock', data.summary.totalStock, 'Including expired units', '◫')}
      ${metricCard('Available stock', data.summary.availableStock, 'Excluding expired units', '✓')}
      ${metricCard('Low-stock products', data.summary.lowStock, `${data.summary.expiring} expiring · ${data.summary.expired} expired batches`, '⌁')}
    </section>
    <section class="panel"><div class="panel-head"><div><h2>Batch inventory</h2><p>Current batch quantities and status</p></div></div><div class="table-panel report-list"><div class="table-scroll"><table><thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Quantity</th><th>Available</th><th>Status</th></tr></thead><tbody>${data.batches.length ? data.batches.map((batch) => `<tr><td><strong>${esc(batch.medicine)}</strong><div class="form-hint">${esc(batch.category)}</div></td><td>${esc(batch.batchNumber)}</td><td>${dateText(batch.expiryDate, true)}</td><td>${numberText(batch.quantity)}</td><td>${numberText(batch.available)}</td><td>${statusPill(batch.status)}</td></tr>`).join('') : `<tr><td colspan="6">${emptyState('No batch data', 'Create batches to see inventory reports.', '▥')}</td></tr>`}</tbody></table></div></div></section>
    <section class="panel report-list"><div class="panel-head"><div><h2>Stock movement history</h2><p>Latest ${data.movements.length} movement records</p></div></div><div class="table-panel report-list"><div class="table-scroll"><table><thead><tr><th>Medicine</th><th>Change</th><th>Resulting qty.</th><th>Reason</th><th>Date</th></tr></thead><tbody>${movementRows}</tbody></table></div></div></section>`;
  $('#content').insertAdjacentHTML('beforeend', `<section class="panel report-list"><div class="panel-head"><div><h2>Audit history</h2><p>Important changes in your workspace</p></div></div><div class="table-panel report-list"><div class="table-scroll"><table><thead><tr><th>Action</th><th>Record</th><th>Source</th><th>Details</th><th>Date</th></tr></thead><tbody>${auditRows}</tbody></table></div></div></section>`);
}

async function renderSettings() {
  const settings = await api('/settings');
  state.alertDays = settings.alertDays;
  state.aiDataSharingEnabled = settings.aiDataSharingEnabled;
  let teamSection = '';
  if (state.user.membershipRole === 'owner') {
    const team = await api('/members');
    const rows = team.members.map((member) => `<div class="list-row"><div class="row-main"><strong>${esc(member.fullName)}</strong><span>${esc(member.email)} · ${esc(member.role)} · ${esc(member.membershipRole)}</span></div>${member.membershipRole === 'staff' ? `<button class="text-button delete" data-action="remove-member" data-id="${esc(member.id)}">Remove</button>` : '<span class="status">Owner</span>'}</div>`).join('');
    const invitations = team.invitations.length
      ? team.invitations.map((invite) => `<div class="list-row"><div class="row-main"><strong>${esc(invite.email)}</strong><span>Invite expires ${dateText(invite.expiresAt)}</span></div><button class="text-button delete" data-action="revoke-invitation" data-id="${esc(invite.id)}">Revoke</button></div>`).join('')
      : '<p class="form-hint">No pending invitations.</p>';
    teamSection = `<section class="settings-card team-settings"><h2>Workspace members</h2><p>Share access with staff. Invitation codes expire after 48 hours; share each code privately with the invited email address.</p>
      <form id="invite-member-form"><div class="form-grid"><div class="form-field"><label for="invite-email">Staff email</label><input id="invite-email" name="email" type="email" required maxlength="254" placeholder="colleague@example.com"></div><div class="form-field"><label>&nbsp;</label><button class="button" type="submit">Create invitation</button></div></div></form>
      <div id="invite-result"></div><h3>Members</h3>${rows || emptyState('No members', 'Invite staff to share this workspace.') }<h3>Pending invitations</h3>${invitations}</section>`;
  } else {
    teamSection = `<section class="settings-card"><h2>Workspace access</h2><p>You have staff access. Only the workspace owner can manage members, invitations, and workspace settings.</p></section>`;
  }
  $('#content').innerHTML = `${pageHead('Workspace settings', 'Configure inventory alerts and workspace access.')}
    <div class="settings-grid"><section class="settings-card"><h2>Expiry alerts</h2><p>Choose when a batch should be considered approaching its expiry date.</p>
      ${state.user.membershipRole === 'owner'
        ? `<form id="alert-settings-form"><div class="form-field"><label for="alert-days">Notify me before expiry</label><select id="alert-days" name="alertDays"><option value="7" ${state.alertDays === 7 ? 'selected' : ''}>7 days</option><option value="15" ${state.alertDays === 15 ? 'selected' : ''}>15 days</option><option value="30" ${state.alertDays === 30 ? 'selected' : ''}>30 days</option></select></div><div class="warning-box">In-app alerts only; email delivery is not configured.</div><div class="settings-actions" style="margin-top:18px"><span></span><button class="button" type="submit">Save alert settings</button></div></form>`
        : `<p class="warning-box">Current workspace alert period: ${state.alertDays} days. Ask the owner to change it.</p>`}
    </section><section class="settings-card"><h2>Inventory assistant</h2><p>The local assistant uses inventory summaries. Sending inventory to the configured external AI provider is disabled unless the workspace owner enables it.</p>
      ${state.user.membershipRole === 'owner'
        ? `<form id="ai-sharing-form"><label class="checkbox-row"><input name="aiDataSharingEnabled" type="checkbox" ${state.aiDataSharingEnabled ? 'checked' : ''}><span>Allow inventory data to be sent to the configured AI provider</span></label><p class="form-hint">Only product names/categories and batch numbers, expiry, quantities, and thresholds are sent; supplier and account identifiers are excluded. The provider may be external.</p><button class="button secondary" type="submit">Save AI privacy setting</button></form>`
        : `<p class="warning-box">External AI sharing: ${state.aiDataSharingEnabled ? 'enabled by the owner' : 'disabled'}.</p>`}
      <div class="warning-box">No API credentials are stored in the browser. Do not enter medical or patient information.</div></section>
    ${teamSection}<section class="settings-card"><h2>Access and privacy</h2><p>Workspace owners manage invitations and settings. Staff can view and update inventory. Password reset and email verification are not configured.</p></section></div>`;
}

function openModal(title, content) {
  $('#modal-title').textContent = title;
  $('#modal-content').innerHTML = content;
  $('#modal-backdrop').classList.remove('hidden');
  const first = $('#modal-content input, #modal-content select');
  if (first) first.focus();
}

function closeModal() {
  $('#modal-backdrop').classList.add('hidden');
  $('#modal-content').innerHTML = '';
}

function openMedicineForm(medicine = null) {
  const item = medicine || {};
  openModal(medicine ? 'Edit medicine' : 'Add medicine', `<form id="medicine-form" data-id="${esc(item._id || '')}">
    <div class="form-field"><label for="medicine-name">Medicine name</label><input id="medicine-name" name="name" required maxlength="160" value="${esc(item.name || '')}" placeholder="e.g. Product name"></div>
    <div class="form-grid"><div class="form-field"><label for="medicine-barcode">Barcode</label><input id="medicine-barcode" name="barcode" maxlength="80" value="${esc(item.barcode || '')}" placeholder="Optional"></div><div class="form-field"><label for="medicine-category">Category</label><input id="medicine-category" name="category" maxlength="80" value="${esc(item.category || '')}" placeholder="e.g. General"></div>
    <div class="form-field"><label for="medicine-manufacturer">Manufacturer</label><input id="medicine-manufacturer" name="manufacturer" maxlength="120" value="${esc(item.manufacturer || '')}"></div></div>
    <div class="form-field"><label for="medicine-description">Description</label><textarea id="medicine-description" name="description" maxlength="1000">${esc(item.description || '')}</textarea></div>
    <div class="settings-actions"><span class="form-hint">Fields marked by the browser are required.</span><button class="button" type="submit">${medicine ? 'Save changes' : 'Add medicine'}</button></div></form>`);
}

function openBatchForm() {
  if (!state.medicines.length) {
    toast('Add a medicine before creating a batch', true);
    navigate('medicines');
    return;
  }
  openModal('Add inventory batch', `<form id="batch-form">
    <div class="form-field"><label for="batch-medicine">Medicine</label><select id="batch-medicine" name="medicineId" required>${state.medicines.map((item) => `<option value="${esc(item._id)}">${esc(item.name)}</option>`).join('')}</select></div>
    <div class="form-grid"><div class="form-field"><label for="batch-number">Batch number</label><input id="batch-number" name="batchNumber" required maxlength="80"></div><div class="form-field"><label for="batch-quantity">Opening quantity</label><input id="batch-quantity" name="quantity" type="number" min="0" step="1" value="0" required></div>
    <div class="form-field"><label for="batch-manufacture">Manufacturing date</label><input id="batch-manufacture" name="manufactureDate" type="date" required></div><div class="form-field"><label for="batch-expiry">Expiry date</label><input id="batch-expiry" name="expiryDate" type="date" required></div>
    <div class="form-field"><label for="batch-threshold">Low-stock threshold</label><input id="batch-threshold" name="lowStockThreshold" type="number" min="0" step="1" value="10" required></div><div class="form-field"><label for="batch-supplier">Supplier</label><input id="batch-supplier" name="supplier" maxlength="160"></div></div>
    <div class="settings-actions"><span class="form-hint">Expired batches will not count as available stock.</span><button class="button" type="submit">Add batch</button></div></form>`);
}

function openStockForm(batchId) {
  const batch = state.batches.find((item) => item._id === batchId);
  if (!batch) return toast('Batch not found. Refresh and try again.', true);
  openModal(`Adjust ${batch.medicineId?.name || 'batch'} stock`, `<form id="stock-form" data-id="${esc(batch._id)}">
    <p class="form-hint" style="margin:-8px 0 17px">Current quantity: <strong>${numberText(batch.quantity)}</strong>. Use a positive number to add stock or a negative number to remove stock.</p>
    <div class="form-field"><label for="stock-change">Quantity change</label><input id="stock-change" name="change" type="number" step="1" required placeholder="e.g. 10 or -2"></div>
    <div class="form-field"><label for="stock-reason">Reason</label><input id="stock-reason" name="reason" maxlength="200" value="Stock adjustment" required></div>
    <div class="settings-actions"><span></span><button class="button" type="submit">Update stock</button></div></form>`);
}

async function lookupBarcode(code) {
  const barcode = String(code || '').trim();
  const result = $('#scanner-result');
  if (!barcode) return toast('Enter a barcode to search', true);
  result.innerHTML = '<div class="loading">Searching your inventory…</div>';
  try {
    const data = await api(`/medicines?barcode=${encodeURIComponent(barcode)}`);
    if (!data.medicines.length) {
      result.innerHTML = emptyState('No matching medicine', `Barcode ${barcode} is not in this workspace. Add a medicine and verify its details first.`, '⌕');
      return;
    }
    const item = data.medicines[0];
    result.innerHTML = `<div class="list-row"><div class="row-main"><strong>${esc(item.name)}</strong><span>${esc(item.category)} · ${esc(item.manufacturer || 'Manufacturer not set')} · barcode ${esc(item.barcode)}</span></div><button class="text-button" data-action="edit-medicine" data-id="${esc(item._id)}">Review details</button></div>`;
  } catch (error) {
    result.innerHTML = emptyState('Search failed', error.message, '!');
  }
}

async function startScanner() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Camera scanning is unavailable. Enter the barcode manually.', true);
    return;
  }
  if (!('BarcodeDetector' in window)) {
    toast('This browser does not support camera barcode scanning. Use manual entry.', true);
    return;
  }
  try {
    const formats = await BarcodeDetector.getSupportedFormats();
    const preferred = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
    const detector = new BarcodeDetector({ formats: preferred.filter((format) => formats.includes(format)) });
    state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    const box = $('#scanner-box');
    box.innerHTML = '<video id="scanner-video" autoplay muted playsinline></video>';
    const video = $('#scanner-video');
    video.srcObject = state.cameraStream;
    await video.play();
    state.scannerTimer = setInterval(async () => {
      if (video.readyState < 2) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length && codes[0].rawValue) {
          $('#barcode-input').value = codes[0].rawValue;
          stopCamera();
          await lookupBarcode(codes[0].rawValue);
          toast('Barcode scanned');
        }
      } catch {
        stopCamera();
        toast('Could not read the camera stream. Try manual barcode entry.', true);
      }
    }, 350);
  } catch (error) {
    stopCamera();
    toast(error.name === 'NotAllowedError' ? 'Camera permission was denied. Enter the barcode manually.' : 'Unable to start the camera. Enter the barcode manually.', true);
  }
}

function stopCamera() {
  if (state.scannerTimer) clearInterval(state.scannerTimer);
  state.scannerTimer = null;
  if (state.cameraStream) state.cameraStream.getTracks().forEach((track) => track.stop());
  state.cameraStream = null;
  const box = $('#scanner-box');
  if (box && state.page !== 'scanner') return;
}

function appendChat(text, user = false) {
  const messages = $('#chat-messages');
  if (!messages) return;
  const bubble = document.createElement('div');
  bubble.className = `chat-message${user ? ' user' : ''}`;
  bubble.textContent = text;
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

document.addEventListener('click', async (event) => {
  const authPageButton = event.target.closest('[data-auth-page]');
  if (authPageButton) {
    showAuthPage(authPageButton.dataset.authPage);
    return;
  }
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) {
    event.preventDefault();
    await navigate(pageButton.dataset.page);
    return;
  }
  const questionButton = event.target.closest('[data-question]');
  if (questionButton) {
    const input = $('#assistant-question');
    if (input) {
      input.value = questionButton.dataset.question;
      input.form.requestSubmit();
    }
    return;
  }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const id = actionButton.dataset.id;
  try {
    switch (actionButton.dataset.action) {
      case 'logout': {
        try {
          await api('/auth/logout', { method: 'POST' });
        } catch (error) {
          if (error.status !== 401) throw error;
        }
        state.user = null;
        state.page = 'dashboard';
        state.medicines = [];
        state.batches = [];
        state.search = '';
        $('#content').replaceChildren();
        $('#alert-dot').classList.add('hidden');
        $('#login-form').reset();
        $('#login-feedback').textContent = 'You have signed out.';
        $('#login-feedback').classList.add('success');
        showAuthPage('login');
        break;
      }
      case 'add-appointment': openAppointmentForm(); break;
      case 'complete-appointment':
      case 'cancel-appointment': {
        const status = actionButton.dataset.action === 'complete-appointment' ? 'completed' : 'cancelled';
        await api(`/appointments/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
        toast(`Appointment ${status}`);
        await navigate('appointments');
        break;
      }
      case 'delete-appointment':
        if (window.confirm('Delete this appointment?')) {
          await api(`/appointments/${encodeURIComponent(id)}`, { method: 'DELETE' });
          toast('Appointment removed');
          await navigate('appointments');
        }
        break;
      case 'add-medicine': openMedicineForm(); break;
      case 'edit-medicine': {
        const medicine = state.medicines.find((item) => item._id === id) || (await api('/medicines')).medicines.find((item) => item._id === id);
        if (!medicine) throw new Error('Medicine not found');
        openMedicineForm(medicine);
        break;
      }
      case 'delete-medicine':
        if (window.confirm('Delete this medicine? You must remove its batches first.')) {
          await api(`/medicines/${encodeURIComponent(id)}`, { method: 'DELETE' });
          toast('Medicine removed');
          await navigate('medicines');
        }
        break;
      case 'add-batch': openBatchForm(); break;
      case 'adjust-stock': openStockForm(id); break;
      case 'delete-batch':
        if (window.confirm('Remove this batch? Existing movement history is retained.')) {
          await api(`/batches/${encodeURIComponent(id)}`, { method: 'DELETE' });
          toast('Batch removed');
          await navigate('batches');
        }
        break;
      case 'start-scanner': await startScanner(); break;
      case 'lookup-barcode': await lookupBarcode($('#barcode-input')?.value); break;
      case 'close-modal': closeModal(); break;
      case 'mark-read':
        await api(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
        await navigate('alerts');
        break;
      case 'remove-member':
        if (window.confirm('Remove this staff member and end their active sessions?')) {
          await api(`/members/${encodeURIComponent(id)}`, { method: 'DELETE' });
          toast('Staff member removed');
          await navigate('settings');
        }
        break;
      case 'revoke-invitation':
        if (window.confirm('Revoke this pending invitation?')) {
          await api(`/members/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' });
          toast('Invitation revoked');
          await navigate('settings');
        }
        break;
      case 'copy-invitation-code':
        await navigator.clipboard.writeText($('#invite-code-value').value);
        toast('Invitation code copied');
        break;
      case 'apply-report-filter': await renderReports(); break;
      case 'export-report': await downloadReport(); break;
    }
  } catch (error) {
    toast(error.message, true);
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (form.id === 'login-form') {
    event.preventDefault();
    const feedback = $('#login-feedback');
    feedback.textContent = '';
    feedback.classList.remove('success');
    if (!form.checkValidity()) {
      const invalid = form.querySelector(':invalid');
      feedback.textContent = invalid.validationMessage;
      invalid.focus();
      return;
    }
    const submit = $('button[type="submit"]', form);
    submit.disabled = true;
    try {
      const response = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: $('#login-email').value, password: $('#login-password').value })
      });
      $('#login-password').value = '';
      state.user = response.user;
      showApp();
      try {
        const notifications = await api('/notifications');
        $('#alert-dot').classList.toggle('hidden', !notifications.notifications.some((item) => !item.read));
      } catch (error) {
        toast(error.message, true);
      }
    } catch (error) {
      $('#login-password').value = '';
      feedback.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
    return;
  }
  if (form.id === 'register-form') {
    event.preventDefault();
    const feedback = $('#register-feedback');
    feedback.textContent = '';
    feedback.classList.remove('success');
    if (!form.checkValidity()) {
      const invalid = form.querySelector(':invalid');
      feedback.textContent = invalid.validationMessage;
      invalid.focus();
      return;
    }
    const password = $('#register-password').value;
    const confirmation = $('#register-confirm-password').value;
    if (password !== confirmation) {
      feedback.textContent = 'The passwords do not match.';
      $('#register-confirm-password').value = '';
      $('#register-confirm-password').focus();
      return;
    }
    const inviteCode = $('#register-invite-code').value.trim();
    if (inviteCode && inviteCode.length < 32) {
      feedback.textContent = 'That is not a complete invitation code. Leave this field blank to create a new workspace, or paste the full code from its owner.';
      $('#invitation-toggle').setAttribute('aria-expanded', 'true');
      syncInvitationRegistration();
      $('#register-invite-code').focus();
      return;
    }
    const submit = $('button[type="submit"]', form);
    submit.disabled = true;
    const data = Object.fromEntries(new FormData(form).entries());
    const email = data.email;
    delete data.confirmPassword;
    delete data.inviteCode;
    let endpoint = '/auth/register';
    if (inviteCode) {
      endpoint = '/auth/accept-invitation';
      data.inviteCode = inviteCode;
      delete data.role;
      delete data.organizationName;
    }
    try {
      await api(endpoint, { method: 'POST', body: JSON.stringify(data) });
      form.reset();
      $('#invitation-toggle').setAttribute('aria-expanded', 'false');
      $('#organization-field').classList.add('hidden');
      $('#register-organization').required = false;
      syncInvitationRegistration();
      $('#login-email').value = email;
      showAuthPage('login');
      $('#login-feedback').textContent = inviteCode
        ? 'Invitation accepted. Sign in to open your workspace.'
        : 'Your account was created. Sign in to open your private inventory.';
      $('#login-feedback').classList.add('success');
    } catch (error) {
      $('#register-password').value = '';
      $('#register-confirm-password').value = '';
      feedback.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
    return;
  }
  if (!['medicine-form', 'batch-form', 'stock-form', 'alert-settings-form', 'ai-sharing-form', 'invite-member-form', 'assistant-form', 'appointment-form'].includes(form.id)) return;
  event.preventDefault();
  const submit = $('button[type="submit"]', form);
  if (submit) submit.disabled = true;
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    if (form.id === 'appointment-form') {
      data.appointmentDate = new Date(data.appointmentDate).toISOString();
      await api('/appointments', { method: 'POST', body: JSON.stringify(data) });
      closeModal();
      toast('Appointment saved');
      await navigate('appointments');
    } else if (form.id === 'medicine-form') {
      const id = form.dataset.id;
      await api(id ? `/medicines/${encodeURIComponent(id)}` : '/medicines', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) });
      closeModal();
      toast(id ? 'Medicine updated' : 'Medicine added');
      await navigate('medicines');
    } else if (form.id === 'batch-form') {
      data.quantity = Number(data.quantity);
      data.lowStockThreshold = Number(data.lowStockThreshold);
      await api('/batches', { method: 'POST', body: JSON.stringify(data) });
      closeModal();
      toast('Batch added');
      await navigate('batches');
    } else if (form.id === 'stock-form') {
      data.change = Number(data.change);
      await api(`/batches/${encodeURIComponent(form.dataset.id)}/stock`, { method: 'PATCH', body: JSON.stringify(data) });
      closeModal();
      toast('Stock updated');
      await navigate('batches');
    } else if (form.id === 'invite-member-form') {
      const response = await api('/members/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: data.email })
      });
      $('#invite-result').innerHTML = `<div class="warning-box"><strong>Share this one-time code with ${esc(response.invitation.email)}:</strong><input id="invite-code-value" class="field" readonly value="${esc(response.invitationCode)}"><button class="button secondary" type="button" data-action="copy-invitation-code">Copy code</button><span class="form-hint">Expires ${esc(dateText(response.invitation.expiresAt))}. The invitee must register with this email address.</span></div>`;
      form.reset();
    } else if (form.id === 'alert-settings-form') {
      data.alertDays = Number(data.alertDays);
      const response = await api('/settings', { method: 'PATCH', body: JSON.stringify(data) });
      state.alertDays = response.alertDays;
      await navigate('settings');
      toast('Alert settings saved');
    } else if (form.id === 'ai-sharing-form') {
      const aiDataSharingEnabled = form.elements.aiDataSharingEnabled.checked;
      const response = await api('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ aiDataSharingEnabled })
      });
      state.aiDataSharingEnabled = response.aiDataSharingEnabled;
      toast('AI data-sharing preference saved');
    } else if (form.id === 'assistant-form') {
      const query = data.query.trim();
      if (!query) return;
      appendChat(query, true);
      $('#assistant-question').value = '';
      submit.disabled = true;
      try {
        const response = await api('/assistant', { method: 'POST', body: JSON.stringify({ query }) });
        appendChat(response.answer);
      } catch (error) {
        appendChat(`I could not retrieve that inventory information: ${error.message}`);
      }
    }
  } catch (error) {
    toast(error.message, true);
  } finally {
    if (submit && document.body.contains(submit)) submit.disabled = false;
  }
});

document.addEventListener('input', (event) => {
  const form = event.target.form;
  if (form?.id === 'login-form') $('#login-feedback').textContent = '';
  if (form?.id === 'register-form') $('#register-feedback').textContent = '';
});

async function downloadReport() {
  const from = $('#report-from')?.value;
  const to = $('#report-to')?.value;
  const params = new URLSearchParams({ format: 'csv' });
  if (from) params.set('from', from);
  if (to) params.set('to', `${to}T23:59:59.999`);
  const response = await fetch(`${API_BASE}/reports/inventory?${params}`, { credentials: 'include' });
  if (!response.ok) {
    const message = (await response.json().catch(() => ({}))).error || 'Could not export the report';
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'medtrack-inventory-report.csv';
  link.click();
  URL.revokeObjectURL(url);
  toast('CSV report downloaded');
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    $('#global-search')?.focus();
  }
  if (event.key === 'Enter' && event.target.id === 'global-search' && event.target.value.trim()) {
    state.search = event.target.value.trim();
    navigate('medicines');
  }
});

$('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#register-role').addEventListener('change', (event) => {
  syncInvitationRegistration();
});
$('#invitation-toggle').addEventListener('click', () => {
  const toggle = $('#invitation-toggle');
  const opening = toggle.getAttribute('aria-expanded') !== 'true';
  toggle.setAttribute('aria-expanded', String(opening));
  if (!opening) $('#register-invite-code').value = '';
  syncInvitationRegistration();
  if (opening) $('#register-invite-code').focus();
});
$('#register-invite-code').addEventListener('input', syncInvitationRegistration);
$('#modal-backdrop').addEventListener('click', (event) => {
  if (event.target.id === 'modal-backdrop') closeModal();
});

async function initialize() {
  try {
    const response = await api('/auth/me');
    state.user = response.user;
    showApp();
  } catch (error) {
    showAuthPage(window.location.hash === '#register' ? 'register' : 'login');
    if (error.status !== 401) $('#login-feedback').textContent = `Could not verify your account: ${error.message}`;
    return;
  }
  try {
    const [notifications, settings] = await Promise.all([api('/notifications'), api('/settings')]);
    state.alertDays = settings.alertDays;
    state.aiDataSharingEnabled = settings.aiDataSharingEnabled;
    $('#alert-dot').classList.toggle('hidden', !notifications.notifications.some((item) => !item.read));
  } catch (error) {
    toast(error.message, true);
  }
}

initialize();

function syncInvitationRegistration() {
  const inviteCode = $('#register-invite-code').value.trim();
  const invitationToggle = $('#invitation-toggle');
  const inviteCodeField = $('#invite-code-field');
  if (inviteCode) invitationToggle.setAttribute('aria-expanded', 'true');
  const invitationOpen = invitationToggle.getAttribute('aria-expanded') === 'true';
  inviteCodeField.classList.toggle('hidden', !invitationOpen);
  invitationToggle.textContent = invitationOpen
    ? 'Create a new private workspace instead'
    : 'Have an invitation? Join an existing workspace';
  const roleField = $('#register-role').closest('.form-field');
  const organizationField = $('#organization-field');
  const roleInput = $('#register-role');
  const organizationInput = $('#register-organization');
  const invited = inviteCode.length > 0;
  roleField.classList.toggle('hidden', invited);
  roleInput.disabled = invited;
  const requiresOrganization = !invited && (roleInput.value === 'pharmacy' || roleInput.value === 'clinic');
  organizationField.classList.toggle('hidden', !requiresOrganization);
  organizationInput.required = requiresOrganization;
  organizationInput.disabled = invited;
  if (!requiresOrganization) organizationInput.value = '';
}
