// ════════════════════════════════════════════════════════════
// JOB DETAIL SLIDE PANEL (legacy peek — used by Today/Calendar)
// ════════════════════════════════════════════════════════════

async function openJobPeek(jobId) {
  document.getElementById('slidePanel').classList.add('open');
  document.getElementById('slideBackdrop').classList.add('open');
  document.getElementById('slidePanelBody').innerHTML = '<div class="loading">Loading job details...</div>';

  try {
    var data = await opsFetch('job_detail', { jobId: jobId });
    renderJobPeek(data);
  } catch (e) {
    document.getElementById('slidePanelBody').innerHTML = '<div style="color:var(--sw-red); padding:20px;">Error: ' + e.message + '</div>';
  }
}

function closeSlidePanel() {
  document.getElementById('slidePanel').classList.remove('open');
  document.getElementById('slideBackdrop').classList.remove('open');
}

function renderJobPeek(data) {
  var j = data.job;
  var title = (j.job_number || '') + (j.job_number ? ' — ' : '') + (j.client_name || 'Unknown') + ' — ' + (j.site_suburb || '');
  document.getElementById('slidePanelTitle').textContent = title;

  var html = '';

  // Job info + external links
  html += '<div style="margin-bottom:16px;">';
  html += '<div style="display:flex; gap:8px; margin-bottom:8px; align-items:center; flex-wrap:wrap;">';
  html += '<span class="type-badge ' + j.type + '">' + typeBadgeLabel(j.type) + '</span>';
  html += '<span class="status-badge ' + j.status + '">' + (STATUS_LABELS[j.status] || j.status) + '</span>';
  // External link buttons
  if (j.ghl_opportunity_id) {
    html += '<a href="https://app.maxlead.com.au/v2/location/' + GHL_LOCATION_ID + '/opportunities/' + j.ghl_opportunity_id + '" target="_blank" class="btn btn-secondary btn-sm" style="font-size:11px; padding:3px 8px; text-decoration:none;">View in GHL &#8599;</a>';
  }
  if (j.type !== 'miscellaneous') {
    var scopeToolUrl = j.type === 'fencing' ? 'https://marninms98-dotcom.github.io/fence-designer/' : 'https://marninms98-dotcom.github.io/patio/';
    html += '<a href="' + scopeToolUrl + '?jobId=' + j.id + '" target="_blank" class="btn btn-secondary btn-sm" style="font-size:11px; padding:3px 8px; text-decoration:none;">Open Scope &#8599;</a>';
  }
  html += '</div>';
  if (j.site_address) html += '<div style="font-size:13px; margin-bottom:4px;">' + j.site_address + '</div>';
  if (j.client_phone) html += '<div style="font-size:13px; color:var(--sw-text-sec);">Phone: <a href="tel:' + j.client_phone + '">' + j.client_phone + '</a></div>';
  if (j.client_email) html += '<div style="font-size:13px; color:var(--sw-text-sec);">Email: <a href="mailto:' + j.client_email + '">' + j.client_email + '</a></div>';

  var val = j.pricing_json?.totalIncGST || j.pricing_json?.total;
  if (val) html += '<div style="font-size:15px; font-weight:700; margin-top:8px; color:var(--sw-green);">' + fmt$(val) + '</div>';
  html += '</div>';

  // ── Financials mini-section ──
  var quoteVal = j.pricing_json?.totalIncGST || j.pricing_json?.total || 0;
  var poCostsTotal = (data.purchase_orders || []).reduce(function(s, po) { return s + (po.total || 0); }, 0);
  // Only count ACCREC (sales) invoices, exclude voided/deleted
  var salesInvoices = (data.invoices || []).filter(function(inv) {
    return inv.invoice_type === 'ACCREC' && ['VOIDED','DELETED'].indexOf(inv.status) < 0;
  });
  var invoicedTotal = salesInvoices.reduce(function(s, inv) { return s + (parseFloat(inv.total) || 0); }, 0);
  var invoicePaid = salesInvoices.reduce(function(s, inv) { return s + (parseFloat(inv.amount_paid) || 0); }, 0);
  var invoiceRemaining = Math.max(0, quoteVal - invoicedTotal);
  if (quoteVal > 0 || poCostsTotal > 0 || invoicedTotal > 0) {
    var margin = quoteVal > 0 ? ((quoteVal - poCostsTotal) / quoteVal * 100) : 0;
    var marginColor = margin >= 25 ? 'var(--sw-green)' : margin >= 15 ? 'var(--sw-yellow)' : 'var(--sw-red)';
    html += '<div style="margin-bottom:16px; padding:10px; background:var(--sw-light); border-radius:8px; font-size:12px;">';
    html += '<div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Quote value</span><strong>' + fmt$(quoteVal) + '</strong></div>';
    // Cost estimate from pricing_json vs actual PO spend
    var costEstimate = j.pricing_json?.costEstimate || j.pricing_json?.totalCost || j.pricing_json?.cost || 0;
    if (costEstimate > 0) {
      html += '<div style="display:flex; justify-content:space-between; margin-bottom:2px;"><span>Est. costs</span><strong style="color:var(--sw-text-sec);">' + fmt$(costEstimate) + '</strong></div>';
      var costDiff = poCostsTotal - costEstimate;
      var costDiffLabel = costDiff > 0 ? 'Over by ' + fmt$(costDiff) : costDiff < 0 ? 'Under by ' + fmt$(Math.abs(costDiff)) : 'On target';
      var costDiffColor = costDiff > 0 ? 'var(--sw-red)' : 'var(--sw-green)';
      html += '<div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>PO costs (actual)</span><strong style="color:var(--sw-red);">' + fmt$(poCostsTotal) + ' <span style="font-size:10px; color:' + costDiffColor + '">(' + costDiffLabel + ')</span></strong></div>';
    } else {
      html += '<div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>PO costs</span><strong style="color:var(--sw-red);">' + fmt$(poCostsTotal) + '</strong></div>';
    }
    // Invoice running total with progress bar
    html += '<div style="display:flex; justify-content:space-between; margin-bottom:2px;"><span>Invoiced</span><strong>' + fmt$(invoicedTotal) + '</strong></div>';
    if (quoteVal > 0) {
      var invPct = Math.min(100, invoicedTotal / quoteVal * 100);
      html += '<div style="height:4px; background:#e0e0e0; border-radius:2px; overflow:hidden; margin-bottom:4px;">';
      html += '<div style="height:100%; width:' + invPct + '%; background:var(--sw-green); border-radius:2px;"></div></div>';
    }
    html += '<div style="display:flex; justify-content:space-between; margin-bottom:2px;"><span>Collected</span><strong style="color:var(--sw-green);">' + fmt$(invoicePaid) + '</strong></div>';
    html += '<div style="display:flex; justify-content:space-between; margin-bottom:6px;"><span>Still to invoice</span><strong style="color:' + (invoiceRemaining > 0 ? 'var(--sw-orange)' : 'var(--sw-green)') + ';">' + fmt$(invoiceRemaining) + '</strong></div>';
    if (quoteVal > 0) {
      var barPct = Math.min(100, poCostsTotal / quoteVal * 100);
      html += '<div style="height:6px; background:#e0e0e0; border-radius:3px; overflow:hidden;">';
      html += '<div style="height:100%; width:' + barPct + '%; background:' + marginColor + '; border-radius:3px;"></div></div>';
      html += '<div style="text-align:right; margin-top:2px; font-weight:600; color:' + marginColor + ';">Margin: ' + margin.toFixed(0) + '%</div>';
    }
    html += '</div>';
  }

  // Status actions + PO/Invoice buttons
  html += '<div style="margin-bottom:16px; display:flex; gap:6px; flex-wrap:wrap;">';
  var nextStatuses = getNextStatuses(j.status);
  nextStatuses.forEach(function(s) {
    html += '<button class="btn btn-secondary btn-sm" onclick="changeJobStatus(\'' + j.id + '\',\'' + s + '\')">' + STATUS_LABELS[s] + '</button>';
  });
  // PO and Invoice action buttons
  html += '<button class="btn btn-secondary btn-sm" onclick="closeSlidePanel(); openPOModal(\'' + j.id + '\')" style="border-color:var(--sw-purple); color:var(--sw-purple);">+ PO</button>';
  if (['accepted', 'quoted', 'scheduled', 'in_progress', 'complete'].indexOf(j.status) >= 0) {
    html += '<button class="btn btn-secondary btn-sm" onclick="closeSlidePanel(); openUnifiedInvoiceModal(\'' + j.id + '\')" style="border-color:var(--sw-green); color:var(--sw-green);">+ Invoice</button>';
  }
  // Mark Lost — available for quoted/accepted/scheduled jobs
  if (['quoted', 'accepted', 'scheduled'].indexOf(j.status) >= 0) {
    html += '<button class="btn btn-secondary btn-sm" onclick="markJobLost(\'' + j.id + '\')" style="border-color:var(--sw-red); color:var(--sw-red); margin-left:auto;">Mark Lost</button>';
  }
  html += '</div>';

  // ── Scope Summary ──
  if (j.scope_json) {
    html += '<div class="panel-title" style="margin-top:16px;">Scope Summary</div>';
    html += renderScopeSummary(j.scope_json, j.type, j.id);
  }

  // Assignments
  html += '<div class="panel-title" style="margin-top:16px;">Assignments (' + data.assignments.length + ')</div>';
  if (data.assignments.length > 0) {
    data.assignments.forEach(function(a) {
      html += '<div style="padding:8px 0; border-bottom:1px solid var(--sw-border); font-size:13px; display:flex; align-items:center; gap:6px;">';
      html += '<div style="flex:1;">';
      html += '<strong>' + fmtDate(a.scheduled_date) + '</strong>';
      if (a.users?.name) html += ' — ' + a.users.name;
      if (a.crew_name) html += ' (' + cleanCrewName(a.crew_name) + ')';
      html += ' <span class="status-badge ' + a.status + '">' + a.status + '</span>';
      html += '</div>';
      if (a.status !== 'complete' && a.status !== 'cancelled') {
        html += '<button class="btn btn-secondary btn-sm" style="font-size:11px; padding:3px 8px; white-space:nowrap;" onclick="markAssignmentComplete(\'' + a.id + '\',\'' + j.id + '\')">&#9989; Complete</button>';
      }
      html += '</div>';
    });
  } else {
    html += '<div style="font-size:12px; color:var(--sw-text-sec); padding:8px 0;">No assignments</div>';
  }

  // POs
  if (data.purchase_orders && data.purchase_orders.length > 0) {
    html += '<div class="panel-title" style="margin-top:16px;">Purchase Orders (' + data.purchase_orders.length + ')</div>';
    data.purchase_orders.forEach(function(po) {
      html += '<div style="padding:8px 0; border-bottom:1px solid var(--sw-border); font-size:13px;">';
      html += '<strong>' + po.po_number + '</strong> — ' + po.supplier_name;
      html += ' <span class="status-badge ' + po.status + '">' + po.status + '</span>';
      html += ' ' + fmt$(po.total);
      html += '</div>';
    });
  }

  // WOs
  if (data.work_orders && data.work_orders.length > 0) {
    html += '<div class="panel-title" style="margin-top:16px;">Work Orders (' + data.work_orders.length + ')</div>';
    data.work_orders.forEach(function(wo) {
      html += '<div style="padding:8px 0; border-bottom:1px solid var(--sw-border); font-size:13px;">';
      html += '<strong>' + wo.wo_number + '</strong>';
      if (wo.trade_name) html += ' — ' + wo.trade_name;
      html += ' <span class="status-badge ' + wo.status + '">' + wo.status + '</span>';
      html += '</div>';
    });
  }

  // Photos — split into job photos and receipts
  if (data.media && data.media.length > 0) {
    var jobPhotos = data.media.filter(function(m) { return m.phase !== 'receipt'; });
    var receiptPhotos = data.media.filter(function(m) { return m.phase === 'receipt'; });

    if (jobPhotos.length > 0) {
      html += '<div class="panel-title" style="margin-top:16px;">Photos (' + jobPhotos.length + ')</div>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:6px;">';
      jobPhotos.forEach(function(m) {
        var src = m.thumbnail_url || m.storage_url;
        var phase = m.phase || '';
        html += '<div style="position:relative">';
        html += '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(m.label || phase) + '" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;cursor:pointer" onclick="window.open(\'' + escapeHtml(m.storage_url) + '\',\'_blank\')">';
        if (phase) html += '<span style="position:absolute;bottom:2px;left:2px;font-size:9px;background:rgba(0,0,0,0.6);color:#fff;padding:1px 4px;border-radius:3px">' + phase + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (receiptPhotos.length > 0) {
      html += '<div class="panel-title" style="margin-top:16px;">Receipts (' + receiptPhotos.length + ')</div>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:6px;">';
      // Build PO lookup for receipt labels
      var poLookup = {};
      (data.purchase_orders || []).forEach(function(po) { poLookup[po.id] = po.po_number; });
      receiptPhotos.forEach(function(m) {
        var src = m.thumbnail_url || m.storage_url;
        var poLabel = m.po_id && poLookup[m.po_id] ? poLookup[m.po_id] : 'No PO';
        html += '<div style="position:relative">';
        html += '<img src="' + escapeHtml(src) + '" alt="Receipt" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;cursor:pointer" onclick="window.open(\'' + escapeHtml(m.storage_url) + '\',\'_blank\')">';
        html += '<span style="position:absolute;bottom:2px;left:2px;font-size:9px;background:rgba(0,0,0,0.6);color:#fff;padding:1px 4px;border-radius:3px">' + poLabel + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }
  }

  // Xero project
  if (data.xero_project) {
    html += '<div class="panel-title" style="margin-top:16px;">Xero Project</div>';
    html += '<div style="font-size:13px;">';
    html += '<div>' + (data.xero_project.project_name || '') + '</div>';
    html += '<div>Invoiced: ' + fmt$(data.xero_project.total_invoiced) + '</div>';
    html += '<div>Expenses: ' + fmt$(data.xero_project.total_expenses) + '</div>';
    var margin = data.xero_project.total_invoiced > 0
      ? ((data.xero_project.total_invoiced - data.xero_project.total_expenses) / data.xero_project.total_invoiced * 100).toFixed(0)
      : 0;
    html += '<div>Margin: ' + margin + '%</div>';
    html += '</div>';
  }

  // Council/Engineering section
  html += '<div id="jdCouncilSection"></div>';
  loadJobCouncilSection(data.job.id);

  // Timeline (chronological events)
  if (data.events && data.events.length > 0) {
    html += '<div class="panel-title" style="margin-top:16px;">Timeline</div>';
    html += '<div style="border-left:2px solid var(--sw-border); margin-left:8px; padding-left:12px;">';
    data.events.slice(0, 20).forEach(function(ev) {
      var label = formatEventType(ev.event_type, ev.detail_json);
      var dot = '&#9679;';
      html += '<div style="padding:4px 0; font-size:12px; position:relative;">';
      html += '<span style="position:absolute; left:-18px; color:var(--sw-text-sec); font-size:8px; top:6px;">' + dot + '</span>';
      html += '<strong style="color:var(--sw-text);">' + label + '</strong>';
      if (ev.users?.name) html += ' <span style="color:var(--sw-text-sec);">by ' + ev.users.name + '</span>';
      html += '<div style="font-size:11px; color:var(--sw-text-sec);">' + new Date(ev.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  document.getElementById('slidePanelBody').innerHTML = html;
}

async function loadJobCouncilSection(jobId) {
  var el = document.getElementById('jdCouncilSection');
  if (!el) return;
  try {
    var resp = await opsFetch('list_council_submissions', { job_id: jobId });
    var subs = resp.submissions || [];
    if (subs.length === 0) {
      el.innerHTML = '';
      return;
    }
    var sub = subs[0];
    var steps = sub.steps || [];
    var completed = steps.filter(function(s) { return s.status === 'complete'; }).length;
    var html = '<div class="panel-title" style="margin-top:16px;">Council/Engineering</div>';
    html += '<div style="font-size:12px;margin-bottom:6px;color:var(--sw-dark);font-weight:600;">' + completed + '/' + steps.length + ' steps complete — ' + (sub.overall_status || '').replace(/_/g, ' ') + '</div>';
    html += '<div style="display:flex;gap:2px;margin-bottom:6px;">';
    steps.forEach(function(step) {
      var c = step.status === 'complete' ? 'var(--sw-green)' : step.status === 'in_progress' ? 'var(--sw-mid)' : step.status === 'blocked' ? 'var(--sw-red)' : '#E0E0E0';
      html += '<div title="' + escapeHtml(step.name) + '" style="flex:1;height:6px;border-radius:3px;background:' + c + ';"></div>';
    });
    html += '</div>';
    steps.forEach(function(step) {
      var icon = step.status === 'complete' ? '&#10003;' : step.status === 'in_progress' ? '&#9679;' : step.status === 'blocked' ? '&#10007;' : '&#9675;';
      var color = step.status === 'complete' ? 'var(--sw-green)' : step.status === 'in_progress' ? 'var(--sw-mid)' : step.status === 'blocked' ? 'var(--sw-red)' : 'var(--sw-text-sec)';
      html += '<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;">';
      html += '<span style="color:' + color + ';">' + icon + '</span>';
      html += '<span>' + escapeHtml(step.name) + '</span>';
      if (step.vendor) html += '<span style="color:var(--sw-text-sec);font-size:11px;">(' + escapeHtml(step.vendor) + ')</span>';
      html += '</div>';
    });
    html += '<div style="margin-top:6px;"><button class="btn btn-sm btn-secondary" style="font-size:11px;" onclick="showView(\'approvals\')">View in Approvals</button></div>';
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '';
  }
}

function formatEventType(type, detail) {
  var labels = {
    'job_created': 'Job created',
    'status_changed': 'Status → ' + (detail?.new_status || ''),
    'ghl_linked': 'Linked to GHL',
    'ghl_stage_synced': 'GHL stage synced',
    'ghl_updated': 'Updated from GHL',
    'assignment_created': 'Scheduled',
    'assignment_deleted': 'Assignment removed',
    'assignment_status_changed': 'Assignment ' + (detail?.new_status || 'updated'),
    'po_created': 'PO created' + (detail?.po_number ? ' (' + detail.po_number + ')' : ''),
    'po_email_log': (detail?.direction === 'received' ? 'Email received' : 'Email sent') + (detail?.supplier ? ' — ' + detail.supplier : ''),
    'scope_saved': 'Scope saved',
    'note_added': 'Note added',
    'photo_uploaded': 'Photo uploaded',
    'report_submitted': 'Service report submitted',
    'invoice_created': 'Invoice created',
  };
  return labels[type] || type.replace(/_/g, ' ');
}

// ── Site Plan Image Overlay ──
function showSitePlanOverlay(src) {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(26,39,46,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:16px;';
  overlay.onclick = function() { overlay.remove(); };
  var img = document.createElement('img');
  img.src = src;
  img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
  overlay.appendChild(img);
  document.body.appendChild(overlay);
}

// ── Site Plan Panel ──
function renderSitePlanPanel(scope_json, compact) {
  var scope = typeof scope_json === 'string' ? JSON.parse(scope_json) : scope_json;
  if (!scope) return '';
  var imgSrc = null;
  var label = 'Site Plan';

  // Patio: scope_json.client._sitePlanImage
  if (scope.client && scope.client._sitePlanImage) {
    imgSrc = scope.client._sitePlanImage;
    label = 'Site Plan (Patio Scope)';
  }
  // Fencing: scope_json.job.sitePlanImage
  if (!imgSrc && scope.job && scope.job.sitePlanImage) {
    imgSrc = scope.job.sitePlanImage;
    label = 'Site Plan (Fencing Scope)';
  }
  // Fallback: Google Static Maps satellite if coordinates available
  if (!imgSrc) {
    var latlng = null;
    if (scope.client && scope.client._latlng) latlng = scope.client._latlng;
    else if (scope.job && scope.job._latlng) latlng = scope.job._latlng;
    if (latlng && latlng.lat && latlng.lng) {
      imgSrc = 'https://maps.googleapis.com/maps/api/staticmap?center=' + latlng.lat + ',' + latlng.lng + '&zoom=19&size=600x400&maptype=satellite&key=AIzaSyCVNUaGS6k6MBG6_-MbCyiIGUajnzHU7DM';
      label = 'Satellite View';
    }
  }

  if (!imgSrc) return '';
  var maxW = compact ? '200px' : '100%';
  var html = '<div style="background:var(--sw-card);padding:14px;margin-bottom:12px;box-shadow:var(--sw-shadow);">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--sw-mid);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">&#128205; ' + label + '</div>';
  html += '<img src="' + imgSrc + '" style="max-width:' + maxW + ';width:100%;cursor:pointer;display:block;" onclick="showSitePlanOverlay(this.src)" alt="Site plan">';
  html += '<div style="font-size:10px;color:var(--sw-text-sec);margin-top:4px;">Click to enlarge</div>';
  html += '</div>';
  return html;
}

// ── Document Links by Type ──
function renderDocumentLinks(documents, types, heading) {
  var docs = (documents || []).filter(function(d) { return types.indexOf(d.type) >= 0; });
  if (docs.length === 0) return '';
  var html = '<div style="margin-top:12px;">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--sw-mid);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">' + heading + '</div>';
  docs.forEach(function(doc) {
    var url = doc.storage_url || doc.pdf_url;
    var name = doc.file_name || doc.type || 'Document';
    html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--sw-border);font-size:13px;">';
    html += '<span style="font-size:16px;">&#128196;</span>';
    html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(name) + '</span>';
    if (doc.version > 1) html += '<span style="font-size:11px;color:var(--sw-text-sec);">v' + doc.version + '</span>';
    if (url) html += '<a href="' + escapeHtml(url) + '" target="_blank" class="btn btn-secondary btn-sm" style="font-size:11px;padding:2px 8px;text-decoration:none;">View</a>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function renderScopeSummary(scope_json, jobType, jobId) {
  var scope = typeof scope_json === 'string' ? JSON.parse(scope_json) : scope_json;
  if (!scope) return '<div style="font-size:12px; color:var(--sw-text-sec); padding:4px 0;">No scope data</div>';

  var config = scope.config || scope;
  var badgeStyle = 'display:inline-block;font-size:11px;font-weight:600;padding:3px 8px;margin:2px 3px 2px 0;background:var(--sw-light);color:var(--sw-dark);border-left:3px solid var(--sw-mid);';
  var html = '<div style="font-size:12px; padding:6px 0; line-height:1.6;">';

  if (jobType === 'fencing') {
    // Fencing scope summary
    var fenceJob = scope.job || {};
    var sections = fenceJob.runs || scope.sections || [];
    if (sections.length > 0) {
      var totalMetres = sections.reduce(function(s, sec) { return s + (parseFloat(sec.length) || 0); }, 0);
      var totalPanels = sections.reduce(function(s, sec) { return s + (sec.panels || []).length; }, 0);
      html += '<div><strong>Total:</strong> ' + totalMetres.toFixed(1) + 'm fence across ' + sections.length + ' run' + (sections.length === 1 ? '' : 's') + '</div>';
      // Visual badges
      html += '<div style="margin:6px 0;">';
      html += '<span style="' + badgeStyle + '">' + totalMetres.toFixed(1) + 'm total</span>';
      if (totalPanels > 0) html += '<span style="' + badgeStyle + '">' + totalPanels + ' panels</span>';
      var fenceColor = fenceJob.sheetColour || fenceJob.colour || '';
      if (fenceColor) html += '<span style="' + badgeStyle + 'border-color:var(--sw-orange);">&#127912; ' + escapeHtml(fenceColor) + '</span>';
      var fenceProfile = fenceJob.profile || '';
      if (fenceProfile) html += '<span style="' + badgeStyle + '">' + escapeHtml(fenceProfile) + '</span>';
      html += '</div>';
      sections.forEach(function(sec, i) {
        html += '<div style="margin-left:8px; color:var(--sw-text-sec);">Run ' + (i+1) + ': ' + (sec.length || 0) + 'm, ' + (sec.sheetHeight || 1800) + 'mm high';
        if (sec.retaining) html += ', retaining';
        html += '</div>';
      });
    }
    // Gates
    var gates = fenceJob.gates || scope.gates || [];
    if (gates.length > 0) {
      html += '<div style="margin:4px 0;"><strong>Gates (' + gates.length + '):</strong> ' + gates.map(function(g) { return (g.type || 'pedestrian') + ' (' + (g.width || 900) + 'mm)'; }).join(', ') + '</div>';
    }
    // Removal
    var removal = fenceJob.removal || scope.removal;
    if (removal && (removal.length > 0 || removal.totalMetres > 0)) {
      html += '<div><strong>Removal:</strong> ' + (removal.totalMetres || removal.length || 0) + 'm old fence</div>';
    }
  } else {
    // Patio scope summary
    if (config.length || config.projection) {
      html += '<div><strong>Size:</strong> ' + (config.length || '?') + 'm × ' + (config.projection || '?') + 'm';
      if (config.length && config.projection) html += ' (' + (config.length * config.projection).toFixed(1) + 'm²)';
      html += '</div>';
    }
    // Visual badges for patio
    html += '<div style="margin:6px 0;">';
    if (config.roofStyle) html += '<span style="' + badgeStyle + '">' + escapeHtml(config.roofStyle) + '</span>';
    if (config.roofing || config.panel_type) html += '<span style="' + badgeStyle + '">' + escapeHtml(config.roofing || config.panel_type) + '</span>';
    if (config.connection) html += '<span style="' + badgeStyle + '">' + escapeHtml(config.connection) + '</span>';
    if (config.sheetColor) html += '<span style="' + badgeStyle + 'border-color:var(--sw-orange);">&#127912; ' + escapeHtml(config.sheetColor) + '</span>';
    if (config.steelColor) html += '<span style="' + badgeStyle + '">Steel: ' + escapeHtml(config.steelColor) + '</span>';
    html += '</div>';
    if (config.posts || config.post_count) html += '<div><strong>Posts:</strong> ' + (config.post_count || config.posts?.count || config.posts) + ' × ' + (config.post_size || config.posts?.size || '100x100 SHS') + '</div>';
  }

  if (Object.keys(config).length === 0 && !scope.sections && !(scope.job && scope.job.runs)) {
    html += '<div style="color:var(--sw-text-sec);">No scope data</div>';
  }

  // Scope tool link
  var scopeToolUrl = jobType === 'fencing' ? 'https://marninms98-dotcom.github.io/fence-designer/' : 'https://marninms98-dotcom.github.io/patio/';
  var linkId = jobId || scope.jobId || '';
  if (linkId) {
    html += '<div style="margin-top:6px;"><a href="' + scopeToolUrl + '?jobId=' + linkId + '" target="_blank" style="font-size:11px;color:var(--sw-mid);font-weight:600;text-decoration:none;">&#128279; Open in Scope Tool &#8599;</a></div>';
  }

  html += '</div>';
  return html;
}

// ════════════════════════════════════════════════════════════
// FULL-PAGE JOB DETAIL VIEW
// ════════════════════════════════════════════════════════════

var _currentJobData = null;
var _currentJobId = null;

// Open full-page job detail by UUID
async function openJobDetail(jobId) {
  _currentJobId = jobId;
  _emailLogLoaded = false; // reset email log when switching jobs
  // Save scroll position for kanban return
  var jobsBody = document.getElementById('jobsBody');
  if (jobsBody) sessionStorage.setItem('sw_kanban_scroll', jobsBody.scrollTop || window.scrollY);

  // Show the view
  document.getElementById('jobDetailView').classList.add('active');
  document.querySelector('.header').style.display = 'none';
  document.querySelector('.mobile-nav').style.display = 'none';
  document.querySelector('.container').style.display = 'none';

  // Show loading
  document.getElementById('jdHealthTop').innerHTML = '<div class="loading" style="padding:8px;">Loading...</div>';
  var _clrIds = ['jdOverview','jdMoney','jdBuild','jdFiles','jdComms','jdHistory'];
  _clrIds.forEach(function(id) { var el = document.getElementById(id); if (el) el.innerHTML = ''; });

  try {
    var data = await opsFetch('job_detail', { jobId: jobId });
    _currentJobData = data;

    // Update URL hash
    var jobNum = data.job.job_number || jobId.slice(0, 8);
    if (history.pushState) history.pushState({ job: jobId }, '', '#job/' + jobNum);

    // Load annotations for this job (async, non-blocking)
    loadAnnotations('entity', 'job', jobId).then(function(anns) {
      _currentJobAnnotations = anns || [];
      // If overview is showing, inject dots
      var overviewEl = document.getElementById('jdOverview');
      if (overviewEl && overviewEl.innerHTML && _currentJobAnnotations.length > 0) {
        renderAnnotationDots(_currentJobAnnotations, 'job_overview', overviewEl);
      }
    }).catch(function() { _currentJobAnnotations = []; });

    renderHealthBar(data);
    // Render the active sub-view (default to overview)
    var activeTab = localStorage.getItem('sw_jd_tab') || 'overview';
    showJobSubView(activeTab);
  } catch (e) {
    document.getElementById('jdHealthTop').innerHTML = '<div style="color:var(--sw-red);padding:12px;">Error: ' + e.message + '</div>';
  }
}

// Open job detail by job_number reference (for #job/SWP-25019 deep links)
async function openJobDetailByRef(ref) {
  // If ref looks like a UUID, open directly
  if (ref.length > 20) { openJobDetail(ref); return; }
  // Otherwise search jobs cache for matching job_number
  if (_jobsCache && _jobsCache.length > 0) {
    var match = _jobsCache.find(function(j) { return j.job_number === ref; });
    if (match) { openJobDetail(match.id); return; }
  }
  // Fallback: load pipeline and search
  try {
    var data = await opsFetch('pipeline');
    var allJobs = [];
    Object.keys(data.columns || {}).forEach(function(s) { allJobs = allJobs.concat(data.columns[s]); });
    var match = allJobs.find(function(j) { return j.job_number === ref; });
    if (match) { openJobDetail(match.id); return; }
  } catch(e) {}
  showToast('Job "' + ref + '" not found', 'warning');
}

function closeJobDetail(skipHistory) {
  document.getElementById('jobDetailView').classList.remove('active');
  document.querySelector('.header').style.display = '';
  document.querySelector('.mobile-nav').style.display = '';
  document.querySelector('.container').style.display = '';
  _currentJobData = null;
  _currentJobId = null;

  if (!skipHistory && history.pushState) {
    var savedTab = localStorage.getItem('sw_ops_tab') || 'jobs';
    history.pushState(null, '', '#' + savedTab);
  }

  // Restore kanban scroll position
  var savedScroll = sessionStorage.getItem('sw_kanban_scroll');
  if (savedScroll) {
    setTimeout(function() { window.scrollTo(0, parseInt(savedScroll)); }, 50);
  }
}

// Refresh current job detail (after an action)
async function refreshJobDetail() {
  if (_currentJobId) {
    try {
      var data = await opsFetch('job_detail', { jobId: _currentJobId });
      _currentJobData = data;
      renderHealthBar(data);
      renderActionDrawer(data);
      var activeTab = document.querySelector('.jd-tab.active');
      var tab = activeTab ? activeTab.getAttribute('data-jd-tab') : 'timeline';
      showJobSubView(tab);
    } catch(e) {}
  }
}

function showJobSubView(tab) {
  // Map legacy tab names
  if (tab === 'timeline') tab = 'history';
  var tabs = ['overview', 'money', 'build', 'files', 'comms', 'history'];
  var ids = ['jdOverview', 'jdMoney', 'jdBuild', 'jdFiles', 'jdComms', 'jdHistory'];
  tabs.forEach(function(t, i) {
    var el = document.getElementById(ids[i]);
    var btn = document.querySelector('[data-jd-tab="' + t + '"]');
    if (t === tab) {
      if (el) el.classList.add('active');
      if (btn) btn.classList.add('active');
    } else {
      if (el) el.classList.remove('active');
      if (btn) btn.classList.remove('active');
    }
  });
  localStorage.setItem('sw_jd_tab', tab);

  if (!_currentJobData) return;
  if (tab === 'overview') renderOverviewView(_currentJobData);
  if (tab === 'money') renderMoneyView(_currentJobData);
  if (tab === 'build') renderBuildView(_currentJobData);
  if (tab === 'files') renderFilesView(_currentJobData);
  if (tab === 'comms') renderCommsView(_currentJobData);
  if (tab === 'history') renderHistoryView(_currentJobData);
}

// ── Health Bar (Zone 1) ──

var STATUS_SEQUENCE = ['draft', 'quoted', 'accepted', 'scheduled', 'in_progress', 'complete', 'invoiced', 'paid'];

function renderHealthBar(data) {
  var j = data.job;

  // Minimal header: back, job#, client, suburb, type, status — nothing else
  var html = '<button class="jd-back" onclick="closeJobDetail()" title="Back">&larr;</button>';
  html += '<span class="jd-job-id">' + (j.job_number || '') + '</span>';
  html += '<span class="jd-client-name">' + escapeHtml(j.client_name || 'Unknown') + '</span>';
  html += '<span class="jd-suburb">' + escapeHtml(j.site_suburb || '') + '</span>';
  html += '<span class="jd-type-badge ' + j.type + '">' + typeBadgeLabel(j.type) + '</span>';
  html += '<span class="jd-status-badge" style="background:transparent;color:' + (STATUS_COLORS[j.status] || '#999') + ';border:1px solid ' + (STATUS_COLORS[j.status] || '#999') + '40">' + (STATUS_LABELS[j.status] || j.status) + '</span>';
  document.getElementById('jdHealthTop').innerHTML = html;
}

function daysSince(dateStr) {
  if (!dateStr) return 0;
  var d = new Date(dateStr);
  var now = new Date();
  return Math.max(0, Math.floor((now - d) / 86400000));
}

function confirmStepChange(jobId, targetStatus, targetIdx, currentIdx) {
  if (targetIdx <= currentIdx) return; // Can't go backwards
  if (targetIdx !== currentIdx + 1) return; // Only advance one step
  if (targetStatus === 'complete') {
    // Use existing cascade modal
    openCascadeModal(jobId);
    return;
  }
  if (confirm('Move job to ' + (STATUS_LABELS[targetStatus] || targetStatus) + '?')) {
    changeJobStatus(jobId, targetStatus);
  }
}

// ── Health Check Alerts ──

function evaluateJobAlerts(data) {
  var j = data.job;
  var alerts = [];
  var today = new Date().toISOString().slice(0, 10);

  var salesInvoices = (data.invoices || []).filter(function(inv) {
    return inv.invoice_type === 'ACCREC' && ['VOIDED','DELETED'].indexOf(inv.status) < 0;
  });

  // 1. RED: complete/in_progress + 0 assignments
  if ((['complete','in_progress'].indexOf(j.status) >= 0) && (data.assignments || []).length === 0) {
    alerts.push({ level: 'red', icon: '&#9888;', message: 'No crew assigned', target: 'build' });
  }

  // 2. RED: complete + no sales invoices
  if (j.status === 'complete' && salesInvoices.length === 0) {
    alerts.push({ level: 'red', icon: '&#9888;', message: 'Job complete — not invoiced', target: 'money' });
  }

  // 3. RED: overdue invoice
  salesInvoices.forEach(function(inv) {
    if (inv.status === 'AUTHORISED' && inv.due_date && inv.due_date < today) {
      var overdueDays = daysSince(inv.due_date);
      alerts.push({ level: 'red', icon: '&#9888;', message: 'Invoice ' + overdueDays + ' days overdue — chase', target: 'money' });
    }
  });

  // 4. AMBER: accepted/scheduled + 0 POs + has scope
  if ((['accepted','scheduled'].indexOf(j.status) >= 0) && (data.purchase_orders || []).length === 0 && j.scope_json) {
    alerts.push({ level: 'amber', icon: '&#9888;', message: 'Materials not ordered', target: 'build' });
  }

  // 5. AMBER: PO costs > quote
  var quoteVal = j.pricing_json?.totalIncGST || j.pricing_json?.total || 0;
  var poCosts = (data.purchase_orders || []).reduce(function(s, po) { return s + (po.total || 0); }, 0);
  if (quoteVal > 0 && poCosts > quoteVal) {
    alerts.push({ level: 'amber', icon: '&#9888;', message: 'Over budget by ' + fmt$(poCosts - quoteVal), target: 'money' });
  }

  // 6. AMBER: quoted for >14 days
  if (j.status === 'quoted' && j.quoted_at && daysSince(j.quoted_at) > 14) {
    alerts.push({ level: 'amber', icon: '&#9888;', message: 'Quote stale — follow up', target: 'timeline' });
  }

  // 7. AMBER: scheduled + all assignments missing user
  if (j.status === 'scheduled' && (data.assignments || []).length > 0) {
    var allUnassigned = data.assignments.every(function(a) { return !a.users || !a.users.name; });
    if (allUnassigned) {
      alerts.push({ level: 'amber', icon: '&#9888;', message: 'No crew assigned to schedule', target: 'build' });
    }
  }

  // 8. AMBER: PO delivery tomorrow + not confirmed
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  var tomorrowStr = tomorrow.toISOString().slice(0, 10);
  (data.purchase_orders || []).forEach(function(po) {
    if (po.delivery_date === tomorrowStr && ['authorised','billed'].indexOf(po.status) < 0) {
      alerts.push({ level: 'amber', icon: '&#9888;', message: 'Delivery tomorrow — not confirmed', target: 'build' });
    }
  });

  return alerts;
}

// ── Timeline View ──

// ════════════════════════════════════════════════════════════
// OVERVIEW TAB — Job Command Centre
// ════════════════════════════════════════════════════════════

function renderOverviewView(data) {
  var j = data.job;
  var html = '';
  // Section 1: Client Card
  html += '<div style="background:var(--sw-card);padding:14px;margin-bottom:12px;box-shadow:var(--sw-shadow);">';
  html += '<div style="font-size:16px;font-weight:700;color:var(--sw-dark);margin-bottom:6px;">' + escapeHtml(j.client_name || 'Unknown Client') + '</div>';
  if (j.site_address) html += '<div style="font-size:13px;color:var(--sw-text-sec);margin-bottom:2px;">' + escapeHtml(j.site_address) + '</div>';
  if (j.site_suburb) html += '<div style="font-size:12px;color:var(--sw-mid);">' + escapeHtml(j.site_suburb) + '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">';
  if (j.client_phone) {
    html += '<button class="btn btn-secondary btn-sm" onclick="scheduleCallLog()">&#9742; Call ' + j.client_phone + '</button>';
    html += '<button class="btn btn-secondary btn-sm" onclick="showJobSubView(\x27comms\x27)">&#128172; SMS</button>';
  }
  if (j.client_email) html += '<a href="mailto:' + j.client_email + '" class="btn btn-secondary btn-sm" style="text-decoration:none;">&#9993; Email</a>';
  if (j.site_address) html += '<a href="https://maps.google.com/?q=' + encodeURIComponent((j.site_address||'') + (j.site_suburb ? ', ' + j.site_suburb : '')) + '" target="_blank" class="btn btn-secondary btn-sm" style="text-decoration:none;">&#128205; Navigate</a>';
  html += '</div></div>';

  // Site Plan Image (between client card and job summary)
  if (j.scope_json && j.type !== 'miscellaneous') {
    html += renderSitePlanPanel(j.scope_json, false);
  }

  // Section 2: Job Summary
  html += '<div style="background:var(--sw-card);padding:14px;margin-bottom:12px;box-shadow:var(--sw-shadow);">';
  var scopeDesc = typeBadgeLabel(j.type) + ' project';
  if (j.scope_json) {
    var sc = j.scope_json.config || j.scope_json;
    var parts = [];
    if (sc.length && sc.projection) parts.push(sc.length + 'm x ' + sc.projection + 'm');
    if (sc.roofStyle) parts.push(sc.roofStyle);
    if (sc.roofing || sc.panel_type) parts.push(sc.roofing || sc.panel_type);
    if (parts.length) scopeDesc = parts.join(', ');
  } else if (j.pricing_json && j.pricing_json.job_description) {
    scopeDesc = j.pricing_json.job_description.substring(0, 80);
  }
  html += '<div style="font-size:13px;color:var(--sw-text);margin-bottom:8px;">' + escapeHtml(scopeDesc) + '</div>';
  var quoteVal = j.pricing_json ? (j.pricing_json.totalIncGST || j.pricing_json.total || 0) : 0;
  var poCosts = (data.purchase_orders || []).reduce(function(s, po) { return s + (po.total || 0); }, 0);
  var margin = quoteVal > 0 ? quoteVal - poCosts : 0;
  var marginPct = quoteVal > 0 ? (margin / quoteVal * 100).toFixed(0) : 0;
  var marginColor = marginPct >= 35 ? 'var(--sw-green)' : marginPct >= 25 ? 'var(--sw-yellow)' : 'var(--sw-red)';
  html += '<div style="display:flex;gap:16px;align-items:baseline;">';
  html += '<span style="font-size:20px;font-weight:700;color:var(--sw-dark);font-family:var(--sw-font-num);">' + fmt$(quoteVal) + '</span>';
  if (quoteVal > 0 && poCosts > 0) html += '<span style="font-size:13px;font-weight:600;color:' + marginColor + ';">' + marginPct + '% margin (' + fmt$(margin) + ')</span>';
  html += '</div>';
  html += '<div style="margin-top:8px;font-size:11px;display:flex;gap:12px;">';
  if (j.type !== 'miscellaneous') {
    var scopeUrl = j.type === 'fencing' ? 'https://marninms98-dotcom.github.io/fence-designer/' : 'https://marninms98-dotcom.github.io/patio/';
    html += '<a href="' + scopeUrl + '?jobId=' + j.id + '" target="_blank" style="color:var(--sw-mid);">Open Scope &#8599;</a>';
  }
  if (j.ghl_opportunity_id) html += '<a href="https://app.maxlead.com.au/v2/location/' + GHL_LOCATION_ID + '/opportunities/' + j.ghl_opportunity_id + '" target="_blank" style="color:var(--sw-mid);">View in GHL &#8599;</a>';
  html += '</div></div>';

  // Section 3: Next Actions
  var alerts = evaluateJobAlerts(data);
  html += '<div style="margin-bottom:12px;">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--sw-mid);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Next Actions</div>';
  if (alerts.length === 0) html += '<div style="background:rgba(39,174,96,0.06);padding:10px 14px;font-size:13px;color:var(--sw-green);font-weight:500;">&#9989; Job on track</div>';
  alerts.forEach(function(a) {
    var targetTab = a.target === 'timeline' ? 'history' : a.target;
    html += '<div style="background:' + (a.level === 'red' ? 'rgba(231,76,60,0.06)' : 'rgba(230,126,34,0.06)') + ';padding:8px 12px;margin-bottom:4px;display:flex;align-items:center;gap:8px;border-left:3px solid ' + (a.level === 'red' ? 'var(--sw-red)' : 'var(--sw-yellow)') + ';cursor:pointer;" onclick="showJobSubView(\x27' + targetTab + '\x27)">';
    html += '<span style="font-size:13px;flex:1;">' + a.icon + ' ' + a.message + '</span>';
    html += '<span style="font-size:11px;color:var(--sw-mid);">&#8594;</span></div>';
  });
  var nextStatuses = getNextStatuses(j.status);
  nextStatuses.forEach(function(s) {
    var color = s === 'cancelled' ? 'var(--sw-red)' : 'var(--sw-dark)';
    html += '<div style="background:var(--sw-light);padding:8px 12px;margin-bottom:4px;display:flex;align-items:center;gap:8px;border-left:3px solid ' + color + ';">';
    html += '<span style="font-size:13px;flex:1;">Mark as ' + (STATUS_LABELS[s] || s) + '</span>';
    html += '<button class="btn btn-sm" style="background:' + color + ';color:#fff;" onclick="changeJobStatus(\x27' + j.id + '\x27,\x27' + s + '\x27)">' + (STATUS_LABELS[s] || s) + '</button></div>';
  });
  html += '</div>';

  // AI Annotations section (between Next Actions and Progress)
  if (_currentJobAnnotations && _currentJobAnnotations.length > 0) {
    var jobAnns = _currentJobAnnotations.filter(function(a) { return a.ui_location === 'job_overview' || (a.effective_priority || a.priority) >= 80; });
    if (jobAnns.length > 0) {
      html += '<div style="margin-bottom:12px;">';
      html += '<div style="font-size:11px;font-weight:700;color:var(--sw-mid);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">AI Insights</div>';
      jobAnns.forEach(function(ann) {
        var borderColor = ann.severity === 'amber' ? '#e67e22' : ann.category === 'learning' ? '#9b59b6' : '#3498db';
        html += '<div style="background:' + borderColor + '08;padding:10px 12px;margin-bottom:4px;border-left:3px solid ' + borderColor + ';" id="ann-overview-' + ann.id + '">';
        html += '<div style="font-size:13px;font-weight:600;color:var(--sw-dark);margin-bottom:4px;">' + escapeHtml(ann.title) + '</div>';
        if (ann.body) html += '<div style="font-size:11px;color:var(--sw-text-sec);margin-bottom:6px;">' + escapeHtml(ann.body) + '</div>';
        html += renderAnnotationResponse(ann);
        html += '</div>';
      });
      html += '</div>';
    }
  }

  // Section 4: Progress Checklist
  html += '<div style="background:var(--sw-card);padding:14px;margin-bottom:12px;box-shadow:var(--sw-shadow);">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--sw-mid);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Progress</div>';
  var salesInvs = (data.invoices || []).filter(function(i) { return i.invoice_type === 'ACCREC' && ['VOIDED','DELETED'].indexOf(i.status) < 0; });
  var paidInvs = salesInvs.filter(function(i) { return i.status === 'PAID'; });
  var depInvs = salesInvs.filter(function(i) { return (i.reference || '').indexOf('DEP') >= 0; });
  var depPaid = depInvs.filter(function(i) { return i.status === 'PAID'; });
  var checkSteps = [
    { label: 'Lead received', done: !!j.created_at, date: j.created_at },
    { label: 'Quote sent', done: !!j.quoted_at, date: j.quoted_at, extra: quoteVal > 0 ? fmt$(quoteVal) : '' },
    { label: 'Quote accepted', done: !!j.accepted_at, date: j.accepted_at },
    { label: 'Deposit invoiced', done: depInvs.length > 0, extra: depPaid.length > 0 ? 'Paid' : depInvs.length > 0 ? 'Sent' : '' },
    { label: 'Materials ordered', done: (data.purchase_orders || []).length > 0, extra: (data.purchase_orders || []).length + ' POs' },
    { label: 'Crew assigned', done: (data.assignments || []).length > 0, extra: (data.assignments || []).length + ' assignments' },
    { label: 'Build complete', done: !!j.completed_at, date: j.completed_at },
    { label: 'Invoiced', done: salesInvs.length > 0 },
    { label: 'Paid', done: paidInvs.length > 0 },
  ];
  checkSteps.forEach(function(s) {
    var icon = s.done ? '<span style="color:var(--sw-green);">&#9989;</span>' : '<span style="color:var(--sw-border);">&#9744;</span>';
    var dateStr = s.date ? ' <span style="font-size:10px;color:var(--sw-text-sec);">' + fmtDate((s.date||'').slice(0,10)) + '</span>' : '';
    var extraStr = s.extra ? ' <span style="font-size:10px;color:var(--sw-mid);">' + s.extra + '</span>' : '';
    html += '<div style="padding:3px 0;display:flex;align-items:center;gap:8px;font-size:13px;">' + icon + '<span style="' + (s.done ? '' : 'color:var(--sw-text-sec);') + '">' + s.label + '</span>' + dateStr + extraStr + '</div>';
  });
  html += '</div>';

  // Section 5: Recent Activity
  html += '<div style="background:var(--sw-card);padding:14px;box-shadow:var(--sw-shadow);">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--sw-mid);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Recent Activity</div>';
  var evts = buildTimelineEvents(data);
  evts.sort(function(a, b) { return (b.datetime || '') > (a.datetime || '') ? 1 : -1; });
  var shown = 0;
  evts.forEach(function(ev) {
    if (shown >= 5) return;
    if (ev.source === 'photo') return;
    html += '<div style="padding:3px 0;font-size:12px;display:flex;gap:6px;">';
    html += '<span style="color:' + getTimelineColor(ev.source) + ';">&#9679;</span>';
    html += '<span style="flex:1;color:var(--sw-text);">' + escapeHtml(ev.label) + '</span>';
    html += '<span style="font-size:10px;color:var(--sw-text-sec);white-space:nowrap;">' + (ev.datetime ? fmtDate(ev.datetime.slice(0,10)) : '') + '</span></div>';
    shown++;
  });
  if (evts.length > 5) html += '<div style="margin-top:6px;"><a href="#" onclick="event.preventDefault();showJobSubView(\x27history\x27)" style="font-size:11px;color:var(--sw-mid);">View full history &#8594;</a></div>';
  html += '</div>';

  document.getElementById('jdOverview').innerHTML = html;
}

// ════════════════════════════════════════════════════════════
// HISTORY TAB — Filtered Timeline
// ════════════════════════════════════════════════════════════

function renderHistoryView(data) {
  var events = buildTimelineEvents(data);
  var today = new Date().toISOString().slice(0, 10);
  var filtered = [];
  var lastScope = null;
  events.sort(function(a, b) { return (a.datetime || '') < (b.datetime || '') ? -1 : 1; });
  events.forEach(function(ev) {
    if (ev.type === 'scope_saved') {
      if (lastScope && (new Date(ev.datetime).getTime() - new Date(lastScope.datetime).getTime()) < 300000) { lastScope = ev; return; }
      if (lastScope) filtered.push(lastScope);
      lastScope = ev;
    } else {
      if (lastScope) { filtered.push(lastScope); lastScope = null; }
      filtered.push(ev);
    }
  });
  if (lastScope) filtered.push(lastScope);
  var past = filtered.filter(function(e) { return e.date <= today; });
  var future = filtered.filter(function(e) { return e.date > today; });
  var html = '<div class="jd-timeline">';
  past.sort(function(a, b) { return b.datetime > a.datetime ? 1 : -1; });
  past.forEach(function(ev) { html += renderTimelineItem(ev, false); });
  if (future.length > 0) {
    html += '<div class="jd-tl-divider">&#9660; Upcoming</div>';
    future.sort(function(a, b) { return a.datetime < b.datetime ? -1 : 1; });
    future.forEach(function(ev) { html += renderTimelineItem(ev, true); });
  }
  html += '</div>';
  document.getElementById('jdHistory').innerHTML = html;
}

function renderTimelineView(data) {
  renderHistoryView(data);
  var today = new Date().toISOString().slice(0, 10);

  // Split into past and future
  var past = events.filter(function(e) { return e.date <= today; });
  var future = events.filter(function(e) { return e.date > today; });

  var html = '<div class="jd-timeline">';

  // Past events (most recent first)
  past.sort(function(a, b) { return b.date < a.date ? -1 : b.date > a.date ? 1 : 0; });
  past.forEach(function(ev) {
    html += renderTimelineItem(ev, false);
  });

  // TODAY divider
  if (future.length > 0) {
    html += '<div class="jd-tl-divider">&#9660; Upcoming</div>';
    future.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    future.forEach(function(ev) {
      html += renderTimelineItem(ev, true);
    });
  }

  html += '</div>';

  var tlEl = document.getElementById('jdTimeline') || document.getElementById('jdHistory');
  if (tlEl) tlEl.innerHTML = html;
}

function buildTimelineEvents(data) {
  var events = [];
  var j = data.job;

  // Job events
  (data.events || []).forEach(function(ev) {
    var label = formatEventType(ev.event_type, ev.detail_json);
    // Format detail for display
    var detailStr = '';
    var d = ev.detail_json;
    if (d && typeof d === 'object') {
      if (ev.event_type === 'po_email_log') {
        detailStr = (d.direction === 'received' ? 'Received: ' : 'Sent: ') + (d.summary || '');
      } else if (d.from && d.to) {
        detailStr = d.from + ' → ' + d.to;
      } else {
        detailStr = Object.entries(d).filter(function(p) { return p[1] && p[0] !== 'po_id'; }).map(function(p) { return p[0] + ': ' + p[1]; }).join(' | ');
      }
    } else if (d) {
      detailStr = String(d);
    }
    events.push({
      date: (ev.created_at || '').slice(0, 10),
      datetime: ev.created_at,
      label: label,
      by: ev.users?.name || '',
      type: ev.event_type,
      detail: detailStr,
      source: ev.event_type === 'po_email_log' ? 'po' : 'event'
    });
  });

  // POs as synthetic events
  (data.purchase_orders || []).forEach(function(po) {
    events.push({
      date: (po.created_at || '').slice(0, 10),
      datetime: po.created_at,
      label: 'PO created — ' + (po.supplier_name || 'Unknown'),
      detail: po.po_number + ' | ' + fmt$(po.total) + ' | ' + (po.status || ''),
      source: 'po'
    });
    // Future: delivery date
    if (po.delivery_date && po.delivery_date > new Date().toISOString().slice(0, 10)) {
      events.push({
        date: po.delivery_date,
        datetime: po.delivery_date + 'T00:00:00',
        label: 'Delivery — ' + (po.supplier_name || ''),
        detail: po.po_number + ' | ' + fmt$(po.total),
        source: 'po_future',
        isFuture: true
      });
    }
  });

  // Assignments as synthetic events
  (data.assignments || []).forEach(function(a) {
    events.push({
      date: a.scheduled_date || (a.created_at || '').slice(0, 10),
      datetime: a.scheduled_date ? a.scheduled_date + 'T07:00:00' : a.created_at,
      label: 'Crew scheduled' + (a.crew_name ? ' — ' + cleanCrewName(a.crew_name) : ''),
      by: a.users?.name || '',
      detail: fmtDate(a.scheduled_date) + (a.scheduled_end ? ' to ' + fmtDate(a.scheduled_end) : '') + ' | ' + (a.status || ''),
      source: 'assignment'
    });
  });

  // Invoices as synthetic events
  (data.invoices || []).filter(function(inv) {
    return inv.invoice_type === 'ACCREC' && ['VOIDED','DELETED'].indexOf(inv.status) < 0;
  }).forEach(function(inv) {
    events.push({
      date: (inv.created_at || inv.date || '').slice(0, 10),
      datetime: inv.created_at || inv.date,
      label: 'Invoice ' + (inv.invoice_number || '') + ' created',
      detail: fmt$(inv.total) + ' | ' + (inv.status || ''),
      source: 'invoice'
    });
    // Future: due date
    if (inv.due_date && inv.due_date > new Date().toISOString().slice(0, 10) && inv.status !== 'PAID') {
      events.push({
        date: inv.due_date,
        datetime: inv.due_date + 'T00:00:00',
        label: 'Invoice ' + (inv.invoice_number || '') + ' due',
        detail: fmt$(inv.amount_due || inv.total),
        source: 'invoice_future',
        isFuture: true
      });
    }
  });

  // Photos as timeline entries
  (data.media || []).forEach(function(m) {
    events.push({
      date: (m.taken_at || m.created_at || '').slice(0, 10),
      datetime: m.taken_at || m.created_at,
      label: 'Photo' + (m.phase ? ' — ' + m.phase : ''),
      source: 'photo',
      photoUrl: m.thumbnail_url || m.storage_url,
      fullUrl: m.storage_url
    });
  });

  return events;
}

function renderTimelineItem(ev, isFuture) {
  var html = '<div class="jd-tl-item' + (isFuture ? ' future' : '') + '">';
  html += '<div class="jd-tl-dot" style="background:' + getTimelineColor(ev.source) + '"></div>';
  html += '<div class="jd-tl-label">' + escapeHtml(ev.label) + '</div>';
  html += '<div class="jd-tl-meta">';
  if (ev.datetime) {
    html += new Date(ev.datetime).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    if (!isFuture && ev.datetime.includes('T')) {
      html += ' ' + new Date(ev.datetime).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    }
  }
  if (ev.by) html += ' &middot; ' + escapeHtml(ev.by);
  html += '</div>';
  if (ev.detail) {
    html += '<div class="jd-tl-detail">' + escapeHtml(String(ev.detail)) + '</div>';
  }
  if (ev.photoUrl) {
    html += '<img class="jd-tl-photo" src="' + escapeHtml(ev.photoUrl) + '" onclick="window.open(\'' + escapeHtml(ev.fullUrl || ev.photoUrl) + '\',\'_blank\')" alt="Photo">';
  }
  html += '</div>';
  return html;
}

function getTimelineColor(source) {
  var colors = {
    event: 'var(--sw-mid)', po: 'var(--sw-purple)', po_future: 'var(--sw-purple)',
    assignment: 'var(--sw-blue)', invoice: 'var(--sw-green)', invoice_future: 'var(--sw-green)',
    photo: 'var(--sw-orange)'
  };
  return colors[source] || 'var(--sw-mid)';
}

// ── Money View ──

function togglePODetailExpand(poId) {
  var el = document.getElementById('poDetail_' + poId);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function renderMoneyView(data) {
  var j = data.job;
  var quoteVal = j.pricing_json?.totalIncGST || j.pricing_json?.total || 0;
  var costEstimate = j.pricing_json?.costEstimate || j.pricing_json?.totalCost || j.pricing_json?.cost || 0;
  var poCosts = (data.purchase_orders || []).reduce(function(s, po) { return s + (po.total || 0); }, 0);
  var salesInvoices = (data.invoices || []).filter(function(inv) {
    return inv.invoice_type === 'ACCREC' && ['VOIDED','DELETED'].indexOf(inv.status) < 0;
  });
  var invoicedTotal = salesInvoices.reduce(function(s, inv) { return s + (parseFloat(inv.total) || 0); }, 0);
  var invoicePaid = salesInvoices.reduce(function(s, inv) { return s + (parseFloat(inv.amount_paid) || 0); }, 0);
  var margin = quoteVal > 0 ? quoteVal - poCosts : 0;
  var marginPct = quoteVal > 0 ? (margin / quoteVal * 100).toFixed(0) : 0;
  var marginColor = marginPct >= 25 ? 'var(--sw-green)' : marginPct >= 15 ? 'var(--sw-yellow)' : 'var(--sw-red)';

  var html = '<div class="jd-money-grid">';

  // Revenue column
  html += '<div class="jd-money-col">';
  html += '<div class="jd-money-heading">Revenue</div>';
  html += '<div class="jd-money-card"><div class="jd-money-card-head"><span>Quote Value</span><strong>' + fmt$(quoteVal) + '</strong></div>';
  // Quote breakdown — show what was actually quoted
  if (j.scope_json) {
    html += '<div style="font-size:11px;padding:6px 0 2px;border-top:1px solid var(--sw-border);margin-top:6px;color:var(--sw-text-sec);">';
    html += renderScopeSummary(j.scope_json, j.type, j.id);
    html += '</div>';
  }
  // Quote PDF links
  var quoteDocs = (data.documents || []).filter(function(d) { return d.type === 'quote' || d.type === 'permit_quote'; });
  if (quoteDocs.length > 0) {
    quoteDocs.forEach(function(doc) {
      var url = doc.storage_url || doc.pdf_url;
      var name = doc.file_name || 'Quote PDF';
      html += '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:12px;">';
      html += '<span>&#128196;</span>';
      html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(name) + '</span>';
      if (doc.version > 1) html += '<span style="color:var(--sw-text-sec);font-size:10px;">v' + doc.version + '</span>';
      if (url) html += '<a href="' + escapeHtml(url) + '" target="_blank" style="font-size:11px;color:var(--sw-mid);font-weight:600;text-decoration:none;">View &#8599;</a>';
      html += '</div>';
    });
  } else {
    html += '<div style="font-size:11px;color:var(--sw-text-sec);padding:4px 0;font-style:italic;">No quote PDF attached</div>';
  }
  html += '</div>';
  html += '<div class="jd-money-card"><div class="jd-money-card-head"><span>Invoiced</span><strong>' + fmt$(invoicedTotal) + '</strong></div>';
  if (quoteVal > 0) {
    var invPct = Math.min(100, invoicedTotal / quoteVal * 100);
    html += '<div style="height:4px;background:#e0e0e0;border-radius:2px;overflow:hidden;margin-top:6px"><div style="height:100%;width:' + invPct + '%;background:var(--sw-green);border-radius:2px"></div></div>';
  }
  html += '</div>';
  html += '<div class="jd-money-card"><div class="jd-money-card-head"><span>Collected</span><strong style="color:var(--sw-green)">' + fmt$(invoicePaid) + '</strong></div></div>';
  html += '<div class="jd-money-card"><div class="jd-money-card-head"><span>Still to Invoice</span><strong style="color:' + (quoteVal - invoicedTotal > 0 ? 'var(--sw-orange)' : 'var(--sw-green)') + '">' + fmt$(Math.max(0, quoteVal - invoicedTotal)) + '</strong></div></div>';

  // Individual invoices
  if (salesInvoices.length > 0) {
    html += '<div style="margin-top:8px;font-size:12px;font-weight:600;color:var(--sw-text-sec);">Invoices</div>';
    salesInvoices.forEach(function(inv) {
      var statusColor = inv.status === 'PAID' ? 'var(--sw-green)' : inv.status === 'AUTHORISED' ? 'var(--sw-orange)' : 'var(--sw-text-sec)';
      html += '<div class="jd-money-card"><div class="jd-money-card-head">';
      html += '<span>' + (inv.invoice_number || 'Draft') + '</span>';
      html += '<strong>' + fmt$(inv.total) + '</strong></div>';
      html += '<div class="jd-money-card-sub"><span style="color:' + statusColor + '">' + (inv.status || '') + '</span>';
      if (inv.due_date) html += ' &middot; Due ' + fmtDate(inv.due_date);
      html += '</div></div>';
    });
  }
  // Unified invoice button
  html += '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">';
  html += '<button class="btn btn-sm" style="background:var(--sw-dark);color:#fff;" onclick="openUnifiedInvoiceModal(\'' + j.id + '\')">+ Invoice</button>';
  html += '</div>';
  html += '</div>';

  // Costs column
  html += '<div class="jd-money-col">';
  html += '<div class="jd-money-heading">Costs</div>';
  if (costEstimate > 0) {
    html += '<div class="jd-money-card"><div class="jd-money-card-head"><span>Est. Costs</span><strong style="color:var(--sw-text-sec)">' + fmt$(costEstimate) + '</strong></div></div>';
  }
  html += '<div class="jd-money-card"><div class="jd-money-card-head"><span>PO Spend (Actual)</span><strong style="color:var(--sw-red)">' + fmt$(poCosts) + '</strong></div>';
  if (costEstimate > 0) {
    var diff = poCosts - costEstimate;
    var diffLabel = diff > 0 ? 'Over by ' + fmt$(diff) : diff < 0 ? 'Under by ' + fmt$(Math.abs(diff)) : 'On target';
    var diffColor = diff > 0 ? 'var(--sw-red)' : 'var(--sw-green)';
    html += '<div class="jd-money-card-sub" style="color:' + diffColor + '">' + diffLabel + '</div>';
  }
  html += '</div>';

  // PO list with readiness summary
  var pos = data.purchase_orders || [];
  if (pos.length > 0) {
    // Per-job PO readiness summary
    var poByStatus = { draft: 0, approved: 0, sent: 0, confirmed: 0, delivered: 0, other: 0 };
    var awaitingReply = 0;
    var now = Date.now();
    pos.forEach(function(po) {
      if (po.status === 'draft') poByStatus.draft++;
      else if (po.status === 'approved') poByStatus.draft++;
      else if (po.status === 'submitted' || po.status === 'sent') { poByStatus.sent++; var sentTs = po.updated_at || po.created_at; if (sentTs && (now - new Date(sentTs).getTime()) > 48*3600*1000) awaitingReply++; }
      else if (po.status === 'authorised' || po.status === 'confirmed') poByStatus.confirmed++;
      else if (po.status === 'billed' || po.status === 'delivered') poByStatus.delivered++;
      else poByStatus.other++;
    });
    var readyCount = poByStatus.confirmed + poByStatus.delivered;
    var readyColor = readyCount === pos.length ? 'var(--sw-green)' : poByStatus.draft > 0 ? 'var(--sw-red)' : 'var(--sw-orange)';
    html += '<div style="margin-top:8px;font-size:12px;font-weight:600;color:var(--sw-text-sec);">Purchase Orders</div>';
    html += '<div style="font-size:11px;color:' + readyColor + ';margin-bottom:4px;">';
    html += readyCount + '/' + pos.length + ' confirmed/delivered';
    if (poByStatus.draft > 0) html += ', ' + poByStatus.draft + ' draft';
    if (poByStatus.sent > 0) html += ', ' + poByStatus.sent + ' sent';
    if (awaitingReply > 0) html += ' (' + awaitingReply + ' awaiting reply 48h+)';
    html += '</div>';
    pos.forEach(function(po) {
      var poCardId = 'poDetail_' + po.id;
      html += '<div class="jd-money-card" style="cursor:pointer;" onclick="togglePODetailExpand(\'' + po.id + '\')">';
      html += '<div class="jd-money-card-head">';
      html += '<span>' + (po.po_number || '') + ' — ' + escapeHtml(po.supplier_name || '') + '</span>';
      html += '<strong>' + fmt$(po.total) + '</strong></div>';
      html += '<div class="jd-money-card-sub"><span class="status-badge ' + po.status + '">' + (po.status || '') + '</span>';
      if (po.confirmed_delivery_date) html += ' &middot; Delivery ' + fmtDate(po.confirmed_delivery_date);
      else if (po.delivery_date) html += ' &middot; Req. ' + fmtDate(po.delivery_date);
      // Email count preview
      var poEmails = po.communications || po.email_threads || [];
      if (poEmails.length > 0) {
        var lastPE = poEmails[poEmails.length - 1];
        var lastPEPreview = (lastPE.subject || lastPE.body_text || '').slice(0, 40);
        html += ' &middot; <span style="color:var(--sw-mid);">' + poEmails.length + ' email' + (poEmails.length > 1 ? 's' : '') + '</span>';
      }
      html += '</div>';
      // Expandable detail section
      html += '<div id="' + poCardId + '" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--sw-border);font-size:11px;">';
      // Line items
      if (po.line_items && po.line_items.length > 0) {
        html += '<div style="font-weight:600;margin-bottom:4px;color:var(--sw-dark);">Line Items</div>';
        po.line_items.forEach(function(li) {
          html += '<div style="display:flex;gap:6px;padding:2px 0;color:var(--sw-text-sec);">';
          html += '<span style="flex:1;">' + escapeHtml(li.description || '') + '</span>';
          if (li.quantity) html += '<span>' + li.quantity + (li.unit ? ' ' + li.unit : '') + '</span>';
          if (li.total) html += '<span style="font-weight:600;">' + fmt$(li.total) + '</span>';
          html += '</div>';
        });
      }
      // Email thread
      if (poEmails.length > 0) {
        html += '<div style="font-weight:600;margin:8px 0 4px;color:var(--sw-dark);">Email Thread</div>';
        poEmails.forEach(function(em) {
          var dir = em.direction === 'inbound' ? '&#8601; Received' : '&#8599; Sent';
          var emDate = em.created_at ? fmtDate(em.created_at) : '';
          html += '<div style="padding:4px 0;border-bottom:1px solid var(--sw-border);">';
          html += '<div style="display:flex;gap:6px;align-items:center;">';
          html += '<span style="color:var(--sw-mid);font-weight:600;">' + dir + '</span>';
          html += '<span style="color:var(--sw-text-sec);">' + emDate + '</span>';
          if (em.from_email) html += '<span style="color:var(--sw-text-sec);">' + escapeHtml(em.from_email) + '</span>';
          html += '</div>';
          if (em.subject) html += '<div style="font-weight:600;color:var(--sw-dark);">' + escapeHtml(em.subject) + '</div>';
          if (em.body_text) html += '<div style="color:var(--sw-text-sec);white-space:pre-wrap;max-height:80px;overflow:auto;">' + escapeHtml(em.body_text.slice(0, 300)) + '</div>';
          if (em.attachments && em.attachments.length > 0) {
            em.attachments.forEach(function(att) {
              html += '<a href="' + escapeHtml(att.url || '') + '" target="_blank" style="font-size:10px;color:var(--sw-mid);">&#128206; ' + escapeHtml(att.filename || 'Attachment') + '</a> ';
            });
          }
          html += '</div>';
        });
      }
      html += '</div></div>';
    });
  }

  // PO action button
  html += '<div style="margin-top:8px;"><button class="btn btn-secondary btn-sm" onclick="closeJobDetail();openPOModal(\'' + j.id + '\')">+ New PO</button></div>';

  // Xero project
  if (data.xero_project) {
    html += '<div class="jd-money-card" style="border-color:var(--sw-mid);"><div class="jd-money-card-head"><span>Xero Project</span></div>';
    html += '<div class="jd-money-card-sub">' + (data.xero_project.project_name || '') + '</div>';
    html += '<div class="jd-money-card-sub">Invoiced: ' + fmt$(data.xero_project.total_invoiced) + ' | Expenses: ' + fmt$(data.xero_project.total_expenses) + '</div></div>';
  }
  html += '</div></div>';

  // ── Labour Cost Section ──
  var assignments = data.assignments || [];
  var labourPOs = pos.filter(function(po) {
    return (po.category || '').toLowerCase() === 'labour' ||
           (po.supplier_name || '').toLowerCase().includes('labour') ||
           (po.description || '').toLowerCase().includes('labour');
  });
  var labourBudget = labourPOs.reduce(function(s, po) { return s + (po.total || 0); }, 0);

  // Group assignments by crew member and calculate hours
  var crewHours = {};
  assignments.forEach(function(a) {
    if (a.status === 'cancelled') return;
    var name = cleanCrewName(a.crew_name || a.users?.name || 'Unknown');
    if (!crewHours[name]) crewHours[name] = { hours: 0, days: 0, rate: 0, verified: 0, unverified: 0 };
    crewHours[name].days++;
    // If hours tracked (clocked_on/clocked_off), use actual hours
    if (a.hours_worked) {
      crewHours[name].hours += parseFloat(a.hours_worked) || 0;
      crewHours[name].verified++;
    } else if (a.clocked_on && a.clocked_off) {
      var hrs = (new Date(a.clocked_off) - new Date(a.clocked_on)) / 3600000;
      crewHours[name].hours += Math.round(hrs * 10) / 10;
      crewHours[name].verified++;
    } else if (a.status === 'complete') {
      crewHours[name].hours += 8; // Default 8hr day
      crewHours[name].unverified++;
    }
  });

  var crewNames = Object.keys(crewHours);
  if (crewNames.length > 0) {
    html += '<div style="margin-top:16px;padding-top:12px;border-top:2px solid var(--sw-border);">';
    html += '<div style="font-size:13px;font-weight:700;color:var(--sw-dark);margin-bottom:8px;">Labour' + (labourBudget > 0 ? ' — ' + fmt$(labourBudget) + ' budgeted' : '') + '</div>';

    var totalLabourCost = 0;
    crewNames.forEach(function(name) {
      var c = crewHours[name];
      // Look up trade rate from work_orders or use default
      var rate = 0;
      var wos = data.work_orders || [];
      wos.forEach(function(wo) {
        if (wo.trade_name && cleanCrewName(wo.trade_name) === name && wo.hourly_rate) {
          rate = parseFloat(wo.hourly_rate) || 0;
        }
      });
      if (!rate) rate = 45; // Default $45/hr
      c.rate = rate;
      var cost = c.hours * rate;
      totalLabourCost += cost;

      var verifiedLabel = c.verified > 0 ? (c.unverified > 0 ? 'Partial' : 'Verified') : (c.hours > 0 ? 'Estimated' : '');
      var verifiedColor = c.verified > 0 && c.unverified === 0 ? 'var(--sw-green)' : 'var(--sw-orange)';

      html += '<div class="jd-money-card"><div class="jd-money-card-head">';
      html += '<span>' + escapeHtml(name) + '</span>';
      html += '<strong>' + fmt$(cost) + '</strong></div>';
      html += '<div class="jd-money-card-sub">';
      html += c.days + ' day' + (c.days > 1 ? 's' : '') + ' &middot; ' + c.hours + 'h &times; $' + rate + '/hr';
      if (verifiedLabel) html += ' &middot; <span style="color:' + verifiedColor + '">' + verifiedLabel + ' &#10003;</span>';
      html += '</div></div>';
    });

    // Total and budget comparison
    html += '<div class="jd-money-card" style="border-color:var(--sw-dark);"><div class="jd-money-card-head">';
    html += '<span style="font-weight:700;">Total Labour</span>';
    html += '<strong>' + fmt$(totalLabourCost) + '</strong></div>';
    if (labourBudget > 0) {
      var labourDiff = totalLabourCost - labourBudget;
      var labourPct = Math.round(labourDiff / labourBudget * 100);
      var remaining = labourBudget - totalLabourCost;
      var labourWarnColor = labourPct > 25 ? 'var(--sw-red)' : labourPct > 10 ? 'var(--sw-orange)' : 'var(--sw-green)';
      html += '<div class="jd-money-card-sub" style="color:' + labourWarnColor + '">';
      if (remaining >= 0) {
        html += 'Remaining: ' + fmt$(remaining) + ' (' + Math.abs(labourPct) + '% used)';
      } else {
        html += 'Over budget by ' + fmt$(Math.abs(remaining)) + ' (' + labourPct + '% over)';
      }
      html += '</div>';
    }
    html += '</div></div>';
  }

  // Margin bar
  if (quoteVal > 0) {
    var costBarPct = Math.min(100, poCosts / quoteVal * 100);
    html += '<div class="jd-margin-bar-wrap">';
    html += '<div style="font-size:12px;color:var(--sw-text-sec);margin-bottom:4px;">Cost vs Quote</div>';
    html += '<div class="jd-margin-bar"><div class="jd-margin-bar-cost" style="width:' + costBarPct + '%;background:' + marginColor + '"></div>';
    html += '<span class="jd-margin-bar-label" style="color:' + marginColor + '">Margin: ' + marginPct + '%</span></div>';
    html += '</div>';
  }

  document.getElementById('jdMoney').innerHTML = html;
}

// ── Build View ──

function renderBuildView(data) {
  var j = data.job;
  var html = '';

  // Miscellaneous jobs: show description + line items instead of scope tool
  if (j.type === 'miscellaneous' && j.pricing_json && j.pricing_json.source === 'quick_quote') {
    var pj = j.pricing_json;
    html += '<div style="font-size:14px;font-weight:700;margin-bottom:8px;">Job Details</div>';
    if (pj.job_type_label) html += '<div style="margin-bottom:4px;"><strong>Type:</strong> ' + escapeHtml(pj.job_type_label) + '</div>';
    if (pj.job_description) html += '<div style="margin-bottom:8px;white-space:pre-wrap;font-size:13px;">' + escapeHtml(pj.job_description) + '</div>';
    if (pj.reference) html += '<div style="margin-bottom:8px;font-size:12px;color:var(--sw-text-sec);">Ref: ' + escapeHtml(pj.reference) + '</div>';
    if (pj.line_items && pj.line_items.length > 0) {
      html += '<div style="font-size:13px;font-weight:600;margin:12px 0 6px;">Line Items</div>';
      html += '<table class="data-table" style="font-size:12px;"><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead><tbody>';
      pj.line_items.forEach(function(li) {
        html += '<tr><td>' + escapeHtml(li.description) + '</td><td>' + li.quantity + '</td><td>' + li.unit + '</td><td style="text-align:right">' + fmt$(li.unit_price) + '</td><td style="text-align:right">' + fmt$(li.total) + '</td></tr>';
      });
      html += '</tbody></table>';
      html += '<div style="text-align:right;margin-top:6px;font-size:13px;"><strong>Total inc GST: ' + fmt$(pj.totalIncGST) + '</strong></div>';
    }
    if (pj.client_notes) html += '<div style="margin-top:8px;font-size:12px;"><strong>Client Notes:</strong> ' + escapeHtml(pj.client_notes) + '</div>';
    if (pj.internal_notes) html += '<div style="margin-top:4px;font-size:12px;color:var(--sw-text-sec);"><strong>Internal:</strong> ' + escapeHtml(pj.internal_notes) + '</div>';
    document.getElementById('jdBuild').innerHTML = html;
    return;
  }

  // 3D Scope Viewer iframe (above scope summary)
  if (j.scope_json && j.type !== 'miscellaneous') {
    var viewerBaseUrl = j.type === 'fencing'
      ? 'https://marninms98-dotcom.github.io/fence-designer/'
      : 'https://marninms98-dotcom.github.io/patio/';
    var viewerJobId = j.id || '';
    if (viewerJobId) {
      html += '<div style="margin-bottom:12px;position:relative;">';
      html += '<div id="scopeViewerLoading" style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;background:var(--sw-bg-card,#f8fafc);border:1px solid #e2e8f0;border-radius:8px;z-index:1;font-size:12px;color:var(--sw-text-sec,#86868B);">';
      html += '<span>Loading 3D scope viewer...</span></div>';
      html += '<iframe src="' + viewerBaseUrl + '?jobId=' + viewerJobId + '&mode=view" ';
      html += 'style="width:100%;height:400px;border:1px solid #e2e8f0;border-radius:8px;display:block;background:#f0f0f0;" ';
      html += 'frameborder="0" allowfullscreen ';
      html += 'onload="var el=document.getElementById(\'scopeViewerLoading\');if(el)el.style.display=\'none\';">';
      html += '</iframe></div>';
    }
  }

  // Scope summary
  if (j.scope_json) {
    html += '<div style="font-size:14px;font-weight:700;margin-bottom:8px;">Scope Summary</div>';
    html += renderScopeSummary(j.scope_json, j.type, j.id);
  }

  // Site plan thumbnail (compact) in build view
  if (j.scope_json && j.type !== 'miscellaneous') {
    html += renderSitePlanPanel(j.scope_json, true);
  }

  // Work Order documents
  html += renderDocumentLinks(data.documents, ['work_order'], '&#128203; Work Orders');

  // Material Order documents
  html += renderDocumentLinks(data.documents, ['material_order', 'supplier_quote'], '&#128230; Material Documents');

  // Materials readiness
  html += '<div style="font-size:14px;font-weight:700;margin-top:16px;margin-bottom:8px;display:flex;align-items:center;gap:8px;">Materials Readiness <button class="btn btn-secondary btn-sm" onclick="closeJobDetail();openPOModal(\'' + j.id + '\')" style="font-size:10px;">+ New PO</button></div>';
  var categories = getMaterialCategories(j);
  var materialsHtml = '<div class="jd-materials-grid">';
  categories.forEach(function(cat) {
    var status = matchMaterialStatus(cat, data.purchase_orders || []);
    materialsHtml += '<div class="jd-material-card">';
    materialsHtml += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    materialsHtml += '<strong>' + cat.name + '</strong>';
    materialsHtml += '<span class="jd-material-status ' + status.status + '">' + status.status + '</span>';
    materialsHtml += '</div>';
    if (status.poNumber) {
      materialsHtml += '<div style="font-size:11px;color:var(--sw-text-sec);margin-top:4px;">' + status.poNumber + ' — ' + escapeHtml(status.supplier || '') + '</div>';
    }
    materialsHtml += '</div>';
  });
  materialsHtml += '</div>';
  html += materialsHtml;

  // PO list with expandable review cards for drafts
  if ((data.purchase_orders || []).length > 0) {
    html += '<div style="font-size:14px;font-weight:700;margin-top:16px;margin-bottom:8px;">Purchase Orders (' + data.purchase_orders.length + ')</div>';
    data.purchase_orders.forEach(function(po) {
      if (po.status === 'draft') {
        // Draft PO — expandable review card
        var poType = 'Purchase Order';
        var isCommission = false;
        if (po.notes) {
          if (po.notes.indexOf('MATERIALS') !== -1) poType = 'Materials PO';
          else if (po.notes.indexOf('LABOUR') !== -1) poType = 'Labour PO';
          if (po.notes.indexOf('SALES COMMISSION') !== -1 || po.notes.indexOf('Commission') !== -1) {
            poType = 'Commission PO';
            isCommission = true;
          }
        }

        var items = [];
        try { items = typeof po.line_items === 'string' ? JSON.parse(po.line_items) : (po.line_items || []); } catch(e) {}
        var subtotal = items.reduce(function(sum, item) { return sum + (item.quantity || 1) * (item.unit_price || 0); }, 0);

        html += '<div class="po-review-card" id="poCard' + po.id + '" data-supplier="' + escapeHtml(po.supplier_name || '') + '">';
        html += '<div class="po-review-header" onclick="togglePOCard(\'' + po.id + '\')">';
        html += '<div style="display:flex;align-items:center;gap:8px;flex:1;flex-wrap:wrap">';
        html += '<span style="font-weight:600">' + poType + '</span>';
        html += '<span class="status-badge draft" style="font-size:11px">Draft</span>';
        html += po.supplier_name ? '<span class="status-badge" style="font-size:11px;background:rgba(52,152,219,0.1);color:var(--sw-blue);">' + escapeHtml(po.supplier_name) + '</span>' : '<span class="status-badge" style="font-size:11px;background:#F15A29;color:#fff">Needs Supplier</span>';
        if (po.po_number) html += '<span style="font-size:11px;color:var(--sw-text-sec)">' + po.po_number + '</span>';
        html += '</div>';
        html += '<span style="font-weight:600;font-family:var(--sw-font-num);">$' + subtotal.toFixed(2) + '</span>';
        html += '<span class="po-card-chevron" id="poChevron' + po.id + '">&#9660;</span>';
        html += '</div>';

        // Expandable body (hidden by default)
        html += '<div class="po-review-body" id="poBody' + po.id + '" style="display:none">';

        // Line items table
        html += '<div style="overflow-x:auto">';
        html += '<table class="po-items-table"><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>';
        items.forEach(function(item) {
          var lineTotal = (item.quantity || 1) * (item.unit_price || 0);
          html += '<tr><td>' + escapeHtml(item.description || '') + '</td><td>' + (item.quantity || 1) + '</td><td>' + (item.unit || 'ea') + '</td><td>$' + (item.unit_price || 0).toFixed(2) + '</td><td>$' + lineTotal.toFixed(2) + '</td></tr>';
        });
        html += '<tr class="po-subtotal-row"><td colspan="4" style="text-align:right;font-weight:600">Subtotal</td><td style="font-weight:600">$' + subtotal.toFixed(2) + '</td></tr>';
        html += '</tbody></table>';
        html += '</div>';

        // Inline supplier picker + actions
        html += '<div class="po-review-actions">';
        html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
        html += '<select id="poSupplierPick' + po.id + '" class="form-input" style="max-width:220px;font-size:13px;padding:6px 8px"><option value="">Select supplier...</option></select>';
        if (poType === 'Materials PO') {
          html += '<input type="date" id="poDeliveryPick' + po.id + '" class="form-input" style="max-width:160px;font-size:13px;padding:6px 8px" placeholder="Delivery date">';
        }
        html += '</div>';

        // Action buttons
        html += '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">';
        if (!isCommission) {
          html += '<button class="btn btn-sm btn-primary" onclick="quickApprovePO(\'' + po.id + '\', false)">Approve as Draft in Xero</button>';
          html += '<button class="btn btn-sm btn-success" onclick="approveAndComposePO(\'' + po.id + '\')">Approve &amp; Send to Supplier</button>';
        }
        html += '<button class="btn btn-sm btn-outline" onclick="openPOEdit(\'' + po.id + '\')">Edit Full PO</button>';
        html += '</div>';
        html += '</div>';  // po-review-actions
        html += '</div>';  // po-review-body
        html += '</div>';  // po-review-card
      } else {
        // Non-draft POs — standard one-line rendering
        html += '<div style="padding:8px 0;border-bottom:1px solid var(--sw-border);font-size:13px;display:flex;align-items:center;gap:8px;">';
        html += '<div style="flex:1;">';
        html += '<strong>' + (po.po_number || '') + '</strong> — ' + escapeHtml(po.supplier_name || '') + ' ';
        html += '<span class="status-badge ' + (po.status || '') + '">' + (po.status || '') + '</span> ';
        html += '<span style="color:var(--sw-green);font-family:var(--sw-font-num);">' + fmt$(po.total) + '</span>';
        html += '</div>';
        html += '<button onclick="openPOEmailCompose(\'' + po.id + '\')" style="font-size:10px;padding:3px 8px;border:1px solid var(--sw-border);border-radius:4px;background:var(--sw-card);cursor:pointer;color:var(--sw-text-sec);white-space:nowrap;">&#9993; Email Supplier</button>';
        html += '<button onclick="openPOEdit(\'' + po.id + '\')" style="font-size:10px;padding:3px 8px;border:1px solid var(--sw-border);border-radius:4px;background:var(--sw-card);cursor:pointer;color:var(--sw-text-sec);">Edit</button>';
        html += '</div>';
      }
    });
  }

  // Assignments
  html += '<div style="font-size:14px;font-weight:700;margin-top:16px;margin-bottom:8px;display:flex;align-items:center;gap:8px;">Crew Assignments (' + (data.assignments || []).length + ') <button class="btn btn-secondary btn-sm" onclick="openActionSheet(\'Assign\')" style="font-size:10px;">+ Assign Crew</button></div>';
  if ((data.assignments || []).length > 0) {
    data.assignments.forEach(function(a) {
      html += '<div style="padding:8px 0;border-bottom:1px solid var(--sw-border);font-size:13px;display:flex;align-items:center;gap:8px;">';
      html += '<div style="flex:1;">';
      html += '<strong>' + fmtDate(a.scheduled_date) + '</strong>';
      if (a.scheduled_end) html += ' — ' + fmtDate(a.scheduled_end);
      if (a.users?.name) html += ' &middot; ' + a.users.name;
      if (a.crew_name) html += ' (' + cleanCrewName(a.crew_name) + ')';
      html += ' <span class="status-badge ' + a.status + '">' + a.status + '</span>';
      html += '</div>';
      if (a.status !== 'complete' && a.status !== 'cancelled') {
        html += '<button class="btn btn-secondary btn-sm" style="font-size:11px;padding:3px 8px;" onclick="markAssignmentComplete(\'' + a.id + '\',\'' + j.id + '\')">&#9989;</button>';
      }
      html += '</div>';
    });
  } else {
    html += '<div style="font-size:12px;color:var(--sw-text-sec);">No assignments yet</div>';
  }

  // Work Orders
  if ((data.work_orders || []).length > 0) {
    html += '<div style="font-size:14px;font-weight:700;margin-top:16px;margin-bottom:8px;">Work Orders (' + data.work_orders.length + ')</div>';
    data.work_orders.forEach(function(wo) {
      html += '<div style="padding:6px 0;border-bottom:1px solid var(--sw-border);font-size:13px;">';
      html += '<strong>' + (wo.wo_number || '') + '</strong>';
      if (wo.trade_name) html += ' — ' + wo.trade_name;
      html += ' <span class="status-badge ' + wo.status + '">' + wo.status + '</span>';
      html += '</div>';
    });
  }

  // Labour Reconciliation placeholder — loads async
  html += '<div id="jdLabourRecon" style="margin-top:16px;"></div>';

  document.getElementById('jdBuild').innerHTML = html;

  // Load labour reconciliation data
  loadLabourReconciliation(j.id);
}

async function loadLabourReconciliation(jobId) {
  var container = document.getElementById('jdLabourRecon');
  if (!container) return;
  try {
    var data = await opsFetch('labour_reconciliation', { job_id: jobId });
    var recon = data.reconciliation || data;
    var budget = recon.labour_budget || 0;
    var hoursLogged = recon.hours_logged || 0;
    var labourCost = recon.labour_cost || 0;
    var remainder = budget - labourCost;
    var trades = recon.trades || [];

    var html = '<div style="font-size:14px;font-weight:700;margin-bottom:8px;">Labour Reconciliation</div>';

    // Summary cards row
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:12px;">';
    html += '<div style="background:var(--sw-card);border:1px solid var(--sw-border);border-radius:8px;padding:10px;text-align:center;">';
    html += '<div style="font-size:11px;color:var(--sw-text-sec);">Labour Budget</div>';
    html += '<div style="font-size:16px;font-weight:700;font-family:var(--sw-font-num);color:var(--sw-mid);">' + fmt$(budget) + '</div></div>';
    html += '<div style="background:var(--sw-card);border:1px solid var(--sw-border);border-radius:8px;padding:10px;text-align:center;">';
    html += '<div style="font-size:11px;color:var(--sw-text-sec);">Hours Logged</div>';
    html += '<div style="font-size:16px;font-weight:700;font-family:var(--sw-font-num);">' + hoursLogged.toFixed(1) + 'h</div></div>';
    html += '<div style="background:var(--sw-card);border:1px solid var(--sw-border);border-radius:8px;padding:10px;text-align:center;">';
    html += '<div style="font-size:11px;color:var(--sw-text-sec);">Labour Cost</div>';
    html += '<div style="font-size:16px;font-weight:700;font-family:var(--sw-font-num);color:var(--sw-red);">' + fmt$(labourCost) + '</div></div>';
    html += '<div style="background:var(--sw-card);border:1px solid var(--sw-border);border-radius:8px;padding:10px;text-align:center;">';
    html += '<div style="font-size:11px;color:var(--sw-text-sec);">Remainder</div>';
    html += '<div style="font-size:16px;font-weight:700;font-family:var(--sw-font-num);color:' + (remainder >= 0 ? 'var(--sw-green)' : 'var(--sw-red)') + ';">' + fmt$(remainder) + '</div></div>';
    html += '</div>';

    // Trades table
    if (trades.length > 0) {
      html += '<table class="data-table" style="font-size:12px;width:100%;"><thead><tr><th>Trade</th><th style="text-align:right">Hours</th><th style="text-align:right">Rate</th><th style="text-align:right">Cost</th></tr></thead><tbody>';
      trades.forEach(function(t) {
        html += '<tr><td>' + escapeHtml(t.name || '') + '</td>';
        html += '<td style="text-align:right;font-family:var(--sw-font-num);">' + (t.hours || 0).toFixed(1) + '</td>';
        html += '<td style="text-align:right;font-family:var(--sw-font-num);">' + fmt$(t.rate || 0) + '/h</td>';
        html += '<td style="text-align:right;font-family:var(--sw-font-num);">' + fmt$(t.cost || 0) + '</td></tr>';
      });
      html += '</tbody></table>';
    } else if (budget === 0 && hoursLogged === 0) {
      html += '<div style="font-size:12px;color:var(--sw-text-sec);">No labour data recorded yet</div>';
    }

    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<div style="font-size:12px;color:var(--sw-text-sec);">Labour data unavailable</div>';
    console.error('Labour reconciliation error:', e);
  }
}

function getMaterialCategories(job) {
  var scope = job.scope_json;
  if (typeof scope === 'string') { try { scope = JSON.parse(scope); } catch(e) { scope = null; } }
  if (!scope) return [];

  if (job.type === 'fencing') {
    var cats = [];
    cats.push({ name: 'Panels & Posts', keywords: ['panel', 'sheet', 'post', 'rail'] });
    if (scope.sections && scope.sections.some(function(s) { return s.retaining; })) {
      cats.push({ name: 'Plinths / Sleepers', keywords: ['plinth', 'sleeper'] });
    }
    if (scope.gates && scope.gates.length > 0) {
      cats.push({ name: 'Gate Kits', keywords: ['gate'] });
    }
    cats.push({ name: 'Concrete', keywords: ['concrete', 'footing', 'boral'] });
    cats.push({ name: 'Fixings', keywords: ['fixing', 'screw', 'bracket', 'rivet'] });
    return cats;
  }

  // Patio/Decking
  var config = scope.config || scope;
  var cats = [];
  if (config.roofing || config.panel_type) {
    cats.push({ name: 'Roofing Panels', keywords: ['panel', 'solarspan', 'trimdek', 'spandek', 'corrugated'] });
  }
  cats.push({ name: 'Steel (Beams + Posts)', keywords: ['beam', 'post', 'shs', 'steel'] });
  cats.push({ name: 'Flashings', keywords: ['flash'] });
  cats.push({ name: 'Footings (Concrete)', keywords: ['concrete', 'footing', 'boral'] });
  if (config.gutters) {
    cats.push({ name: 'Gutters / Downpipes', keywords: ['gutter', 'downpipe'] });
  }
  return cats;
}

function matchMaterialStatus(category, purchaseOrders) {
  var matchedPO = null;
  purchaseOrders.forEach(function(po) {
    if (matchedPO) return;
    var items = po.line_items || [];
    if (typeof items === 'string') { try { items = JSON.parse(items); } catch(e) { items = []; } }
    var poDesc = ((po.supplier_name || '') + ' ' + items.map(function(i) { return i.description || i.name || ''; }).join(' ')).toLowerCase();
    var matched = category.keywords.some(function(kw) { return poDesc.indexOf(kw) >= 0; });
    if (matched) matchedPO = po;
  });

  if (!matchedPO) return { status: 'missing' };
  var s = (matchedPO.status || '').toLowerCase();
  if (s === 'billed') return { status: 'delivered', poNumber: matchedPO.po_number, supplier: matchedPO.supplier_name };
  if (s === 'submitted' || s === 'authorised') return { status: 'ordered', poNumber: matchedPO.po_number, supplier: matchedPO.supplier_name };
  return { status: 'draft', poNumber: matchedPO.po_number, supplier: matchedPO.supplier_name };
}

// ── Files View ──

function renderFilesView(data) {
  var j = data.job;
  var html = '';

  // ── Readiness Checklist (from backend) ──
  var readiness = data.readiness;
  if (readiness) {
    var statusColors = { blocked: '#EF4444', at_risk: '#F59E0B', ready: '#22C55E' };
    var statusLabels = { blocked: 'Blocked', at_risk: 'At Risk', ready: 'Ready' };
    var statusIcons = { blocked: '&#128308;', at_risk: '&#128992;', ready: '&#128994;' };

    html += '<div style="margin-bottom:16px;padding:12px;background:var(--sw-light);border-radius:8px;border-left:3px solid ' + (statusColors[readiness.status] || '#6B7280') + '">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
    html += '<div style="font-size:14px;font-weight:700">Job Readiness</div>';
    html += '<div style="font-size:12px;font-weight:700;color:' + (statusColors[readiness.status] || '#6B7280') + '">' + statusIcons[readiness.status] + ' ' + (statusLabels[readiness.status] || readiness.status) + ' &middot; ' + readiness.score + '%</div>';
    html += '</div>';

    // Show all items grouped by severity
    var allItems = [].concat(readiness.blockers || [], readiness.warnings || [], readiness.completeness || []);
    allItems.forEach(function(item) {
      var icon = item.met ? '&#9989;' : (item.severity === 'blocker' ? '&#128308;' : item.severity === 'warning' ? '&#128992;' : '&#9898;');
      var textStyle = item.met ? 'color:var(--sw-text-sec);' : (item.severity === 'blocker' ? 'color:#EF4444;font-weight:600;' : item.severity === 'warning' ? 'color:#D97706;' : 'color:var(--sw-text-sec);');
      html += '<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;' + textStyle + '">';
      html += '<span>' + icon + '</span>';
      html += '<span' + (item.met ? ' style="text-decoration:line-through;opacity:0.6"' : '') + '>' + escapeHtml(item.label) + '</span>';
      if (!item.met && item.severity !== 'optional') {
        html += '<span style="font-size:10px;text-transform:uppercase;letter-spacing:0.3px;opacity:0.7">' + item.severity + '</span>';
      }
      html += '</div>';
    });
    html += '</div>';
  }

  // Photos
  var jobPhotos = (data.media || []).filter(function(m) { return m.phase !== 'receipt'; });
  var receiptPhotos = (data.media || []).filter(function(m) { return m.phase === 'receipt'; });

  if (jobPhotos.length > 0) {
    html += '<div style="font-size:14px;font-weight:700;margin-bottom:8px;">Photos (' + jobPhotos.length + ')</div>';
    html += '<div class="jd-photo-grid">';
    jobPhotos.forEach(function(m) {
      var src = m.thumbnail_url || m.storage_url;
      html += '<div class="jd-photo-item">';
      html += '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(m.label || m.phase || '') + '" onclick="window.open(\'' + escapeHtml(m.storage_url) + '\',\'_blank\')">';
      if (m.phase) html += '<span class="jd-photo-phase">' + m.phase + '</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Receipts
  if (receiptPhotos.length > 0) {
    var poLookup = {};
    (data.purchase_orders || []).forEach(function(po) { poLookup[po.id] = po.po_number; });
    html += '<div style="font-size:14px;font-weight:700;margin-top:16px;margin-bottom:8px;">Receipts (' + receiptPhotos.length + ')</div>';
    html += '<div class="jd-photo-grid">';
    receiptPhotos.forEach(function(m) {
      var src = m.thumbnail_url || m.storage_url;
      var poLabel = m.po_id && poLookup[m.po_id] ? poLookup[m.po_id] : 'No PO';
      html += '<div class="jd-photo-item">';
      html += '<img src="' + escapeHtml(src) + '" alt="Receipt" onclick="window.open(\'' + escapeHtml(m.storage_url) + '\',\'_blank\')">';
      html += '<span class="jd-photo-phase">' + poLabel + '</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  // ── Upload Documents ──
  html += '<div style="margin-top:16px;margin-bottom:16px">';
  html += '<div style="font-size:14px;font-weight:700;margin-bottom:8px">Upload Files</div>';
  html += '<div id="jdUploadArea" style="border:2px dashed var(--sw-border);border-radius:10px;padding:20px;text-align:center;cursor:pointer;background:var(--sw-light);transition:border-color 0.2s" onclick="document.getElementById(\'jdFileInput\').click()" ondragover="event.preventDefault();this.style.borderColor=\'var(--sw-orange)\'" ondragleave="this.style.borderColor=\'var(--sw-border)\'" ondrop="event.preventDefault();this.style.borderColor=\'var(--sw-border)\';handleDocDrop(event)">';
  html += '  <div style="font-size:24px;margin-bottom:4px">&#128206;</div>';
  html += '  <div style="font-size:13px;color:var(--sw-text-sec)">Drag files here or tap to upload</div>';
  html += '  <div style="font-size:11px;color:var(--sw-text-sec);margin-top:2px">Photos, PDFs, videos</div>';
  html += '</div>';
  html += '<input type="file" id="jdFileInput" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx" style="display:none" onchange="handleDocFiles(this.files)">';
  html += '<div id="jdUploadQueue" style="margin-top:8px"></div>';
  html += '</div>';

  // Documents — with visibility controls, thumbnails, delete
  var allDocs = data.documents || [];
  if (allDocs.length > 0) {
    html += '<div style="font-size:14px;font-weight:700;margin-top:16px;margin-bottom:8px;">Documents (' + allDocs.length + ')</div>';
    allDocs.forEach(function(doc) {
      var url = doc.storage_url || doc.pdf_url;
      var name = doc.file_name || doc.type || 'Document';
      var isVisible = doc.visible_to_trades;

      // Type badge colours
      var typeColors = {
        council_plans: '#8B5CF6', engineering: '#3B82F6', work_order: '#F59E0B',
        supplier_quote: '#EF4444', site_photo: '#10B981', approval: '#6366F1',
        quote: '#F97316', general: '#6B7280', client_reference: '#0EA5E9',
        asbestos: '#DC2626', other: '#9CA3AF'
      };
      var badgeColor = typeColors[doc.type] || '#6B7280';

      // File type icon
      var fileIcon = '&#128196;'; // default doc
      if (name && /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(name)) fileIcon = '&#128247;';
      else if (name && /\.pdf$/i.test(name)) fileIcon = '&#128213;';
      else if (name && /\.(mp4|mov|avi|webm)$/i.test(name)) fileIcon = '&#127909;';
      else if (name && /\.(doc|docx)$/i.test(name)) fileIcon = '&#128462;';
      else if (name && /\.(xls|xlsx)$/i.test(name)) fileIcon = '&#128202;';

      html += '<div style="padding:8px 0;border-bottom:1px solid var(--sw-border);font-size:13px;">';
      html += '<div style="display:flex;align-items:center;gap:8px;">';

      // Thumbnail or file icon
      if (url && /\.(jpg|jpeg|png|gif|webp)$/i.test(name)) {
        html += '<img src="' + escapeHtml(url) + '" style="width:32px;height:32px;object-fit:cover;border-radius:3px;cursor:pointer;flex-shrink:0" onclick="window.open(\'' + escapeHtml(url) + '\',\'_blank\')">';
      } else {
        html += '<span style="font-size:20px;flex-shrink:0;width:32px;text-align:center">' + fileIcon + '</span>';
      }

      // Type badge
      html += '<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;padding:2px 6px;border-radius:3px;background:' + badgeColor + '20;color:' + badgeColor + ';white-space:nowrap">' + escapeHtml((doc.type || 'general').replace(/_/g, ' ')) + '</span>';

      // File name
      html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(name) + '</span>';

      // Version
      if (doc.version > 1) html += '<span style="color:var(--sw-text-sec);font-size:11px;">v' + doc.version + '</span>';

      // Visibility toggle
      html += '<button onclick="toggleDocVisibility(\'' + doc.id + '\', ' + !isVisible + ')" style="background:none;border:1px solid var(--sw-border);border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;color:' + (isVisible ? 'var(--sw-green)' : 'var(--sw-text-sec)') + ';white-space:nowrap" title="' + (isVisible ? 'Visible to trades' : 'Hidden from trades') + '">' + (isVisible ? '&#128065; Trades' : '&#128274; Hidden') + '</button>';

      // View button
      if (url) html += '<a href="' + escapeHtml(url) + '" target="_blank" class="btn btn-secondary btn-sm" style="font-size:11px;padding:2px 8px;">View</a>';

      // Delete button
      html += '<button onclick="deleteDocument(\'' + doc.id + '\',\'' + escapeHtml(name).replace(/'/g, "\\'") + '\')" style="background:none;border:none;cursor:pointer;padding:4px;font-size:14px;color:var(--sw-text-sec);opacity:0.5" title="Delete">&times;</button>';

      html += '</div>';

      // Date + uploaded by
      var metaLine = '';
      if (doc.created_at) metaLine += fmtDate(doc.created_at);
      if (doc.uploaded_by) metaLine += (metaLine ? ' &middot; ' : '') + escapeHtml(doc.uploaded_by);
      if (metaLine) {
        html += '<div style="font-size:11px;color:var(--sw-text-sec);margin-top:2px;margin-left:40px">' + metaLine + '</div>';
      }
      html += '</div>';
    });
  }

  // Notes
  html += '<div style="font-size:14px;font-weight:700;margin-top:16px;margin-bottom:8px;">Notes</div>';
  var noteEvents = (data.events || []).filter(function(ev) { return ev.event_type === 'note_added'; });
  if (noteEvents.length > 0) {
    html += '<div class="jd-notes-feed">';
    noteEvents.forEach(function(ev) {
      html += '<div class="jd-note-item">';
      html += '<div style="font-size:11px;color:var(--sw-text-sec);">' + (ev.users?.name || '') + ' &middot; ' + new Date(ev.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + '</div>';
      html += '<div>' + escapeHtml(ev.detail_json?.note || ev.detail_json?.text || JSON.stringify(ev.detail_json || '')) + '</div>';
      html += '</div>';
    });
    html += '</div>';
  } else {
    html += '<div style="font-size:12px;color:var(--sw-text-sec);">No notes yet</div>';
  }

  // Note input
  html += '<div class="jd-note-input-wrap">';
  html += '<textarea class="jd-note-input" id="jdNoteInput" placeholder="Add a note..."></textarea>';
  html += '<button class="btn btn-primary btn-sm" onclick="submitJobNote()">Add</button>';
  html += '</div>';

  if (!readiness && jobPhotos.length === 0 && receiptPhotos.length === 0 && (data.documents || []).length === 0 && noteEvents.length === 0) {
    html = '<div class="empty-state"><div class="empty-state-icon">&#128247;</div><div class="empty-state-text">No files or notes yet</div></div>' + html.slice(html.lastIndexOf('<div class="jd-note-input-wrap">'));
  }

  document.getElementById('jdFiles').innerHTML = html;
}

window.handleDocDrop = function(e) {
  var files = e.dataTransfer.files;
  if (files.length > 0) handleDocFiles(files);
};

window.handleDocFiles = function(files) {
  if (!_currentJobData || !_currentJobData.job) return;
  var queue = document.getElementById('jdUploadQueue');

  Array.from(files).forEach(function(file) {
    // Auto-detect type from file name + MIME
    var docType = 'general';
    var fname = file.name.toLowerCase();
    var fmime = (file.type || '').toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|heic)$/i.test(fname) || fmime.startsWith('image/')) docType = 'site_photo';
    else if (/council|permit|approval/i.test(fname)) docType = 'council_plans';
    else if (/engineer|structural|cert/i.test(fname)) docType = 'engineering';
    else if (/quote|supplier/i.test(fname)) docType = 'supplier_quote';
    else if (/work.?order|wo\b/i.test(fname)) docType = 'work_order';
    else if (/asbestos|hazmat/i.test(fname)) docType = 'asbestos';
    else if (/reference|client.?ref/i.test(fname)) docType = 'client_reference';

    // Show upload row with type selector
    var rowId = 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
    var rowHtml = '<div id="' + rowId + '" style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--sw-border);font-size:12px">';
    rowHtml += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(file.name) + '</span>';
    rowHtml += '<select id="' + rowId + '_type" style="font-size:11px;padding:2px 4px;border:1px solid var(--sw-border);border-radius:4px">';
    ['site_photo','council_plans','engineering','supplier_quote','work_order','approval','client_reference','asbestos','general','other'].forEach(function(t) {
      rowHtml += '<option value="' + t + '"' + (t === docType ? ' selected' : '') + '>' + t.replace(/_/g, ' ') + '</option>';
    });
    rowHtml += '</select>';
    rowHtml += '<label style="font-size:11px;white-space:nowrap;display:flex;align-items:center;gap:3px"><input type="checkbox" id="' + rowId + '_vis" ' + (['site_photo','council_plans','engineering','work_order','approval'].includes(docType) ? 'checked' : '') + '> Trades</label>';
    rowHtml += '<span id="' + rowId + '_status" style="font-size:11px;color:var(--sw-text-sec)">Ready</span>';
    rowHtml += '</div>';
    queue.innerHTML += rowHtml;

    // Start upload
    uploadOneDocument(file, _currentJobData.job.id, rowId);
  });
};

window.uploadOneDocument = async function(file, jobId, rowId) {
  var statusEl = document.getElementById(rowId + '_status');
  var typeEl = document.getElementById(rowId + '_type');
  var visEl = document.getElementById(rowId + '_vis');

  try {
    statusEl.textContent = 'Uploading...';
    statusEl.style.color = 'var(--sw-orange)';

    var docType = typeEl ? typeEl.value : 'general';
    var visible = visEl ? visEl.checked : false;

    // 1. Get signed upload URL
    var urlData = await opsPost('upload_document', {
      jobId: jobId,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      type: docType,
      visible_to_trades: visible,
    });

    // 2. Upload binary
    var uploadResp = await fetch(urlData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!uploadResp.ok) throw new Error('Upload failed: ' + uploadResp.status);

    // 3. Confirm upload
    await opsPost('confirm_document_upload', {
      jobId: jobId,
      publicUrl: urlData.publicUrl,
      path: urlData.path,
      fileName: file.name,
      type: docType,
      visible_to_trades: visible,
    });

    statusEl.textContent = 'Done';
    statusEl.style.color = 'var(--sw-green)';

    // Refresh files view after short delay
    setTimeout(function() {
      if (_currentJobId) {
        openJobDetail(_currentJobId);
      }
    }, 1000);

  } catch (err) {
    statusEl.textContent = 'Error: ' + (err.message || err);
    statusEl.style.color = 'var(--sw-red, #EF4444)';
  }
};

window.toggleDocVisibility = async function(docId, newValue) {
  try {
    await opsPost('toggle_document_visibility', { documentId: docId, visible_to_trades: newValue });
    // Refresh
    if (_currentJobId) openJobDetail(_currentJobId);
  } catch (err) {
    alert('Error: ' + (err.message || err));
  }
};

window.deleteDocument = async function(docId, fileName) {
  if (!confirm('Delete "' + fileName + '"? This cannot be undone.')) return;
  try {
    await opsPost('delete_document', { documentId: docId });
    if (_currentJobId) openJobDetail(_currentJobId);
  } catch (err) {
    alert('Error: ' + (err.message || err));
  }
};

async function submitJobNote() {
  var input = document.getElementById('jdNoteInput');
  var text = input.value.trim();
  if (!text || !_currentJobId) return;

  try {
    await opsPost('add_event', {
      job_id: _currentJobId,
      event_type: 'note_added',
      detail_json: { note: text }
    });
    input.value = '';
    showToast('Note added', 'success');
    refreshJobDetail();
  } catch(e) {
    showToast('Error: ' + e.message, 'warning');
  }
}

// ── Action Drawer (Zone 3) ──

function renderActionDrawer(data) {
  var j = data.job;
  var html = '';
  html += '<button class="jd-drawer-btn" onclick="openActionSheet(\'PO\')"><span class="icon">&#128230;</span> +PO</button>';
  html += '<button class="jd-drawer-btn" onclick="openActionSheet(\'Invoice\')"><span class="icon">&#128179;</span> +Invoice</button>';
  if (j.type === 'miscellaneous') {
    html += '<button class="jd-drawer-btn" style="border-color:#8E44AD;color:#8E44AD;" onclick="closeJobDetail();openQuickQuote()"><span class="icon">&#9889;</span> Quick Quote</button>';
  }
  html += '<button class="jd-drawer-btn" onclick="openActionSheet(\'Assign\')"><span class="icon">&#128197;</span> +Assign</button>';
  html += '<button class="jd-drawer-btn" onclick="openActionSheet(\'Note\')"><span class="icon">&#128221;</span> +Note</button>';
  if (j.client_phone) {
    html += '<button class="jd-drawer-btn" onclick="showJobSubView(\'comms\')"><span class="icon">&#128172;</span> SMS</button>';
  }
  // Status change buttons
  var nextStatuses = getNextStatuses(j.status);
  nextStatuses.forEach(function(s) {
    var bgColor = s === 'cancelled' ? 'var(--sw-red)' : 'var(--sw-orange)';
    html += '<button class="jd-drawer-btn" style="border-color:' + bgColor + ';color:' + bgColor + ';" onclick="changeJobStatus(\'' + j.id + '\',\'' + s + '\')">' + (STATUS_LABELS[s] || s) + '</button>';
  });
  document.getElementById('jdDrawer').innerHTML = html;
}

// ── Action Sheets ──

function openActionSheet(type) {
  document.getElementById('jdSheetBackdrop').classList.add('open');
  var sheet = document.getElementById('jdSheet' + type);
  if (!sheet) return;

  // Populate sheet body
  var bodyEl = document.getElementById('jdSheet' + type + 'Body');
  if (type === 'PO') {
    bodyEl.innerHTML = '<p style="font-size:13px;color:var(--sw-text-sec);margin-bottom:12px;">This will open the PO creation form with the job pre-selected.</p>' +
      '<button class="btn btn-primary" onclick="closeActionSheet(); closeJobDetail(); openPOModal(\'' + _currentJobId + '\')">Open PO Form</button>';
  } else if (type === 'Invoice') {
    bodyEl.innerHTML = '<p style="font-size:13px;color:var(--sw-text-sec);margin-bottom:12px;">Create an invoice for this job.</p>' +
      '<button class="btn btn-primary" onclick="closeActionSheet(); closeJobDetail(); openUnifiedInvoiceModal(\'' + _currentJobId + '\')">Create Invoice</button>';
  } else if (type === 'Assign') {
    bodyEl.innerHTML = '<p style="font-size:13px;color:var(--sw-text-sec);margin-bottom:12px;">Schedule a crew assignment for this job.</p>' +
      '<button class="btn btn-primary" onclick="closeActionSheet(); closeJobDetail(); openAssignmentModalForJob(\'' + _currentJobId + '\')">Open Assignment Form</button>';
  } else if (type === 'Note') {
    bodyEl.innerHTML = '<textarea id="jdSheetNoteText" class="form-textarea" style="width:100%;min-height:80px;" placeholder="Type your note..."></textarea>' +
      '<div style="margin-top:12px;"><button class="btn btn-primary" onclick="submitSheetNote()">Save Note</button></div>';
  } else if (type === 'SMS') {
    var phone = _currentJobData?.job?.client_phone || '';
    var name = _currentJobData?.job?.client_name || 'there';
    bodyEl.innerHTML = '<div style="margin-bottom:12px;">' +
      '<div style="font-size:12px;font-weight:600;margin-bottom:4px;">Quick Templates</div>' +
      '<button class="btn btn-secondary btn-sm" style="margin:2px;" onclick="setSMSTemplate(\'Hi ' + escapeHtml(name) + ', just confirming your appointment tomorrow. Please let us know if anything changes. Thanks, SecureWorks WA\')">Confirm Appointment</button>' +
      '<button class="btn btn-secondary btn-sm" style="margin:2px;" onclick="setSMSTemplate(\'Hi ' + escapeHtml(name) + ', your materials have arrived and we are on track for the scheduled date. Thanks, SecureWorks WA\')">Materials Arrived</button>' +
      '<button class="btn btn-secondary btn-sm" style="margin:2px;" onclick="setSMSTemplate(\'Hi ' + escapeHtml(name) + ', just following up on the quote we sent. Happy to answer any questions. Thanks, SecureWorks WA\')">Quote Follow Up</button>' +
      '</div>' +
      '<textarea id="jdSheetSMSText" class="form-textarea" style="width:100%;min-height:60px;" placeholder="Type your message..."></textarea>' +
      '<div style="margin-top:12px;"><a href="sms:' + phone + '" id="jdSMSLink" class="btn btn-primary" style="text-decoration:none;display:inline-block;">Send via SMS App</a></div>';
  }

  setTimeout(function() { sheet.classList.add('open'); }, 10);
}

function closeActionSheet() {
  document.getElementById('jdSheetBackdrop').classList.remove('open');
  document.querySelectorAll('.jd-sheet').forEach(function(s) { s.classList.remove('open'); });
}

function setSMSTemplate(text) {
  var ta = document.getElementById('jdSheetSMSText');
  if (ta) ta.value = text;
  // Update SMS link with body
  var link = document.getElementById('jdSMSLink');
  var phone = _currentJobData?.job?.client_phone || '';
  if (link) link.href = 'sms:' + phone + '?body=' + encodeURIComponent(text);
}

async function submitSheetNote() {
  var ta = document.getElementById('jdSheetNoteText');
  var text = ta ? ta.value.trim() : '';
  if (!text || !_currentJobId) return;
  try {
    await opsPost('add_event', {
      job_id: _currentJobId,
      event_type: 'note_added',
      detail_json: { note: text }
    });
    showToast('Note added', 'success');
    closeActionSheet();
    refreshJobDetail();
  } catch(e) {
    showToast('Error: ' + e.message, 'warning');
  }
}

// Helper to open assignment modal pre-filled for a specific job
function openAssignmentModalForJob(jobId) {
  openAssignmentModal();
  // Pre-select the job after modal opens
  setTimeout(function() {
    var sel = document.getElementById('assignJobSelect');
    if (sel) sel.value = jobId;
  }, 300);
}

// ── Quick-View Popup (Kanban card click) ──

async function openJobQuickView(jobId) {
  var overlay = document.getElementById('jdQuickviewOverlay');
  overlay.classList.add('open');
  document.getElementById('jdQvTitle').innerHTML = '<strong style="font-size:15px;">Loading...</strong>';
  document.getElementById('jdQvBody').innerHTML = '<div class="loading">Loading...</div>';
  document.getElementById('jdQvFooter').innerHTML = '';

  try {
    var data = await opsFetch('job_detail', { jobId: jobId });
    var j = data.job;

    // Title
    document.getElementById('jdQvTitle').innerHTML = '<div><strong style="font-size:15px;">' + escapeHtml(j.client_name || 'Unknown') + '</strong>' +
      '<div style="font-size:12px;color:var(--sw-text-sec);">' + (j.job_number || '') + ' &middot; ' + escapeHtml(j.site_suburb || '') + '</div></div>';

    // Body
    var html = '';
    html += '<div class="jd-qv-row"><span class="jd-qv-label">Type</span><span class="type-badge ' + j.type + '">' + typeBadgeLabel(j.type) + '</span></div>';
    html += '<div class="jd-qv-row"><span class="jd-qv-label">Status</span><span class="status-badge ' + j.status + '">' + (STATUS_LABELS[j.status] || j.status) + '</span></div>';

    var quoteVal = j.pricing_json?.totalIncGST || j.pricing_json?.total || 0;
    if (quoteVal) html += '<div class="jd-qv-row"><span class="jd-qv-label">Quote</span><strong style="color:var(--sw-green)">' + fmt$(quoteVal) + '</strong></div>';

    if (j.site_address) html += '<div class="jd-qv-row"><span class="jd-qv-label">Address</span><span style="font-size:12px">' + escapeHtml(j.site_address) + '</span></div>';
    if (j.client_phone) html += '<div class="jd-qv-row"><span class="jd-qv-label">Phone</span><a href="tel:' + j.client_phone + '">' + j.client_phone + '</a></div>';

    // Quick stats
    html += '<div style="display:flex;gap:12px;margin-top:12px;padding-top:8px;border-top:1px solid var(--sw-border);font-size:12px;color:var(--sw-text-sec);">';
    html += '<span>' + (data.assignments || []).length + ' assignments</span>';
    html += '<span>' + (data.purchase_orders || []).length + ' POs</span>';
    html += '<span>' + (data.work_orders || []).length + ' WOs</span>';
    html += '</div>';

    // Alerts preview
    var alerts = evaluateJobAlerts(data);
    if (alerts.length > 0) {
      html += '<div style="margin-top:8px;">';
      alerts.slice(0, 3).forEach(function(a) {
        html += '<div class="jd-alert ' + a.level + '" style="margin-bottom:4px;">' + a.icon + ' ' + a.message + '</div>';
      });
      html += '</div>';
    }

    document.getElementById('jdQvBody').innerHTML = html;

    // Footer
    var footerHtml = '';
    // Quick action buttons
    var nextStatuses = getNextStatuses(j.status);
    nextStatuses.forEach(function(s) {
      footerHtml += '<button class="btn btn-secondary btn-sm" onclick="closeQuickView();changeJobStatus(\'' + j.id + '\',\'' + s + '\')">' + (STATUS_LABELS[s] || s) + '</button>';
    });
    footerHtml += '<button class="btn btn-primary btn-sm" onclick="closeQuickView();openJobDetail(\'' + j.id + '\')">Open Full Record</button>';
    document.getElementById('jdQvFooter').innerHTML = footerHtml;

  } catch(e) {
    document.getElementById('jdQvBody').innerHTML = '<div style="color:var(--sw-red);">Error: ' + e.message + '</div>';
  }
}

function closeQuickView() {
  document.getElementById('jdQuickviewOverlay').classList.remove('open');
}

function getNextStatuses(current) {
  var transitions = {
    'quoted': ['accepted', 'cancelled'],
    'accepted': ['scheduled'],
    'scheduled': ['in_progress', 'cancelled'],
    'in_progress': ['complete', 'cancelled'],
    'complete': ['invoiced'],
    'invoiced': [],
  };
  return transitions[current] || [];
}

async function changeJobStatus(jobId, status) {
  // Feature 4: If moving to "complete", offer cascade modal instead
  if (status === 'complete') {
    openCascadeModal(jobId);
    return;
  }
  // Acceptance review gate — verify client data before accepting
  if (status === 'accepted') {
    openAcceptModal(jobId);
    return;
  }
  try {
    await opsPost('update_job_status', { jobId: jobId, status: status });
    // Refresh whichever view is open
    if (document.getElementById('jobDetailView').classList.contains('active')) {
      refreshJobDetail();
    } else {
      openJobPeek(jobId);
    }
    refreshActiveView();
  } catch (e) {
    alert('Failed to update status: ' + e.message);
  }
}

async function markJobLost(jobId) {
  // Capture lost reason for AI conversion intelligence
  var reasons = ['Too expensive', 'Wrong timing', 'Chose competitor', 'Project cancelled', 'No response', 'Other'];
  var reasonHtml = reasons.map(function(r, i) { return (i + 1) + '. ' + r; }).join('\n');
  var choice = prompt('Why was this job lost?\n\n' + reasonHtml + '\n\nEnter number (1-6) or type a reason:');
  if (choice === null) return; // cancelled
  var lostReason = '';
  var num = parseInt(choice);
  if (num >= 1 && num <= reasons.length) {
    lostReason = reasons[num - 1];
  } else {
    lostReason = choice.trim() || 'Not specified';
  }
  try {
    await opsPost('update_job_status', { jobId: jobId, status: 'lost', lost_reason: lostReason });
    closeSlidePanel();
    showToast('Job marked as lost — ' + lostReason, 'info');
    refreshActiveView();
  } catch (e) {
    alert('Failed to mark job as lost: ' + e.message);
  }
}

function refreshActiveView() {
  var activeView = document.querySelector('.view.active');
  if (activeView) {
    var id = activeView.id.replace('view', '').toLowerCase();
    if (id === 'today') loadToday();
    if (id === 'jobs') loadJobs();
    if (id === 'calendar') loadCalendar();
  }
}

