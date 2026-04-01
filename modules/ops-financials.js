// ════════════════════════════════════════════════════════════
// FINANCIALS TAB
// ════════════════════════════════════════════════════════════

function showSubTab(tab) {
  document.querySelectorAll('.sub-tab').forEach(function(el) { el.classList.remove('active'); });
  document.querySelectorAll('.sub-view').forEach(function(el) { el.classList.remove('active'); });
  var btn = document.querySelector('[data-sub="' + tab + '"]');
  if (btn) btn.classList.add('active');
  var view = document.getElementById('sub' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (view) view.classList.add('active');

  if (tab === 'invoices') loadInvoices();
  if (tab === 'pos') loadPOs();
  if (tab === 'workorders') loadWOs();
  if (tab === 'quotes') loadQuotes();
  if (tab === 'tradebills') loadTradeBills();
  if (tab === 'unreconciled') loadUnreconciled();
  if (tab === 'cleardebt') loadClearDebt();
}

async function loadFinancials() {
  loadInvoices();
}

function filterInvoices(type) {
  _invFilter = type;
  document.querySelectorAll('[data-inv-filter]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.invFilter === type);
  });
  loadInvoices();
}

function filterInvoiceStatus(status) {
  _invStatusFilter = status;
  document.querySelectorAll('[data-inv-status]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.invStatus === status);
  });
  loadInvoices();
}

function filterPOStatus(status) {
  _poStatusFilter = status;
  document.querySelectorAll('[data-po-status]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.poStatus === status);
  });
  loadPOs();
}

var _invSearchQuery = '';
var _allInvoices = [];

function filterInvoiceSearch() {
  _invSearchQuery = (document.getElementById('invSearch').value || '').toLowerCase();
  renderInvoiceTable(_allInvoices);
}

async function loadInvoices() {
  try {
    var params = { type: _invFilter, limit: 200 };
    var dateFrom = document.getElementById('invDateFrom') && document.getElementById('invDateFrom').value;
    var dateTo = document.getElementById('invDateTo') && document.getElementById('invDateTo').value;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    var data = await opsFetch('list_invoices', params);
    _allInvoices = data.invoices || [];
    renderInvoiceStats(data.summary);
    renderInvoiceTable(_allInvoices);
  } catch (e) {
    console.error('loadInvoices error:', e);
  }
}

function renderInvoiceStats(summary) {
  var container = document.getElementById('invoiceStats');
  container.innerHTML =
    '<div class="stat-card"><div class="stat-body"><div class="stat-label">Outstanding</div><div class="stat-value">' + fmt$(summary.outstanding) + '</div></div></div>' +
    '<div class="stat-card ' + (summary.overdue > 0 ? 'rag-red' : 'rag-green') + '"><div class="stat-body"><div class="stat-label">Overdue</div><div class="stat-value">' + fmt$(summary.overdue) + '</div></div></div>' +
    '<div class="stat-card"><div class="stat-body"><div class="stat-label">Total Records</div><div class="stat-value">' + (summary.total || '-') + '</div></div></div>';
}

// ── Generic table sort ──
function sortTable(tableId, colIdx, type) {
  var table = document.getElementById(tableId);
  if (!table) return;
  var thead = table.querySelector('thead');
  var tbody = table.querySelector('tbody');
  var ths = thead.querySelectorAll('th');
  var th = ths[colIdx];
  // Determine direction
  var asc = !th.classList.contains('sort-asc');
  ths.forEach(function(h) { h.classList.remove('sort-asc', 'sort-desc'); });
  th.classList.add(asc ? 'sort-asc' : 'sort-desc');
  // Sort rows
  var rows = Array.from(tbody.querySelectorAll('tr'));
  rows.sort(function(a, b) {
    var cellA = (a.cells[colIdx] || {}).textContent || '';
    var cellB = (b.cells[colIdx] || {}).textContent || '';
    if (type === 'number') {
      var na = parseFloat(cellA.replace(/[^0-9.\-]/g, '')) || 0;
      var nb = parseFloat(cellB.replace(/[^0-9.\-]/g, '')) || 0;
      return asc ? na - nb : nb - na;
    }
    if (type === 'date') {
      var da = new Date(cellA) || 0;
      var db = new Date(cellB) || 0;
      return asc ? da - db : db - da;
    }
    return asc ? cellA.localeCompare(cellB) : cellB.localeCompare(cellA);
  });
  rows.forEach(function(r) { tbody.appendChild(r); });
}

