// ════════════════════════════════════════════════════════════
// CLEAR DEBT v2 — Payment Chase & Collection
// Grouped by client, list view, classification guide
// ════════════════════════════════════════════════════════════

var _clearDebtData = null;
var _clearDebtFilter = 'all';
var _clearDebtSearch = '';
var _clearDebtViewMode = 'cards';
var _clearDebtSort = { col: 'total', asc: false };

var _debtClassLabels = {
  unclassified: { label: 'Unclassified', icon: '\u2B1C', color: '#999', short: 'Triage' },
  genuine_debt: { label: 'Genuine Debt', icon: '\uD83D\uDD34', color: '#e74c3c', short: 'Chase' },
  blocked_by_us: { label: 'Blocked by Us', icon: '\uD83D\uDFE1', color: '#f39c12', short: 'Blocked' },
  in_dispute: { label: 'In Dispute', icon: '\uD83D\uDFE0', color: '#e67e22', short: 'Dispute' },
  bad_debt: { label: 'Bad Debt', icon: '\u26AB', color: '#2c3e50', short: 'Written Off' },
};

// ── Phone formatting ──
function _fmtPhone(p) {
  if (!p) return '';
  var clean = p.replace(/[\s\-\(\)\.]/g, '');
  if (clean.startsWith('+61')) clean = '0' + clean.slice(3);
  if (clean.startsWith('61') && clean.length === 11) clean = '0' + clean.slice(2);
  if (clean.length === 10 && clean.startsWith('0')) {
    return clean.slice(0, 4) + ' ' + clean.slice(4, 7) + ' ' + clean.slice(7);
  }
  return p;
}

// ── Worst classification for a client (for list view) ──
function _worstClassification(invoices) {
  var priority = ['genuine_debt', 'in_dispute', 'blocked_by_us', 'unclassified', 'bad_debt'];
  for (var i = 0; i < priority.length; i++) {
    if (invoices.some(function(inv) { return inv.classification === priority[i]; })) return priority[i];
  }
  return 'unclassified';
}

// ── Oldest overdue days for a client ──
function _oldestDays(invoices) {
  return Math.max.apply(null, invoices.map(function(inv) { return inv.days_overdue || 0; }));
}

// ── Last chase description ──
function _lastChaseDesc(invoices) {
  var methodIcons = { call: '\uD83D\uDCDE', sms: '\uD83D\uDCAC', auto_sms: '\uD83E\uDD16', email: '\uD83D\uDCE7', note: '\uD83D\uDCDD', status_change: '\uD83C\uDFF7' };
  var allLogs = [];
  invoices.forEach(function(inv) { allLogs = allLogs.concat(inv.chase_logs || []); });
  allLogs.sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  if (allLogs.length === 0) return 'Never';
  var log = allLogs[0];
  return (methodIcons[log.method] || '') + ' ' + fmtDate(log.created_at) + (log.outcome ? ' \u2014 ' + log.outcome : '');
}

// ── Filter clients ──
function _filterClients(data) {
  if (!data || !data.clients) return [];
  var today = new Date().toISOString().slice(0, 10);

  return data.clients.filter(function(client) {
    // Search filter
    if (_clearDebtSearch) {
      var hay = ((client.contact_name || '') + ' ' + client.invoices.map(function(i) { return (i.invoice_number || '') + ' ' + (i.job_number || '') + ' ' + (i.reference || ''); }).join(' ')).toLowerCase();
      if (hay.indexOf(_clearDebtSearch) === -1) return false;
    }
    // Classification filter
    if (_clearDebtFilter === 'all') return true;
    if (_clearDebtFilter === 'followups') {
      return client.invoices.some(function(inv) { return inv.next_follow_up && inv.next_follow_up <= today; });
    }
    return client.invoices.some(function(inv) { return inv.classification === _clearDebtFilter; });
  });
}

// ════════════════════════════════════════════════════════════
// LOAD + RENDER
// ════════════════════════════════════════════════════════════

async function loadClearDebt() {
  var container = document.getElementById('clearDebtCards');
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sw-text-sec);">Loading overdue invoices...</div>';

  try {
    _clearDebtData = await opsFetch('list_overdue_invoices');
    renderClearDebtStats(_clearDebtData);
    renderClearDebtFilters();
    _renderClearDebtView();
  } catch (e) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sw-red);">Error: ' + e.message + '</div>';
  }
}

function _renderClearDebtView() {
  if (_clearDebtViewMode === 'list') {
    renderClearDebtList(_clearDebtData);
  } else {
    renderClearDebtCards(_clearDebtData);
  }
}

// ════════════════════════════════════════════════════════════
// STATS BAR
// ════════════════════════════════════════════════════════════

