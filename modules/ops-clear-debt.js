// ════════════════════════════════════════════════════════════
// CLEAR DEBT — Payment Chase & Collection
// ════════════════════════════════════════════════════════════

var _clearDebtData = null;
var _clearDebtFilter = 'all';
var _clearDebtSearch = '';

var _debtClassLabels = {
  unclassified: { label: 'Unclassified', icon: '\u2B1C', color: '#999' },
  genuine_debt: { label: 'Genuine Debt', icon: '\uD83D\uDD34', color: '#e74c3c' },
  blocked_by_us: { label: 'Blocked by Us', icon: '\uD83D\uDFE1', color: '#f39c12' },
  in_dispute: { label: 'In Dispute', icon: '\uD83D\uDFE0', color: '#e67e22' },
  bad_debt: { label: 'Bad Debt', icon: '\u26AB', color: '#2c3e50' },
};

async function loadClearDebt() {
  var container = document.getElementById('clearDebtCards');
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sw-text-sec);">Loading overdue invoices...</div>';

  try {
    _clearDebtData = await opsFetch('list_overdue_invoices');
    renderClearDebtStats(_clearDebtData);
    renderClearDebtFilters();
    renderClearDebtCards(_clearDebtData);
  } catch (e) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sw-red);">Error: ' + e.message + '</div>';
  }
}

function renderClearDebtStats(data) {
  var el = document.getElementById('clearDebtStats');
  var s = data.stats || {};
  var a = data.amounts || {};

  el.innerHTML =
    '<div class="stat-card"><div class="stat-body"><div class="stat-label">Total Overdue</div><div class="stat-value" style="color:var(--sw-red);">' + fmt$(data.total_outstanding) + '</div><div class="stat-sub">' + data.total_invoices + ' invoices \u00B7 ' + data.total_clients + ' clients</div></div></div>' +
    _debtStatCard('genuine_debt', s.genuine_debt, a.genuine_debt) +
    _debtStatCard('blocked_by_us', s.blocked_by_us, a.blocked_by_us) +
    _debtStatCard('in_dispute', s.in_dispute, a.in_dispute) +
    _debtStatCard('unclassified', s.unclassified, a.unclassified) +
    _debtStatCard('bad_debt', s.bad_debt, a.bad_debt);
}

function _debtStatCard(key, count, amount) {
  var c = _debtClassLabels[key];
  return '<div class="stat-card" style="cursor:pointer;border-left:3px solid ' + c.color + ';" onclick="filterClearDebt(\'' + key + '\')">' +
    '<div class="stat-body"><div class="stat-label">' + c.icon + ' ' + c.label + '</div>' +
    '<div class="stat-value" style="font-size:16px;">' + fmt$(amount || 0) + '</div>' +
    '<div class="stat-sub">' + (count || 0) + ' invoices</div></div></div>';
}

function renderClearDebtFilters() {
  var el = document.getElementById('clearDebtFilters');
  var filters = [
    { key: 'all', label: 'All' },
    { key: 'genuine_debt', label: '\uD83D\uDD34 Chase' },
    { key: 'blocked_by_us', label: '\uD83D\uDFE1 Blocked' },
    { key: 'in_dispute', label: '\uD83D\uDFE0 Dispute' },
    { key: 'unclassified', label: '\u2B1C Triage' },
    { key: 'followups', label: '\u23F0 Follow-ups Due' },
    { key: 'bad_debt', label: '\u26AB Written Off' },
  ];

  var html = filters.map(function(f) {
    return '<button class="filter-chip' + (_clearDebtFilter === f.key ? ' active' : '') + '" onclick="filterClearDebt(\'' + f.key + '\')">' + f.label + '</button>';
  }).join('');

  html += '<input type="text" class="filter-search" id="clearDebtSearch" placeholder="Search name / job#..." oninput="searchClearDebt(this.value)" style="width:180px;margin-left:auto;" value="' + (_clearDebtSearch || '') + '">';

  el.innerHTML = html;
}

function filterClearDebt(key) {
  _clearDebtFilter = key;
  renderClearDebtFilters();
  renderClearDebtCards(_clearDebtData);
}

function searchClearDebt(q) {
  _clearDebtSearch = (q || '').toLowerCase();
  renderClearDebtCards(_clearDebtData);
}