function invoiceXeroLink(inv) {
  if (!inv.xero_invoice_id) return '';
  return '<a href="https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=' + inv.xero_invoice_id + '" target="_blank" ' +
         'style="color:var(--sw-blue);text-decoration:none;font-size:11px;" title="Open in Xero">Xero&nbsp;&#8599;</a>';
}

function invoiceActions(inv) {
  var status = (inv.status || '').toUpperCase();
  var hasPaid = (inv.amount_paid || 0) > 0;
  var xLink = invoiceXeroLink(inv);

  if (status === 'DRAFT') {
    return '<button class="btn btn-sm btn-green" onclick="approveInvoice(\'' + inv.xero_invoice_id + '\',\'' + (inv.invoice_number || '') + '\',\'' + (inv.reference || '').replace(/'/g, "\\'") + '\',' + (inv.total || 0) + ')">Approve</button> ' +
           '<button class="btn btn-sm btn-red" onclick="deleteInvoice(\'' + inv.xero_invoice_id + '\',\'' + (inv.invoice_number || '') + '\',' + (inv.total || 0) + ')">Delete</button> ' + xLink;
  }
  if (status === 'AUTHORISED' || status === 'SUBMITTED') {
    if (hasPaid) return '<span style="color:var(--sw-text-sec);font-size:12px;">Has payment</span> ' + xLink;
    return '<button class="btn btn-sm btn-blue" onclick="sendInvoice(\'' + inv.xero_invoice_id + '\',\'' + (inv.invoice_number || '') + '\')">Send</button> ' +
           '<button class="btn btn-sm btn-red" onclick="voidInvoice(\'' + inv.xero_invoice_id + '\',\'' + (inv.invoice_number || '') + '\',' + (inv.total || 0) + ')">Void</button> ' + xLink;
  }
  if (status === 'PAID') return '<span style="color:var(--sw-text-sec);font-size:12px;">Paid</span> ' + xLink;
  if (status === 'VOIDED' || status === 'DELETED') return '<span style="color:var(--sw-text-sec);font-size:12px;">&mdash;</span> ' + xLink;
  return '';
}

function renderInvoiceTable(invoices) {
  var tbody = document.getElementById('invoiceTableBody');
  var todayStr = new Date().toISOString().slice(0, 10);

  // Apply status filter
  var filtered = (invoices || []).filter(function(inv) {
    if (_invStatusFilter !== 'all') {
      if (_invStatusFilter === 'overdue') {
        if (!(inv.due_date && inv.due_date < todayStr && ['AUTHORISED', 'SUBMITTED'].indexOf(inv.status) >= 0)) return false;
      } else if (inv.status !== _invStatusFilter) return false;
    }
    // Apply text search
    if (_invSearchQuery) {
      var hay = ((inv.contact_name || '') + ' ' + (inv.invoice_number || '') + ' ' + (inv.reference || '')).toLowerCase();
      if (hay.indexOf(_invSearchQuery) === -1) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No invoices' + (_invStatusFilter !== 'all' ? ' matching filter' : '') + '</td></tr>';
    return;
  }

  var html = '';
  filtered.forEach(function(inv) {
    var isOverdue = inv.due_date && inv.due_date < todayStr && ['AUTHORISED', 'SUBMITTED'].indexOf(inv.status) >= 0;
    html += '<tr style="cursor:pointer;' + (isOverdue ? 'background:rgba(231,76,60,0.04);' : '') + '" onclick="drillInvoice(\'' + (inv.reference || '').replace(/'/g, "\\'") + '\',\'' + (inv.invoice_number || '') + '\')">';
    html += '<td>' + fmtDate(inv.date) + '</td>';
    html += '<td>' + (inv.invoice_number || '-') + '</td>';
    html += '<td style="font-size:11px; color:var(--sw-mid);">' + (inv.reference || '-') + '</td>';
    html += '<td>' + (inv.contact_name || '-') + '</td>';
    html += '<td><span class="status-badge ' + inv.status.toLowerCase() + (isOverdue ? ' overdue' : '') + '">' + (isOverdue ? 'OVERDUE' : inv.status) + '</span></td>';
    html += '<td style="font-family:var(--sw-font-num);">' + fmt$(inv.total) + '</td>';
    html += '<td style="font-family:var(--sw-font-num);' + (isOverdue ? ' color:var(--sw-red); font-weight:700;' : '') + '">' + fmt$(inv.amount_due) + '</td>';
    html += '<td>' + fmtDate(inv.due_date) + '</td>';
    html += '<td style="white-space:nowrap;" onclick="event.stopPropagation();">' + invoiceActions(inv) + '</td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;
}

// Click invoice row → open matching job, or fallback to Xero
function drillInvoice(reference, invoiceNumber) {
  if (_pipelineData && reference) {
    var allJobs = [];
    if (_pipelineData.columns) {
      Object.values(_pipelineData.columns).forEach(function(arr) {
        if (Array.isArray(arr)) arr.forEach(function(j) { allJobs.push(j); });
      });
    }
    var match = allJobs.find(function(j) {
      return (j.job_number && reference.indexOf(j.job_number) !== -1);
    });
    if (match) { openJobPeek(match.id); return; }
  }
  // Fallback: open in Xero
  if (invoiceNumber) {
    window.open('https://go.xero.com/AccountsReceivable/Search?queryString=' + encodeURIComponent(invoiceNumber), '_blank');
  }
}

// ── Invoice Action Handlers ──
function _openInvAction(title, bodyHtml, btnClass, btnLabel, onConfirm) {
  document.getElementById('invActionTitle').textContent = title;
  document.getElementById('invActionBody').innerHTML = bodyHtml;
  var btn = document.getElementById('invActionBtn');
  btn.className = 'btn ' + btnClass;
  btn.textContent = btnLabel;
  btn.onclick = async function() {
    closeModal('invActionModal');
    try { await onConfirm(); } catch(e) { alert('Failed: ' + e.message); }
  };
  document.getElementById('invActionModal').classList.add('active');
}

async function deleteInvoice(xeroId, invNumber, total) {
  _openInvAction('Delete Draft Invoice',
    'This will permanently delete <b>' + invNumber + '</b> ($' + (total||0).toLocaleString('en-AU', {minimumFractionDigits:2}) + ') from Xero.<br><br>This cannot be undone.',
    'btn-danger', 'Delete',
    async function() {
      var result = await opsPost('void_invoice', { xero_invoice_id: xeroId });
      if (result.error) { alert('Error: ' + result.error); return; }
      showToast(invNumber + ' deleted', 'success');
      loadInvoices();
    });
}

async function voidInvoice(xeroId, invNumber, total) {
  _openInvAction('Void Invoice',
    'This will void <b>' + invNumber + '</b> ($' + (total||0).toLocaleString('en-AU', {minimumFractionDigits:2}) + ') in Xero.<br><br>The invoice will be marked as VOIDED and removed from your receivables. This cannot be undone.',
    'btn-danger', 'Void Invoice',
    async function() {
      var result = await opsPost('void_invoice', { xero_invoice_id: xeroId, void: true });
      if (result.error) { alert('Error: ' + result.error); return; }
      showToast(invNumber + ' voided', 'success');
      loadInvoices();
    });
}

async function approveInvoice(xeroId, invNumber, jobRef, total) {
  // Look up client email from the job if we have a reference (job number)
  var clientEmail = '';
  var jobId = null;
  if (jobRef && _pipelineData && _pipelineData.columns) {
    var allJobs = [];
    Object.values(_pipelineData.columns).forEach(function(arr) {
      if (Array.isArray(arr)) arr.forEach(function(j) { allJobs.push(j); });
    });
    var job = allJobs.find(function(j) { return j.job_number && jobRef.indexOf(j.job_number) !== -1; });
    if (job) {
      clientEmail = job.client_email || '';
      jobId = job.id;
    }
  }

  var bodyHtml = '';
  bodyHtml += '<div style="margin-bottom:12px;">Approve <b>' + invNumber + '</b>';
  if (total) bodyHtml += ' — <b>' + fmt$(total) + '</b>';
  bodyHtml += '</div>';
  bodyHtml += '<div style="margin-bottom:10px;">';
  bodyHtml += '<label style="font-size:11px; font-weight:600; color:var(--sw-text-sec); text-transform:uppercase; letter-spacing:0.3px;">Send To Email</label>';
  bodyHtml += '<input type="email" id="approveInvEmail" class="form-input" value="' + (clientEmail || '').replace(/"/g, '&quot;') + '" style="font-size:13px; padding:6px 8px; margin-top:2px;" placeholder="Client email address">';
  bodyHtml += '</div>';
  bodyHtml += '<label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; margin-bottom:6px;">';
  bodyHtml += '<input type="checkbox" id="approveInvBranded" checked>';
  bodyHtml += '<span><strong>Send branded email</strong> (recommended)</span>';
  bodyHtml += '</label>';
  bodyHtml += '<div style="font-size:10px; color:var(--sw-text-sec); margin-left:24px; margin-bottom:12px;">Unchecked uses Xero\'s plain email template</div>';
  bodyHtml += '<div style="font-size:11px; color:var(--sw-text-sec); padding:6px 8px; background:var(--sw-light); border:1px solid var(--sw-border); line-height:1.6;">';
  bodyHtml += '<strong>Approve Only</strong> marks it AUTHORISED in Xero without sending.<br>';
  bodyHtml += '<strong>Approve &amp; Send</strong> approves + emails the client.';
  bodyHtml += '</div>';

  document.getElementById('invActionTitle').textContent = 'Approve Invoice';
  document.getElementById('invActionBody').innerHTML = bodyHtml;

  // Replace the single confirm button with two buttons
  var actionsDiv = document.getElementById('invActionBtn').parentNode;
  actionsDiv.innerHTML = '<button class="btn btn-secondary" onclick="closeModal(\'invActionModal\')">Cancel</button> ' +
    '<button class="btn btn-outline" id="approveOnlyBtn">Approve Only</button> ' +
    '<button class="btn btn-primary" id="approveSendBtn">Approve &amp; Send</button>';

  document.getElementById('approveOnlyBtn').onclick = async function() {
    closeModal('invActionModal');
    try {
      var result = await opsPost('approve_invoice', { xero_invoice_id: xeroId });
      if (result.error) { alert('Error: ' + result.error); return; }
      showInvoiceSuccessModal(invNumber, null, xeroId, 'approved');
      loadInvoices();
    } catch(e) { alert('Failed: ' + e.message); }
  };

  document.getElementById('approveSendBtn').onclick = async function() {
    var email = document.getElementById('approveInvEmail').value.trim();
    var branded = document.getElementById('approveInvBranded').checked;
    if (!email) { alert('Please enter an email address to send to.'); return; }
    closeModal('invActionModal');
    try {
      var result = await opsPost('approve_and_send_invoice', {
        xero_invoice_id: xeroId,
        email_override: email,
        use_branded_email: branded
      });
      if (result.error) { alert('Error: ' + result.error); return; }
      showInvoiceSuccessModal(invNumber, email, xeroId, 'sent');
      loadInvoices();
    } catch(e) { alert('Failed: ' + e.message); }
  };

  document.getElementById('invActionModal').classList.add('active');
}

// Restore invActionModal buttons to default single-button layout after close
var _origInvActionClose = typeof closeModal === 'function' ? closeModal : function(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('active');
};
closeModal = function(id) {
  _origInvActionClose(id);
  if (id === 'invActionModal') {
    var actionsDiv = document.getElementById('invActionModal').querySelector('.modal-actions');
    if (actionsDiv && !document.getElementById('invActionBtn')) {
      actionsDiv.innerHTML = '<button class="btn btn-secondary" onclick="closeModal(\'invActionModal\')">Cancel</button> ' +
        '<button class="btn btn-primary" id="invActionBtn">Confirm</button>';
    }
  }
};

function showInvoiceSuccessModal(invNumber, email, xeroId, action) {
  var title = action === 'sent' ? 'Invoice Sent' : 'Invoice Approved';
  var titleEl = document.getElementById('invoiceSuccessModal').querySelector('.modal-title');
  titleEl.textContent = title;
  titleEl.style.color = '#27ae60';

  var body = '<div style="margin-bottom:8px;"><strong>' + invNumber + '</strong> has been ' + action + '.</div>';
  if (email) body += '<div style="font-size:12px; color:var(--sw-text-sec);">Sent to <strong>' + escapeHtml(email) + '</strong></div>';

  // Auto-open Xero in new tab
  if (xeroId) {
    var xeroUrl = 'https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=' + xeroId;
    var opened = window.open(xeroUrl, '_blank');
    if (opened) {
      body += '<div style="font-size:11px; color:var(--sw-text-sec); margin-top:8px;">Xero opened in new tab</div>';
    } else {
      body += '<div style="font-size:11px; color:var(--sw-orange); margin-top:8px;">Pop-up blocked? Click the button below to open Xero.</div>';
    }
  }

  document.getElementById('invoiceSuccessBody').innerHTML = body;
  document.getElementById('invoiceSuccessXeroLink').href = 'https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=' + xeroId;
  document.getElementById('invoiceSuccessModal').classList.add('active');
}

async function sendInvoice(xeroId, invNumber) {
  _openInvAction('Send Invoice to Client',
    'This will email <b>' + invNumber + '</b> to the client via Xero.<br><br>The client will receive the invoice at the email address on their Xero contact record.',
    'btn-primary', 'Send',
    async function() {
      var result = await opsPost('send_invoice_email', { xero_invoice_id: xeroId });
      if (result.error) { alert('Error: ' + result.error); return; }
      showToast(invNumber + ' sent to client', 'success');
      loadInvoices();
    });
}

var _allPOs = [];
async function loadPOs() {
  try {
    var data = await opsFetch('list_pos');
    _allPOs = data.purchase_orders || [];
    renderPOTable(_allPOs);
  } catch (e) {
    console.error('loadPOs error:', e);
  }
}

function renderPOTable(pos) {
  var tbody = document.getElementById('poTableBody');

  // Apply status filter
  var filtered = pos || [];
  if (_poStatusFilter !== 'all') {
    filtered = filtered.filter(function(po) { return po.status === _poStatusFilter; });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No purchase orders' + (_poStatusFilter !== 'all' ? ' with status "' + _poStatusFilter + '"' : '') + '</td></tr>';
    return;
  }

  var PO_STATUS_LABELS = { draft: 'Draft', approved: 'Approved', submitted: 'Sent', quote_requested: 'Quoted', authorised: 'Confirmed', billed: 'Delivered' };
  var html = '';
  filtered.forEach(function(po) {
    html += '<tr>';
    html += '<td><strong>' + po.po_number + '</strong></td>';
    html += '<td>' + (po.reference || '-') + '</td>';
    html += '<td>' + (po.supplier_name || '-') + '</td>';
    html += '<td style="font-family:var(--sw-font-num);">' + fmt$(po.total) + '</td>';
    html += '<td>' + fmtDate(po.delivery_date) + '</td>';
    html += '<td><span class="status-badge ' + po.status + '">' + (PO_STATUS_LABELS[po.status] || po.status) + '</span></td>';
    html += '<td>';
    if (po.status === 'draft' && !po.xero_po_id) {
      html += '<button class="btn btn-primary btn-sm" onclick="pushPOToXero(\'' + po.id + '\')">Push to Xero</button>';
    }
    if (po.job_id) {
      html += ' <button class="btn btn-secondary btn-sm" onclick="openJobPeek(\'' + po.job_id + '\')" style="font-size:10px; padding:2px 6px;">Job</button>';
    }
    html += ' <button class="btn btn-secondary btn-sm" onclick="scanSupplierQuote(\'' + po.id + '\')" style="font-size:10px; padding:2px 6px; border-color:var(--sw-orange); color:var(--sw-orange);" title="Upload supplier quote for AI price analysis">&#128269; Scan Quote</button>';
    html += '</td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;
}

async function loadWOs() {
  try {
    var data = await opsFetch('list_work_orders');
    renderWOTable(data.work_orders);
  } catch (e) {
    console.error('loadWOs error:', e);
  }
}

function renderWOTable(wos) {
  var tbody = document.getElementById('woTableBody');
  if (!wos || wos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No work orders yet</td></tr>';
    return;
  }

  var html = '';
  wos.forEach(function(wo) {
    html += '<tr>';
    html += '<td><strong>' + wo.wo_number + '</strong></td>';
    html += '<td>' + (wo.trade_name || '-') + '</td>';
    html += '<td>' + (wo.job_id ? '<a href="#" onclick="openJobPeek(\'' + wo.job_id + '\');return false;">View</a>' : '-') + '</td>';
    html += '<td><span class="status-badge ' + wo.status + '">' + wo.status + '</span></td>';
    html += '<td>' + fmtDate(wo.scheduled_date) + '</td>';
    html += '<td>' + (wo.sent_at ? fmtDate(wo.sent_at.slice(0, 10)) : '-') + '</td>';
    html += '<td>';
    if (wo.status === 'draft') {
      html += '<button class="btn btn-primary btn-sm" onclick="sendWO(\'' + wo.id + '\')">Send</button>';
    }
    html += '</td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;
}

async function loadQuotes() {
  // Fetch quotes via ops-api (direct Supabase blocked by RLS)
  var tbody = document.getElementById('quoteTableBody');
  try {
    var data = await opsFetch('list_quotes');
    var quotes = data.quotes || [];

    if (quotes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No quotes found</td></tr>';
      return;
    }

    var html = '';
    quotes.forEach(function(q) {
      var status = q.accepted_at ? 'Accepted' : q.declined_at ? 'Declined' : q.sent_to_client ? 'Sent' : 'Draft';
      var statusClass = q.accepted_at ? 'accepted' : q.declined_at ? 'overdue' : q.sent_to_client ? 'sent' : 'draft';
      html += '<tr>';
      html += '<td>' + fmtDate(q.created_at ? q.created_at.slice(0, 10) : '') + '</td>';
      html += '<td>' + (q.job_id ? '<a href="#" onclick="openJobPeek(\'' + q.job_id + '\');return false;">View</a>' : '-') + '</td>';
      html += '<td>' + (q.client_name || '-') + '</td>';
      html += '<td><span class="status-badge ' + statusClass + '">' + status + '</span></td>';
      html += '<td>' + (q.sent_at ? fmtDate(q.sent_at.slice(0, 10)) : '-') + '</td>';
      html += '<td>' + (q.viewed_at ? fmtDate(q.viewed_at.slice(0, 10)) : '-') + '</td>';
      html += '</tr>';
    });
    tbody.innerHTML = html;
  } catch (e) {
    console.error('loadQuotes error:', e);
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Failed to load quotes</td></tr>';
  }
}

// ═══════════════════════════════════════════════════
// UNRECONCILED TRANSACTIONS
// ═══════════════════════════════════════════════════

async function loadUnreconciled() {
  var container = document.getElementById('unreconciledContent');
  var countEl = document.getElementById('unreconciledCount');
  try {
    var resp = await opsFetch('list_unreconciled_transactions', { days_back: 30, limit: 50 });
    var txns = resp.transactions || [];
    if (countEl) countEl.textContent = txns.length + ' items';

    if (txns.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sw-text-sec);font-size:13px;">No unreconciled transactions found. All clear.</div>';
      return;
    }

    var html = '';
    txns.forEach(function(txn) {
      var suggested = txn.suggested_matches || [];
      var hasSuggestion = suggested.length > 0;
      var topMatch = hasSuggestion ? suggested[0] : null;

      html += '<div class="jd-money-card" style="margin-bottom:8px;padding:10px 12px;">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
      html += '<span style="font-size:12px;color:var(--sw-text-sec);min-width:70px;">' + fmtDate(txn.date) + '</span>';
      html += '<span style="flex:1;font-weight:600;color:var(--sw-dark);">' + escapeHtml(txn.contact_name || txn.description || 'Unknown') + '</span>';
      html += '<strong style="font-size:14px;">' + fmt$(txn.amount) + '</strong>';
      html += '</div>';
      if (txn.description && txn.description !== txn.contact_name) {
        html += '<div style="font-size:11px;color:var(--sw-text-sec);margin-bottom:6px;">' + escapeHtml(txn.description) + '</div>';
      }

      // Suggested match
      if (topMatch) {
        html += '<div style="font-size:11px;padding:4px 8px;background:#E8F5E9;border-radius:3px;margin-bottom:6px;color:#2E7D32;">';
        html += 'Suggested: <strong>' + escapeHtml(topMatch.po_number || topMatch.job_number || '') + '</strong> ' + escapeHtml(topMatch.job_number || '') + ' — ' + escapeHtml(topMatch.supplier_name || '');
        if (topMatch.confidence) html += ' (' + Math.round(topMatch.confidence * 100) + '% match)';
        html += '</div>';
      }

      // Actions
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
      if (topMatch) {
        html += '<button class="btn btn-sm" style="background:var(--sw-green);color:#fff;font-size:11px;padding:4px 10px;" onclick="confirmUnreconciledMatch(\'' + txn.xero_txn_id + '\',\'' + (topMatch.job_id || '') + '\',\'' + (topMatch.po_id || '') + '\')">Confirm Match</button>';
      }
      html += '<select class="form-input" style="font-size:11px;padding:3px 6px;max-width:160px;" onchange="matchUnreconciledToJob(\'' + txn.xero_txn_id + '\', this.value)" title="Match to job">';
      html += '<option value="">Match to Job...</option>';
      // Populate from recent jobs if available
      html += '</select>';
      html += '<button class="btn btn-sm btn-secondary" style="font-size:11px;padding:4px 10px;" onclick="markUnreconciledStock(\'' + txn.xero_txn_id + '\')">General Stock</button>';
      html += '<button class="btn btn-sm" style="font-size:11px;padding:4px 10px;background:none;border:1px solid var(--sw-border);color:var(--sw-text-sec);" onclick="dismissUnreconciled(\'' + txn.xero_txn_id + '\')">Dismiss</button>';
      html += '</div>';
      html += '</div>';
    });
    container.innerHTML = html;

    // Populate job dropdowns from cached data
    populateUnreconciledJobDropdowns();
  } catch (e) {
    console.error('loadUnreconciled error:', e);
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sw-red);font-size:13px;">Failed to load unreconciled transactions.</div>';
  }
}

async function populateUnreconciledJobDropdowns() {
  try {
    var resp = await opsFetch('search_jobs', { status: 'in_progress,scheduled,accepted,quoted', limit: 50 });
    var jobs = resp.jobs || resp || [];
    if (!Array.isArray(jobs)) return;
    var selects = document.querySelectorAll('#subUnreconciled select');
    selects.forEach(function(sel) {
      jobs.forEach(function(j) {
        var opt = document.createElement('option');
        opt.value = j.id;
        opt.textContent = (j.job_number || '') + ' ' + (j.client_name || '');
        sel.appendChild(opt);
      });
    });
  } catch (e) { /* non-critical */ }
}

async function confirmUnreconciledMatch(txnId, jobId, poId) {
  try {
    await opsPost('reconcile_transaction', { xero_txn_id: txnId, job_id: jobId, po_id: poId, action: 'confirm_match' });
    loadUnreconciled();
  } catch (e) { alert('Failed to confirm match: ' + e.message); }
}

async function matchUnreconciledToJob(txnId, jobId) {
  if (!jobId) return;
  try {
    await opsPost('reconcile_transaction', { xero_txn_id: txnId, job_id: jobId, action: 'match_to_job' });
    loadUnreconciled();
  } catch (e) { alert('Failed to match: ' + e.message); }
}

async function markUnreconciledStock(txnId) {
  try {
    await opsPost('reconcile_transaction', { xero_txn_id: txnId, action: 'general_stock', cost_centre: 'general_stock' });
    loadUnreconciled();
  } catch (e) { alert('Failed to mark as stock: ' + e.message); }
}

async function dismissUnreconciled(txnId) {
  try {
    await opsPost('reconcile_transaction', { xero_txn_id: txnId, action: 'dismiss' });
    loadUnreconciled();
  } catch (e) { alert('Failed to dismiss: ' + e.message); }
}