function renderClearDebtStats(data) {
  var el = document.getElementById('clearDebtStats');
  var s = data.stats || {};
  var a = data.amounts || {};

  var html = '';
  // Total overdue — larger
  html += '<div class="stat-card" style="grid-column:span 2;border-left:4px solid var(--sw-red);">';
  html += '<div class="stat-body"><div class="stat-label" style="display:flex;align-items:center;gap:6px;">TOTAL OVERDUE <button onclick="showClassificationGuide()" style="background:none;border:1px solid var(--sw-border);border-radius:50%;width:20px;height:20px;font-size:12px;cursor:pointer;color:var(--sw-text-sec);line-height:1;" title="Classification guide">?</button></div>';
  html += '<div class="stat-value" style="color:var(--sw-red);font-size:24px;">' + fmt$(data.total_outstanding) + '</div>';
  html += '<div class="stat-sub">' + data.total_invoices + ' invoices \u00B7 ' + data.total_clients + ' clients</div></div></div>';

  // Classification cards — skip zero-value ones
  var classKeys = ['genuine_debt', 'blocked_by_us', 'in_dispute', 'unclassified', 'bad_debt'];
  classKeys.forEach(function(key) {
    var count = s[key] || 0;
    var amount = a[key] || 0;
    if (count === 0 && key !== 'genuine_debt' && key !== 'unclassified') return; // hide empty non-critical cards
    var c = _debtClassLabels[key];
    var muted = count === 0 ? 'opacity:0.5;' : '';
    html += '<div class="stat-card" style="cursor:pointer;border-left:3px solid ' + c.color + ';' + muted + '" onclick="filterClearDebt(\'' + key + '\')">';
    html += '<div class="stat-body"><div class="stat-label">' + c.icon + ' ' + c.label + '</div>';
    html += '<div class="stat-value" style="font-size:16px;">' + fmt$(amount) + '</div>';
    html += '<div class="stat-sub">' + count + ' invoice' + (count !== 1 ? 's' : '') + '</div></div></div>';
  });

  el.innerHTML = html;
}

// ════════════════════════════════════════════════════════════
// FILTER BAR + VIEW TOGGLE
// ════════════════════════════════════════════════════════════

function renderClearDebtFilters() {
  var el = document.getElementById('clearDebtFilters');
  var filters = [
    { key: 'all', label: 'All' },
    { key: 'genuine_debt', label: '\uD83D\uDD34 Chase' },
    { key: 'blocked_by_us', label: '\uD83D\uDFE1 Blocked' },
    { key: 'in_dispute', label: '\uD83D\uDFE0 Dispute' },
    { key: 'unclassified', label: '\u2B1C Triage' },
    { key: 'followups', label: '\u23F0 Follow-ups' },
    { key: 'bad_debt', label: '\u26AB Written Off' },
  ];

  var html = filters.map(function(f) {
    return '<button class="filter-chip' + (_clearDebtFilter === f.key ? ' active' : '') + '" onclick="filterClearDebt(\'' + f.key + '\')">' + f.label + '</button>';
  }).join('');

  // View toggle
  html += '<div style="margin-left:auto;display:flex;gap:2px;border:1px solid var(--sw-border);border-radius:6px;overflow:hidden;">';
  html += '<button style="padding:4px 10px;font-size:11px;border:none;cursor:pointer;background:' + (_clearDebtViewMode === 'cards' ? 'var(--sw-dark);color:#fff' : '#fff;color:var(--sw-text-sec)') + ';" onclick="setClearDebtView(\'cards\')">Cards</button>';
  html += '<button style="padding:4px 10px;font-size:11px;border:none;cursor:pointer;background:' + (_clearDebtViewMode === 'list' ? 'var(--sw-dark);color:#fff' : '#fff;color:var(--sw-text-sec)') + ';" onclick="setClearDebtView(\'list\')">List</button>';
  html += '</div>';

  html += '<input type="text" class="filter-search" id="clearDebtSearch" placeholder="Search name / job#..." oninput="searchClearDebt(this.value)" style="width:160px;" value="' + (_clearDebtSearch || '') + '">';

  el.innerHTML = html;
}

function filterClearDebt(key) {
  _clearDebtFilter = key;
  renderClearDebtFilters();
  _renderClearDebtView();
}

function searchClearDebt(q) {
  _clearDebtSearch = (q || '').toLowerCase();
  _renderClearDebtView();
}

function setClearDebtView(mode) {
  _clearDebtViewMode = mode;
  renderClearDebtFilters();
  _renderClearDebtView();
}

// ════════════════════════════════════════════════════════════
// CARD VIEW — grouped by client
// ════════════════════════════════════════════════════════════

function renderClearDebtCards(data) {
  var container = document.getElementById('clearDebtCards');
  var clients = _filterClients(data);

  if (clients.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sw-text-sec);">' + (data && data.clients && data.clients.length > 0 ? 'No clients matching filter.' : 'No overdue invoices. Nice work!') + '</div>';
    return;
  }

  container.innerHTML = clients.map(function(client) { return _renderClientCard(client); }).join('');
}