function renderClearDebtCards(data) {
  var container = document.getElementById('clearDebtCards');
  if (!data || !data.clients || data.clients.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sw-text-sec);">No overdue invoices. Nice work!</div>';
    return;
  }

  var today = new Date().toISOString().slice(0, 10);
  var html = '';

  data.clients.forEach(function(client) {
    client.invoices.forEach(function(inv) {
      // Apply classification filter
      if (_clearDebtFilter !== 'all') {
        if (_clearDebtFilter === 'followups') {
          if (!inv.next_follow_up || inv.next_follow_up > today) return;
        } else if (inv.classification !== _clearDebtFilter) return;
      }

      // Apply search filter
      if (_clearDebtSearch) {
        var hay = ((inv.contact_name || '') + ' ' + (inv.invoice_number || '') + ' ' + (inv.job_number || '') + ' ' + (inv.reference || '')).toLowerCase();
        if (hay.indexOf(_clearDebtSearch) === -1) return;
      }

      html += _renderChaseCard(inv, client);
    });
  });

  if (!html) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sw-text-sec);">No invoices matching filter.</div>';
    return;
  }
  container.innerHTML = html;
}

function _renderChaseCard(inv, client) {
  var c = _debtClassLabels[inv.classification] || _debtClassLabels.unclassified;
  var agingColor = inv.days_overdue <= 30 ? '#27ae60' : inv.days_overdue <= 60 ? '#f39c12' : '#e74c3c';
  var followUpDue = inv.next_follow_up && inv.next_follow_up <= new Date().toISOString().slice(0, 10);
  var hasGHL = !!inv.ghl_contact_id;

  var html = '<div class="chase-card" style="background:#fff;border:1px solid var(--sw-border);border-left:4px solid ' + c.color + ';border-radius:8px;padding:16px;">';

  // Row 1: Name + classification badge + amount
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">';
  html += '<div style="flex:1;min-width:180px;">';
  html += '<div style="font-weight:700;font-size:15px;color:var(--sw-dark);">' + (inv.contact_name || 'Unknown') + '</div>';
  if (inv.phone) html += '<div style="font-size:12px;color:var(--sw-text-sec);">' + inv.phone + '</div>';
  if (inv.site_suburb) html += '<div style="font-size:11px;color:var(--sw-text-sec);">' + (inv.site_address ? inv.site_address + ', ' : '') + inv.site_suburb + '</div>';
  html += '</div>';
  html += '<div style="text-align:right;">';
  html += '<div style="font-size:20px;font-weight:700;color:' + agingColor + ';font-family:var(--sw-font-num);">' + fmt$(inv.amount_due) + '</div>';
  html += '<div style="font-size:11px;color:' + agingColor + ';font-weight:600;">' + inv.days_overdue + ' days overdue</div>';
  html += '</div>';
  html += '</div>';

  // Row 2: Job info + classification
  html += '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;">';
  if (inv.job_number) html += '<span style="font-size:12px;font-weight:600;color:var(--sw-dark);">' + inv.job_number + '</span>';
  if (inv.job_type) html += '<span style="font-size:11px;color:var(--sw-text-sec);">' + inv.job_type + '</span>';
  if (inv.invoice_number) html += '<span style="font-size:11px;color:var(--sw-text-sec);">' + inv.invoice_number + '</span>';
  if (inv.reference && inv.reference !== inv.job_number) html += '<span style="font-size:11px;color:var(--sw-text-sec);">' + inv.reference + '</span>';

  // Classification badge
  html += '<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:' + c.color + '18;color:' + c.color + ';font-weight:600;">';
  html += c.icon + ' ' + c.label;
  if (inv.auto_classified) html += ' <span style="font-size:9px;opacity:0.7;">(auto)</span>';
  html += '</span>';

  if (inv.classification_reason) html += '<span style="font-size:10px;color:var(--sw-text-sec);font-style:italic;">' + inv.classification_reason + '</span>';
  html += '</div>';

  // Row 3: Warning flags
  if (inv.flags && inv.flags.length > 0) {
    html += '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">';
    inv.flags.forEach(function(flag) {
      html += '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#fff3cd;color:#856404;">\u26A0 ' + flag + '</span>';
    });
    html += '</div>';
  }

  // Follow-up flag
  if (followUpDue) {
    html += '<div style="margin-top:6px;padding:6px 10px;background:#fef3f2;border-radius:6px;font-size:12px;color:#e74c3c;font-weight:600;">';
    html += '\u23F0 Follow-up was due ' + fmtDate(inv.next_follow_up);
    html += '</div>';
  }

  // Row 4: Chase log (last 2-3 interactions)
  if (inv.chase_logs && inv.chase_logs.length > 0) {
    html += '<div style="margin-top:8px;border-top:1px solid var(--sw-border);padding-top:8px;">';
    html += '<div style="font-size:10px;font-weight:600;color:var(--sw-text-sec);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Chase History</div>';
    inv.chase_logs.forEach(function(log) {
      var methodIcons = { call: '\uD83D\uDCDE', sms: '\uD83D\uDCAC', auto_sms: '\uD83E\uDD16', email: '\uD83D\uDCE7', note: '\uD83D\uDCDD', status_change: '\uD83C\uDFF7' };
      var icon = methodIcons[log.method] || '\u2022';
      html += '<div style="font-size:11px;color:var(--sw-text-sec);margin-bottom:2px;">';
      html += icon + ' ' + fmtDate(log.created_at) + ' \u2014 ';
      if (log.outcome) html += '<strong>' + log.outcome + '</strong>';
      if (log.notes) html += ' ' + log.notes.substring(0, 80) + (log.notes.length > 80 ? '...' : '');
      html += '</div>';
    });
    html += '</div>';
  }

  // Row 5: Action buttons
  html += '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">';

  if (hasGHL) {
    html += '<button class="btn btn-sm" style="font-size:11px;" onclick="clearDebtCall(\'' + inv.ghl_contact_id + '\',\'' + _esc(inv.contact_name) + '\',\'' + _esc(inv.xero_invoice_id) + '\',\'' + (inv.job_id || '') + '\')">\uD83D\uDCDE Call</button>';
    html += '<button class="btn btn-sm" style="font-size:11px;" onclick="clearDebtSMS(\'' + inv.ghl_contact_id + '\',\'' + _esc(inv.contact_name) + '\',\'' + _esc(inv.xero_invoice_id) + '\',\'' + (inv.job_id || '') + '\',\'' + _esc(inv.invoice_number) + '\',\'' + (inv.amount_due || 0) + '\')">\uD83D\uDCAC SMS</button>';
  }

  if (inv.job_id) {
    html += '<button class="btn btn-sm" style="font-size:11px;" onclick="clearDebtPayLink(\'' + inv.job_id + '\')">\uD83D\uDCB3 Send Pay Link</button>';
  }

  html += '<button class="btn btn-sm" style="font-size:11px;" onclick="clearDebtLogChase(\'' + _esc(inv.xero_invoice_id) + '\',\'' + (inv.job_id || '') + '\',\'' + (inv.ghl_contact_id || '') + '\',\'' + _esc(inv.contact_name) + '\')">\uD83D\uDCCB Log Chase</button>';

  html += '<button class="btn btn-sm" style="font-size:11px;" onclick="clearDebtClassify(\'' + _esc(inv.xero_invoice_id) + '\',\'' + inv.classification + '\',\'' + (inv.ghl_contact_id || '') + '\',\'' + _esc(inv.invoice_number) + '\',\'' + _esc(inv.job_number || '') + '\',\'' + (inv.amount_due || 0) + '\')">\uD83C\uDFF7 Classify</button>';

  html += '<button class="btn btn-sm" style="font-size:11px;" onclick="clearDebtNote(\'' + _esc(inv.xero_invoice_id) + '\',\'' + (inv.job_id || '') + '\',\'' + (inv.ghl_contact_id || '') + '\',\'' + _esc(inv.contact_name) + '\')">\uD83D\uDCDD Note</button>';

  // Classification-specific actions
  if (inv.classification === 'blocked_by_us') {
    html += '<button class="btn btn-sm btn-primary" style="font-size:11px;" onclick="clearDebtResolveBlocker(\'' + _esc(inv.xero_invoice_id) + '\',\'' + (inv.ghl_contact_id || '') + '\',\'' + _esc(inv.invoice_number) + '\',\'' + _esc(inv.job_number || '') + '\',\'' + (inv.amount_due || 0) + '\')">\u2705 Blocker Resolved</button>';
  }
  if (inv.classification === 'in_dispute') {
    html += '<button class="btn btn-sm btn-primary" style="font-size:11px;" onclick="clearDebtResolveDispute(\'' + _esc(inv.xero_invoice_id) + '\',\'' + (inv.ghl_contact_id || '') + '\',\'' + _esc(inv.invoice_number) + '\',\'' + _esc(inv.job_number || '') + '\',\'' + (inv.amount_due || 0) + '\')">\u2705 Dispute Resolved</button>';
    html += '<button class="btn btn-sm" style="font-size:11px;color:var(--sw-red);" onclick="clearDebtClassifyDirect(\'' + _esc(inv.xero_invoice_id) + '\',\'bad_debt\',\'' + (inv.ghl_contact_id || '') + '\')">\u26AB Write Off</button>';
  }
  if (inv.classification === 'bad_debt') {
    html += '<button class="btn btn-sm" style="font-size:11px;" onclick="clearDebtClassifyDirect(\'' + _esc(inv.xero_invoice_id) + '\',\'unclassified\',\'' + (inv.ghl_contact_id || '') + '\')">\u21A9 Reopen</button>';
  }

  html += '</div>';
  html += '</div>';
  return html;
}