function _renderClientCard(client) {
  var worst = _worstClassification(client.invoices);
  var wc = _debtClassLabels[worst];
  var oldest = _oldestDays(client.invoices);
  var agingColor = oldest <= 30 ? '#27ae60' : oldest <= 60 ? '#f39c12' : '#e74c3c';
  var hasGHL = !!client.ghl_contact_id;
  var today = new Date().toISOString().slice(0, 10);
  var hasFollowUp = client.invoices.some(function(inv) { return inv.next_follow_up && inv.next_follow_up <= today; });

  var html = '<div class="chase-card" style="background:#fff;border:1px solid var(--sw-border);border-left:4px solid ' + wc.color + ';border-radius:8px;padding:16px;">';

  // ── Header: client name + total ──
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">';
  html += '<div style="flex:1;min-width:180px;">';
  html += '<div style="font-weight:700;font-size:16px;color:var(--sw-dark);">' + (client.contact_name || 'Unknown') + '</div>';
  if (client.phone) html += '<div style="font-size:12px;color:var(--sw-text-sec);">' + _fmtPhone(client.phone) + '</div>';
  if (client.email) html += '<div style="font-size:11px;color:var(--sw-text-sec);overflow:hidden;text-overflow:ellipsis;">' + client.email + '</div>';
  html += '</div>';
  html += '<div style="text-align:right;">';
  html += '<div style="font-size:22px;font-weight:700;color:' + agingColor + ';font-family:var(--sw-font-num);">' + fmt$(client.total_owed) + '</div>';
  html += '<div style="font-size:11px;color:var(--sw-text-sec);">' + client.invoices.length + ' invoice' + (client.invoices.length !== 1 ? 's' : '') + ' \u00B7 ' + oldest + 'd oldest</div>';
  html += '</div>';
  html += '</div>';

  // ── Follow-up alert ──
  if (hasFollowUp) {
    var fuInv = client.invoices.find(function(inv) { return inv.next_follow_up && inv.next_follow_up <= today; });
    html += '<div style="margin-top:6px;padding:6px 10px;background:#fef3f2;border-radius:6px;font-size:12px;color:#e74c3c;font-weight:600;">';
    html += '\u23F0 Follow-up due ' + fmtDate(fuInv.next_follow_up);
    html += '</div>';
  }

  // ── Invoice sub-rows ──
  html += '<div style="margin-top:10px;border-top:1px solid var(--sw-border);padding-top:8px;">';
  client.invoices.forEach(function(inv) {
    var c = _debtClassLabels[inv.classification] || _debtClassLabels.unclassified;
    var invAgingColor = inv.days_overdue <= 30 ? '#27ae60' : inv.days_overdue <= 60 ? '#f39c12' : '#e74c3c';

    html += '<div style="display:flex;align-items:center;gap:6px;padding:5px 0;flex-wrap:wrap;font-size:12px;">';
    // Invoice number + amount + days
    html += '<span style="font-weight:600;color:var(--sw-dark);min-width:70px;">' + (inv.invoice_number || '-') + '</span>';
    if (inv.job_type) html += '<span style="color:var(--sw-text-sec);font-size:11px;">' + inv.job_type + '</span>';
    if (inv.job_number) html += '<span style="color:var(--sw-text-sec);font-size:11px;">' + inv.job_number + '</span>';
    html += '<span style="font-weight:600;color:' + invAgingColor + ';font-family:var(--sw-font-num);">' + fmt$(inv.amount_due) + '</span>';
    html += '<span style="color:' + invAgingColor + ';font-size:11px;">' + inv.days_overdue + 'd</span>';

    // Classification badge
    html += '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:' + c.color + '18;color:' + c.color + ';font-weight:600;">';
    html += c.icon + ' ' + c.short;
    if (inv.auto_classified) html += ' <span style="opacity:0.6;">(auto)</span>';
    html += '</span>';

    // Warning flags
    if (inv.flags && inv.flags.length > 0) {
      inv.flags.forEach(function(flag) {
        html += '<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:#fff3cd;color:#856404;">\u26A0 ' + flag + '</span>';
      });
    }

    // Per-invoice actions (classify + classification-specific)
    html += '<span style="margin-left:auto;display:flex;gap:4px;">';
    html += '<button class="btn btn-sm" style="font-size:10px;padding:2px 6px;" onclick="clearDebtClassify(\'' + _esc(inv.xero_invoice_id) + '\',\'' + inv.classification + '\',\'' + (inv.ghl_contact_id || client.ghl_contact_id || '') + '\',\'' + _esc(inv.invoice_number) + '\',\'' + _esc(inv.job_number || '') + '\',\'' + (inv.amount_due || 0) + '\')">Classify</button>';
    if (inv.classification === 'blocked_by_us') {
      html += '<button class="btn btn-sm btn-primary" style="font-size:10px;padding:2px 6px;" onclick="clearDebtResolveBlocker(\'' + _esc(inv.xero_invoice_id) + '\',\'' + (inv.ghl_contact_id || client.ghl_contact_id || '') + '\',\'' + _esc(inv.invoice_number) + '\',\'' + _esc(inv.job_number || '') + '\',\'' + (inv.amount_due || 0) + '\')">\u2705 Resolved</button>';
    }
    if (inv.classification === 'in_dispute') {
      html += '<button class="btn btn-sm btn-primary" style="font-size:10px;padding:2px 6px;" onclick="clearDebtResolveDispute(\'' + _esc(inv.xero_invoice_id) + '\',\'' + (inv.ghl_contact_id || client.ghl_contact_id || '') + '\',\'' + _esc(inv.invoice_number) + '\',\'' + _esc(inv.job_number || '') + '\',\'' + (inv.amount_due || 0) + '\')">\u2705 Resolved</button>';
      html += '<button class="btn btn-sm" style="font-size:10px;padding:2px 6px;color:var(--sw-red);" onclick="clearDebtClassifyDirect(\'' + _esc(inv.xero_invoice_id) + '\',\'bad_debt\',\'' + (inv.ghl_contact_id || client.ghl_contact_id || '') + '\')">Write Off</button>';
    }
    if (inv.classification === 'bad_debt') {
      html += '<button class="btn btn-sm" style="font-size:10px;padding:2px 6px;" onclick="clearDebtClassifyDirect(\'' + _esc(inv.xero_invoice_id) + '\',\'unclassified\',\'' + (inv.ghl_contact_id || client.ghl_contact_id || '') + '\')">\u21A9 Reopen</button>';
    }
    html += '</span>';
    html += '</div>';
  });
  html += '</div>';

  // ── Chase history (aggregate across all invoices) ──
  var allLogs = [];
  client.invoices.forEach(function(inv) { allLogs = allLogs.concat(inv.chase_logs || []); });
  allLogs.sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  if (allLogs.length > 0) {
    html += '<div style="margin-top:8px;border-top:1px solid var(--sw-border);padding-top:6px;">';
    html += '<div style="font-size:10px;font-weight:600;color:var(--sw-text-sec);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Chase History</div>';
    var methodIcons = { call: '\uD83D\uDCDE', sms: '\uD83D\uDCAC', auto_sms: '\uD83E\uDD16', email: '\uD83D\uDCE7', note: '\uD83D\uDCDD', status_change: '\uD83C\uDFF7' };
    allLogs.slice(0, 3).forEach(function(log) {
      var icon = methodIcons[log.method] || '\u2022';
      html += '<div style="font-size:11px;color:var(--sw-text-sec);margin-bottom:1px;">';
      html += icon + ' ' + fmtDate(log.created_at) + ' \u2014 ';
      if (log.outcome) html += '<strong>' + log.outcome + '</strong>';
      if (log.notes) html += ' ' + log.notes.substring(0, 80) + (log.notes.length > 80 ? '...' : '');
      html += '</div>';
    });
    html += '</div>';
  }

  // ── Client-level action buttons ──
  var ghlId = client.ghl_contact_id || '';
  var firstInvId = client.invoices[0]?.xero_invoice_id || '';
  var firstJobId = client.invoices.find(function(i) { return i.job_id; })?.job_id || '';
  var totalAmount = client.total_owed || 0;
  var firstInvNum = client.invoices[0]?.invoice_number || '';

  html += '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;align-items:center;">';
  // Primary actions
  if (hasGHL) {
    html += '<button class="btn btn-sm" style="font-size:11px;" onclick="clearDebtCall(\'' + ghlId + '\',\'' + _esc(client.contact_name) + '\',\'' + _esc(firstInvId) + '\',\'' + firstJobId + '\')">\uD83D\uDCDE Call</button>';
    html += '<button class="btn btn-sm" style="font-size:11px;" onclick="clearDebtSMS(\'' + ghlId + '\',\'' + _esc(client.contact_name) + '\',\'' + _esc(firstInvId) + '\',\'' + firstJobId + '\',\'' + _esc(firstInvNum) + '\',\'' + totalAmount + '\')">\uD83D\uDCAC SMS</button>';
  }
  if (firstJobId) {
    html += '<button class="btn btn-sm" style="font-size:11px;" onclick="clearDebtPayLink(\'' + firstJobId + '\')">\uD83D\uDCB3 Pay Link</button>';
  }
  // Secondary actions — visible but less prominent
  html += '<span style="margin-left:auto;display:flex;gap:4px;">';
  html += '<button class="btn btn-sm" style="font-size:10px;color:var(--sw-text-sec);" onclick="clearDebtLogChase(\'' + _esc(firstInvId) + '\',\'' + firstJobId + '\',\'' + ghlId + '\',\'' + _esc(client.contact_name) + '\')">\uD83D\uDCCB Log</button>';
  html += '<button class="btn btn-sm" style="font-size:10px;color:var(--sw-text-sec);" onclick="clearDebtNote(\'' + _esc(firstInvId) + '\',\'' + firstJobId + '\',\'' + ghlId + '\',\'' + _esc(client.contact_name) + '\')">\uD83D\uDCDD Note</button>';
  html += '</span>';
  html += '</div>';

  html += '</div>';
  return html;
}