function _esc(s) { return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

// ── Action: Call via GHL ──
function clearDebtCall(ghlContactId, contactName, xeroInvoiceId, jobId) {
  window.open('https://app.maxlead.com.au/v2/location/' + GHL_LOCATION_ID + '/contacts/' + ghlContactId, '_blank');
  // Prompt to log the call after returning
  setTimeout(function() {
    if (confirm('Log the call outcome for ' + contactName + '?')) {
      clearDebtLogChase(xeroInvoiceId, jobId, ghlContactId, contactName, 'call');
    }
  }, 1000);
}

// ── Action: SMS compose modal ──
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
      '<div style="font-size:11px;color:var(--sw-text-sec);margin-top:4px;">Edit the message above before sending. Payment link will be sent separately via "Send Pay Link".</div>' +
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
  var message = text.value.trim();
  var overlay = text.closest('.modal-overlay');

  try {
    await opsPost('send_chase_sms', {
      ghl_contact_id: ghlContactId,
      xero_invoice_id: xeroInvoiceId || null,
      job_id: jobId || null,
      message: message,
    });
    showToast('SMS sent', 'success');
    if (overlay) overlay.remove();
    loadClearDebt();
  } catch (e) {
    showToast('SMS failed: ' + e.message, 'warning');
  }
}

// ── Action: Send Pay Link ──
async function clearDebtPayLink(jobId) {
  try {
    showToast('Sending payment link...', 'info');
    var result = await opsPost('send_payment_link', { job_id: jobId });
    showToast('Payment link sent: ' + (result.invoice_number || ''), 'success');
    loadClearDebt();
  } catch (e) {
    showToast('Failed: ' + e.message, 'warning');
  }
}

// ── Action: Log Chase modal ──
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
        '<option value="sms">\uD83D\uDCAC SMS</option>' +
        '<option value="email">\uD83D\uDCE7 Email</option>' +
      '</select>' +
      '<label style="font-size:12px;font-weight:600;color:var(--sw-text-sec);display:block;margin-bottom:4px;">Outcome</label>' +
      '<select id="chaseOutcome" class="form-input" style="width:100%;margin-bottom:12px;">' +
        '<option value="Promised to pay">Promised to pay</option>' +
        '<option value="No answer">No answer</option>' +
        '<option value="Voicemail">Voicemail</option>' +
        '<option value="Disputing">Disputing</option>' +
        '<option value="Financial difficulty">Financial difficulty</option>' +
        '<option value="Wrong number">Wrong number</option>' +
        '<option value="Payment plan arranged">Payment plan arranged</option>' +
        '<option value="Payment received">Payment received</option>' +
      '</select>' +
      '<label style="font-size:12px;font-weight:600;color:var(--sw-text-sec);display:block;margin-bottom:4px;">Follow up in</label>' +
      '<select id="chaseFollowUp" class="form-input" style="width:100%;margin-bottom:12px;">' +
        '<option value="">No follow-up</option>' +
        '<option value="1" selected>Tomorrow</option>' +
        '<option value="3">3 days</option>' +
        '<option value="7">1 week</option>' +
        '<option value="14">2 weeks</option>' +
        '<option value="30">1 month</option>' +
      '</select>' +
      '<label style="font-size:12px;font-weight:600;color:var(--sw-text-sec);display:block;margin-bottom:4px;">Notes</label>' +
      '<textarea id="chaseNotes" class="form-input" style="width:100%;height:60px;resize:vertical;box-sizing:border-box;" placeholder="Any extra details..."></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">' +
        '<button class="btn btn-sm" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
        '<button class="btn btn-sm btn-primary" onclick="clearDebtSubmitChase(\'' + _esc(xeroInvoiceId) + '\',\'' + (jobId || '') + '\',\'' + (ghlContactId || '') + '\',\'' + _esc(contactName) + '\')">Save</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
}