// ════════════════════════════════════════════════════════════
// LIST VIEW — sortable table
// ════════════════════════════════════════════════════════════

function renderClearDebtList(data) {
  var container = document.getElementById('clearDebtCards');
  var clients = _filterClients(data);

  if (clients.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sw-text-sec);">No clients matching filter.</div>';
    return;
  }

  // Sort
  var col = _clearDebtSort.col;
  var asc = _clearDebtSort.asc;
  clients.sort(function(a, b) {
    var va, vb;
    if (col === 'name') { va = a.contact_name || ''; vb = b.contact_name || ''; return asc ? va.localeCompare(vb) : vb.localeCompare(va); }
    if (col === 'invoices') { va = a.invoices.length; vb = b.invoices.length; }
    else if (col === 'total') { va = a.total_owed || 0; vb = b.total_owed || 0; }
    else if (col === 'oldest') { va = _oldestDays(a.invoices); vb = _oldestDays(b.invoices); }
    else { va = a.total_owed || 0; vb = b.total_owed || 0; }
    return asc ? va - vb : vb - va;
  });

  var arrow = function(c) { return _clearDebtSort.col === c ? (_clearDebtSort.asc ? ' \u25B2' : ' \u25BC') : ''; };

  var html = '<div class="data-table-wrap" style="overflow-x:auto;">';
  html += '<table class="data-table" style="width:100%;border-collapse:collapse;font-size:12px;">';
  html += '<thead><tr style="border-bottom:2px solid var(--sw-border);text-align:left;">';
  html += '<th style="cursor:pointer;padding:8px 6px;" onclick="sortClearDebt(\'name\')">Client' + arrow('name') + '</th>';
  html += '<th style="padding:8px 6px;">Phone</th>';
  html += '<th style="cursor:pointer;padding:8px 6px;text-align:center;" onclick="sortClearDebt(\'invoices\')">Inv' + arrow('invoices') + '</th>';
  html += '<th style="cursor:pointer;padding:8px 6px;text-align:right;" onclick="sortClearDebt(\'total\')">Total Owed' + arrow('total') + '</th>';
  html += '<th style="cursor:pointer;padding:8px 6px;text-align:center;" onclick="sortClearDebt(\'oldest\')">Oldest' + arrow('oldest') + '</th>';
  html += '<th style="padding:8px 6px;">Status</th>';
  html += '<th style="padding:8px 6px;">Last Chase</th>';
  html += '</tr></thead><tbody>';

  clients.forEach(function(client) {
    var worst = _worstClassification(client.invoices);
    var wc = _debtClassLabels[worst];
    var oldest = _oldestDays(client.invoices);
    var agingColor = oldest <= 30 ? '#27ae60' : oldest <= 60 ? '#f39c12' : '#e74c3c';
    var lastChase = _lastChaseDesc(client.invoices);

    html += '<tr style="cursor:pointer;border-bottom:1px solid var(--sw-border);" onclick="setClearDebtView(\'cards\');_clearDebtSearch=\'' + _esc((client.contact_name || '').toLowerCase()) + '\';searchClearDebt(\'' + _esc((client.contact_name || '').toLowerCase()) + '\')" onmouseover="this.style.background=\'#f8f8f8\'" onmouseout="this.style.background=\'\'">';
    html += '<td style="padding:8px 6px;font-weight:600;color:var(--sw-dark);">' + (client.contact_name || 'Unknown') + '</td>';
    html += '<td style="padding:8px 6px;color:var(--sw-text-sec);white-space:nowrap;">' + _fmtPhone(client.phone) + '</td>';
    html += '<td style="padding:8px 6px;text-align:center;">' + client.invoices.length + '</td>';
    html += '<td style="padding:8px 6px;text-align:right;font-weight:700;color:' + agingColor + ';font-family:var(--sw-font-num);">' + fmt$(client.total_owed) + '</td>';
    html += '<td style="padding:8px 6px;text-align:center;color:' + agingColor + ';font-weight:600;">' + oldest + 'd</td>';
    html += '<td style="padding:8px 6px;"><span style="font-size:11px;padding:2px 8px;border-radius:10px;background:' + wc.color + '18;color:' + wc.color + ';font-weight:600;">' + wc.icon + ' ' + wc.short + '</span></td>';
    html += '<td style="padding:8px 6px;font-size:11px;color:var(--sw-text-sec);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + lastChase + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function sortClearDebt(col) {
  if (_clearDebtSort.col === col) {
    _clearDebtSort.asc = !_clearDebtSort.asc;
  } else {
    _clearDebtSort.col = col;
    _clearDebtSort.asc = col === 'name'; // name asc by default, everything else desc
  }
  renderClearDebtList(_clearDebtData);
}

// ════════════════════════════════════════════════════════════
// CLASSIFICATION GUIDE
// ════════════════════════════════════════════════════════════

function showClassificationGuide() {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML =
    '<div style="background:#fff;border-radius:12px;padding:24px;max-width:560px;width:94%;max-height:85vh;overflow-y:auto;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h3 style="margin:0;color:var(--sw-dark);font-size:16px;">Classification Guide</h3>' +
        '<button onclick="this.closest(\'.modal-overlay\').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:#999;">&times;</button>' +
      '</div>' +

      _guideSection('\uD83D\uDD34', 'GENUINE DEBT (Chase)', '#e74c3c',
        'Job is complete. Invoice is correct. Client owes us money. They\'ve either forgotten, are delaying, or are avoiding payment.',
        'Call them, send pay link, follow up.') +

      _guideSection('\uD83D\uDFE1', 'BLOCKED BY US', '#f39c12',
        'Something on OUR side is preventing us from chasing payment. Examples: job isn\'t finished yet, invoice was sent with wrong amount, scope change hasn\'t been agreed, council inspection pending.',
        'Fix the blocker first. Don\'t contact the client about money until our side is sorted.') +

      _guideSection('\uD83D\uDFE0', 'IN DISPUTE', '#e67e22',
        'The client has raised an issue \u2014 quality complaint, scope disagreement, damage claim, or they believe the work isn\'t complete.',
        'Resolve the dispute. This is a relationship conversation, not a payment conversation.') +

      _guideSection('\u2B1C', 'UNCLASSIFIED (Triage)', '#999',
        'Nobody has looked at this yet. Could be genuine debt, could be an accounting error, could be a job we haven\'t finished.',
        'Review and classify. Check if the job is done, if the invoice is correct, if there\'s a dispute.') +

      _guideSection('\u26AB', 'BAD DEBT (Written Off)', '#2c3e50',
        'We\'ve tried everything. Client is uncontactable, refusing to pay, or the business has closed. Formally written off.',
        'None. Logged for records. Can be reopened if circumstances change.') +

      '<div style="margin-top:16px;padding:12px;background:var(--sw-bg);border-radius:8px;font-size:12px;color:var(--sw-text-sec);">' +
        '<div style="font-weight:600;margin-bottom:6px;color:var(--sw-dark);">How Auto-Classification Works</div>' +
        '<div>\u2022 Job not complete (quoted, scheduled, in progress) \u2192 auto \uD83D\uDFE1 Blocked by Us</div>' +
        '<div>\u2022 Job complete with no disputes \u2192 auto \uD83D\uDD34 Genuine Debt</div>' +
        '<div>\u2022 No job linked to invoice \u2192 stays \u2B1C Unclassified with warning flag</div>' +
        '<div style="margin-top:4px;font-style:italic;">You can override any auto-classification with one tap.</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
}

function _guideSection(icon, title, color, description, action) {
  return '<div style="padding:10px 0;border-bottom:1px solid var(--sw-border);">' +
    '<div style="font-weight:700;font-size:13px;color:' + color + ';margin-bottom:4px;">' + icon + ' ' + title + '</div>' +
    '<div style="font-size:12px;color:var(--sw-dark);margin-bottom:4px;">' + description + '</div>' +
    '<div style="font-size:11px;color:var(--sw-text-sec);"><strong>Action:</strong> ' + action + '</div>' +
  '</div>';
}

// ════════════════════════════════════════════════════════════
// ACTIONS (unchanged from v1 — all work at client level now)
// ════════════════════════════════════════════════════════════

function _esc(s) { return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function clearDebtCall(ghlContactId, contactName, xeroInvoiceId, jobId) {
  window.open('https://app.maxlead.com.au/v2/location/' + GHL_LOCATION_ID + '/contacts/' + ghlContactId, '_blank');
  setTimeout(function() {
    if (confirm('Log the call outcome for ' + contactName + '?')) {
      clearDebtLogChase(xeroInvoiceId, jobId, ghlContactId, contactName, 'call');
    }
  }, 1000);
}

function clearDebtSMS(ghlContactId, contactName, xeroInvoiceId, jobId, invoiceNumber, amount) {
  var firstName = (contactName || '').split(' ')[0] || 'there';
  var template = 'Hi ' + firstName + ', just a friendly reminder that invoice ' + (invoiceNumber || '') + ' for $' + Math.round(Number(amount)).toLocaleString() + ' is now overdue. You can pay online or please get in touch if you have any questions.\n\nThanks,\nSecureWorks WA';

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:12px;padding:24px;max-width:480px;width:92%;">' +
      '<h3 style="margin:0 0 12px;color:var(--sw-dark);">SMS to ' + contactName + '</h3>' +
      '<textarea id="chaseSmsText" style="width:100%;height:120px;border:1px solid var(--sw-border);border-radius:6px;padding:10px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:inherit;">' + template + '</textarea>' +
      '<div style="font-size:11px;color:var(--sw-text-sec);margin-top:4px;">Edit the message above before sending.</div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">' +
        '<button class="btn btn-sm" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
        '<button class="btn btn-sm btn-primary" onclick="clearDebtSendSMS(\'' + ghlContactId + '\',\'' + _esc(xeroInvoiceId) + '\',\'' + (jobId || '') + '\')">Send SMS</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  overlay.querySelector('textarea').focus();
}

async function clearDebtSendSMS(ghlContactId, xeroInvoiceId, jobId) {
  var text = document.getElementById('chaseSmsText');
  if (!text || !text.value.trim()) { showToast('Message is empty', 'warning'); return; }

  try {
    await opsPost('send_chase_sms', { ghl_contact_id: ghlContactId, xero_invoice_id: xeroInvoiceId || null, job_id: jobId || null, message: text.value.trim() });
    showToast('SMS sent', 'success');
    text.closest('.modal-overlay').remove();
    loadClearDebt();
  } catch (e) { showToast('SMS failed: ' + e.message, 'warning'); }
}

async function clearDebtPayLink(jobId) {
  try {
    showToast('Sending payment link...', 'info');
    var result = await opsPost('send_payment_link', { job_id: jobId });
    showToast('Payment link sent: ' + (result.invoice_number || ''), 'success');
    loadClearDebt();
  } catch (e) { showToast('Failed: ' + e.message, 'warning'); }
}

function clearDebtLogChase(xeroInvoiceId, jobId, ghlContactId, contactName, defaultMethod) {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:12px;padding:24px;max-width:480px;width:92%;">' +
      '<h3 style="margin:0 0 16px;color:var(--sw-dark);">Log Chase \u2014 ' + contactName + '</h3>' +
      '<label style="font-size:12px;font-weight:600;color:var(--sw-text-sec);display:block;margin-bottom:4px;">Method</label>' +
      '<select id="chaseMethod" class="form-input" style="width:100%;margin-bottom:12px;">' +
        '<option value="call"' + (defaultMethod === 'call' ? ' selected' : '') + '>\uD83D\uDCDE Call</option>' +
        '<option value="sms">\uD83D\uDCAC SMS</option><option value="email">\uD83D\uDCE7 Email</option></select>' +
      '<label style="font-size:12px;font-weight:600;color:var(--sw-text-sec);display:block;margin-bottom:4px;">Outcome</label>' +
      '<select id="chaseOutcome" class="form-input" style="width:100%;margin-bottom:12px;">' +
        '<option value="Promised to pay">Promised to pay</option><option value="No answer">No answer</option>' +
        '<option value="Voicemail">Voicemail</option><option value="Disputing">Disputing</option>' +
        '<option value="Financial difficulty">Financial difficulty</option><option value="Wrong number">Wrong number</option>' +
        '<option value="Payment plan arranged">Payment plan arranged</option><option value="Payment received">Payment received</option></select>' +
      '<label style="font-size:12px;font-weight:600;color:var(--sw-text-sec);display:block;margin-bottom:4px;">Follow up in</label>' +
      '<select id="chaseFollowUp" class="form-input" style="width:100%;margin-bottom:12px;">' +
        '<option value="">No follow-up</option><option value="1" selected>Tomorrow</option><option value="3">3 days</option>' +
        '<option value="7">1 week</option><option value="14">2 weeks</option><option value="30">1 month</option></select>' +
      '<label style="font-size:12px;font-weight:600;color:var(--sw-text-sec);display:block;margin-bottom:4px;">Notes</label>' +
      '<textarea id="chaseNotes" class="form-input" style="width:100%;height:60px;resize:vertical;box-sizing:border-box;" placeholder="Any extra details..."></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">' +
        '<button class="btn btn-sm" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
        '<button class="btn btn-sm btn-primary" onclick="clearDebtSubmitChase(\'' + _esc(xeroInvoiceId) + '\',\'' + (jobId || '') + '\',\'' + (ghlContactId || '') + '\',\'' + _esc(contactName) + '\')">Save</button>' +
      '</div></div>';

  document.body.appendChild(overlay);
}

async function clearDebtSubmitChase(xeroInvoiceId, jobId, ghlContactId, contactName) {
  var method = document.getElementById('chaseMethod').value;
  var outcome = document.getElementById('chaseOutcome').value;
  var followUpDays = document.getElementById('chaseFollowUp').value;
  var notes = document.getElementById('chaseNotes').value.trim();
  var followUpDate = null;
  if (followUpDays) { var d = new Date(); d.setDate(d.getDate() + parseInt(followUpDays)); followUpDate = d.toISOString().slice(0, 10); }

  try {
    await opsPost('log_chase', { xero_invoice_id: xeroInvoiceId, job_id: jobId || null, ghl_contact_id: ghlContactId || null, contact_name: contactName, method: method, outcome: outcome, notes: notes || null, follow_up_date: followUpDate });
    showToast('Chase logged', 'success');
    document.querySelector('.modal-overlay').remove();
    loadClearDebt();
  } catch (e) { showToast('Failed: ' + e.message, 'warning'); }
}

function clearDebtClassify(xeroInvoiceId, currentClassification, ghlContactId, invoiceNumber, jobNumber, amount) {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';

  var buttons = [
    { key: 'genuine_debt', label: '\uD83D\uDD34 Client Owes', color: '#e74c3c' },
    { key: 'blocked_by_us', label: '\uD83D\uDFE1 On Us', color: '#f39c12' },
    { key: 'in_dispute', label: '\uD83D\uDFE0 Dispute', color: '#e67e22' },
    { key: 'bad_debt', label: '\u26AB Bad Debt', color: '#2c3e50' },
  ];
  var btnHtml = buttons.map(function(b) {
    var active = currentClassification === b.key ? 'border:2px solid ' + b.color + ';' : '';
    return '<button class="btn btn-sm" style="flex:1;font-size:12px;' + active + '" onclick="clearDebtSetClassification(\'' + _esc(xeroInvoiceId) + '\',\'' + b.key + '\',\'' + (ghlContactId || '') + '\',\'' + _esc(invoiceNumber) + '\',\'' + _esc(jobNumber) + '\',\'' + amount + '\')">' + b.label + '</button>';
  }).join('');

  overlay.innerHTML =
    '<div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:92%;">' +
      '<h3 style="margin:0 0 16px;color:var(--sw-dark);">Classify Invoice</h3>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + btnHtml + '</div>' +
      '<div style="margin-top:12px;"><input type="text" id="classifyReason" class="form-input" style="width:100%;box-sizing:border-box;" placeholder="Reason (optional)"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;"><button class="btn btn-sm" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button></div>' +
    '</div>';

  document.body.appendChild(overlay);
}

async function clearDebtSetClassification(xeroInvoiceId, classification, ghlContactId, invoiceNumber, jobNumber, amount) {
  var reason = document.getElementById('classifyReason')?.value?.trim() || '';
  try {
    await opsPost('classify_invoice', { xero_invoice_id: xeroInvoiceId, classification: classification, reason: reason || null });
    if (ghlContactId) {
      if (classification === 'genuine_debt') {
        await opsPost('trigger_chase_workflow', { ghl_contact_id: ghlContactId, overdue_amount: amount, invoice_number: invoiceNumber, job_number: jobNumber });
      } else {
        await opsPost('stop_chase_workflow', { ghl_contact_id: ghlContactId });
      }
    }
    showToast('Classified as ' + _debtClassLabels[classification].label, 'success');
    var overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.remove();
    loadClearDebt();
  } catch (e) { showToast('Failed: ' + e.message, 'warning'); }
}

async function clearDebtClassifyDirect(xeroInvoiceId, classification, ghlContactId) {
  try {
    await opsPost('classify_invoice', { xero_invoice_id: xeroInvoiceId, classification: classification, reason: classification === 'bad_debt' ? 'Written off' : classification === 'unclassified' ? 'Reopened' : null });
    if (ghlContactId && classification !== 'genuine_debt') { await opsPost('stop_chase_workflow', { ghl_contact_id: ghlContactId }); }
    showToast('Updated', 'success');
    loadClearDebt();
  } catch (e) { showToast('Failed: ' + e.message, 'warning'); }
}

async function clearDebtResolveBlocker(xeroInvoiceId, ghlContactId, invoiceNumber, jobNumber, amount) {
  await clearDebtSetClassification(xeroInvoiceId, 'genuine_debt', ghlContactId, invoiceNumber, jobNumber, amount);
}

async function clearDebtResolveDispute(xeroInvoiceId, ghlContactId, invoiceNumber, jobNumber, amount) {
  await clearDebtSetClassification(xeroInvoiceId, 'genuine_debt', ghlContactId, invoiceNumber, jobNumber, amount);
}

function clearDebtNote(xeroInvoiceId, jobId, ghlContactId, contactName) {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:92%;">' +
      '<h3 style="margin:0 0 12px;color:var(--sw-dark);">Ops Note \u2014 ' + contactName + '</h3>' +
      '<textarea id="chaseNoteText" class="form-input" style="width:100%;height:80px;resize:vertical;box-sizing:border-box;" placeholder="Internal note about this debt..."></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">' +
        '<button class="btn btn-sm" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
        '<button class="btn btn-sm btn-primary" onclick="clearDebtSaveNote(\'' + _esc(xeroInvoiceId) + '\',\'' + (jobId || '') + '\',\'' + (ghlContactId || '') + '\',\'' + _esc(contactName) + '\')">Save</button>' +
      '</div></div>';

  document.body.appendChild(overlay);
  overlay.querySelector('textarea').focus();
}

async function clearDebtSaveNote(xeroInvoiceId, jobId, ghlContactId, contactName) {
  var notes = document.getElementById('chaseNoteText')?.value?.trim();
  if (!notes) { showToast('Note is empty', 'warning'); return; }
  try {
    await opsPost('log_chase', { xero_invoice_id: xeroInvoiceId, job_id: jobId || null, ghl_contact_id: ghlContactId || null, contact_name: contactName, method: 'note', notes: notes });
    showToast('Note saved', 'success');
    document.querySelector('.modal-overlay').remove();
    loadClearDebt();
  } catch (e) { showToast('Failed: ' + e.message, 'warning'); }
}