async function clearDebtSubmitChase(xeroInvoiceId, jobId, ghlContactId, contactName) {
  var method = document.getElementById('chaseMethod').value;
  var outcome = document.getElementById('chaseOutcome').value;
  var followUpDays = document.getElementById('chaseFollowUp').value;
  var notes = document.getElementById('chaseNotes').value.trim();

  var followUpDate = null;
  if (followUpDays) {
    var d = new Date();
    d.setDate(d.getDate() + parseInt(followUpDays));
    followUpDate = d.toISOString().slice(0, 10);
  }

  try {
    await opsPost('log_chase', {
      xero_invoice_id: xeroInvoiceId,
      job_id: jobId || null,
      ghl_contact_id: ghlContactId || null,
      contact_name: contactName,
      method: method,
      outcome: outcome,
      notes: notes || null,
      follow_up_date: followUpDate,
    });
    showToast('Chase logged', 'success');
    document.querySelector('.modal-overlay').remove();
    loadClearDebt();
  } catch (e) {
    showToast('Failed: ' + e.message, 'warning');
  }
}

// ── Action: Classify modal ──
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
      '<div style="margin-top:12px;">' +
        '<input type="text" id="classifyReason" class="form-input" style="width:100%;box-sizing:border-box;" placeholder="Reason (optional)">' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">' +
        '<button class="btn btn-sm" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
}

async function clearDebtSetClassification(xeroInvoiceId, classification, ghlContactId, invoiceNumber, jobNumber, amount) {
  var reason = document.getElementById('classifyReason')?.value?.trim() || '';

  try {
    await opsPost('classify_invoice', {
      xero_invoice_id: xeroInvoiceId,
      classification: classification,
      reason: reason || null,
    });

    // Trigger or stop GHL chase workflow based on classification
    if (ghlContactId) {
      if (classification === 'genuine_debt') {
        await opsPost('trigger_chase_workflow', {
          ghl_contact_id: ghlContactId,
          overdue_amount: amount,
          invoice_number: invoiceNumber,
          job_number: jobNumber,
        });
      } else {
        await opsPost('stop_chase_workflow', { ghl_contact_id: ghlContactId });
      }
    }

    showToast('Classified as ' + _debtClassLabels[classification].label, 'success');
    var overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.remove();
    loadClearDebt();
  } catch (e) {
    showToast('Failed: ' + e.message, 'warning');
  }
}

// Direct classification (no modal — for resolve/write-off/reopen buttons)
async function clearDebtClassifyDirect(xeroInvoiceId, classification, ghlContactId) {
  try {
    await opsPost('classify_invoice', {
      xero_invoice_id: xeroInvoiceId,
      classification: classification,
      reason: classification === 'bad_debt' ? 'Written off' : classification === 'unclassified' ? 'Reopened' : null,
    });
    if (ghlContactId && classification !== 'genuine_debt') {
      await opsPost('stop_chase_workflow', { ghl_contact_id: ghlContactId });
    }
    showToast('Updated', 'success');
    loadClearDebt();
  } catch (e) {
    showToast('Failed: ' + e.message, 'warning');
  }
}

// Resolve blocker → reclassify as genuine debt + trigger workflow
async function clearDebtResolveBlocker(xeroInvoiceId, ghlContactId, invoiceNumber, jobNumber, amount) {
  await clearDebtSetClassification(xeroInvoiceId, 'genuine_debt', ghlContactId, invoiceNumber, jobNumber, amount);
}

// Resolve dispute → reclassify as genuine debt + trigger workflow
async function clearDebtResolveDispute(xeroInvoiceId, ghlContactId, invoiceNumber, jobNumber, amount) {
  await clearDebtSetClassification(xeroInvoiceId, 'genuine_debt', ghlContactId, invoiceNumber, jobNumber, amount);
}

// ── Action: Ops Note ──
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
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  overlay.querySelector('textarea').focus();
}

async function clearDebtSaveNote(xeroInvoiceId, jobId, ghlContactId, contactName) {
  var notes = document.getElementById('chaseNoteText')?.value?.trim();
  if (!notes) { showToast('Note is empty', 'warning'); return; }

  try {
    await opsPost('log_chase', {
      xero_invoice_id: xeroInvoiceId,
      job_id: jobId || null,
      ghl_contact_id: ghlContactId || null,
      contact_name: contactName,
      method: 'note',
      notes: notes,
    });
    showToast('Note saved', 'success');
    document.querySelector('.modal-overlay').remove();
    loadClearDebt();
  } catch (e) {
    showToast('Failed: ' + e.message, 'warning');
  }
}
