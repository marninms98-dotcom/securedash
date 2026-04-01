// ════════════════════════════════════════════════════════════
// JOBS TAB
// ════════════════════════════════════════════════════════════

async function loadJobs() {
  try {
    var params = {};
    if (_jobFilter !== 'all') params.type = _jobFilter;
    if (_jobSearch) params.search = _jobSearch;

    var data = await opsFetch('pipeline', params);
    _pipelineData = data;
    renderJobs(data);
  } catch (e) {
    console.error('loadJobs error:', e);
  }
}

function setJobView(view) {
  _jobView = view;
  document.getElementById('btnKanban').style.fontWeight = view === 'kanban' ? '700' : '400';
  document.getElementById('btnListView').style.fontWeight = view === 'list' ? '700' : '400';
  if (_pipelineData) renderJobs(_pipelineData);
}

function filterJobs(type) {
  _jobFilter = type;
  document.querySelectorAll('[data-filter]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.filter === type);
  });
  loadJobs();
}

function searchJobs(q) {
  _jobSearch = q;
  clearTimeout(window._jobSearchTimer);
  window._jobSearchTimer = setTimeout(function() { loadJobs(); }, 300);
}

function toggleDrafts() {
  _showDrafts = !_showDrafts;
  var btn = document.getElementById('btnShowDrafts');
  if (btn) {
    btn.textContent = _showDrafts ? 'Hide Drafts' : 'Show Drafts';
    btn.style.opacity = _showDrafts ? '1' : '0.6';
    btn.style.fontWeight = _showDrafts ? '700' : '400';
  }
  if (_pipelineData) renderJobs(_pipelineData);
}

function renderJobs(data) {
  var container = document.getElementById('jobsBody');
  if (_jobView === 'kanban') {
    renderKanban(container, data.columns);
  } else {
    renderJobList(container, data.columns);
  }
}

// ── Sub-stage computation ──
// Returns a sub-stage label for a job based on its data, used to group cards within a column
function computeSubStage(j, status) {
  switch (status) {
    case 'quoted':
      return j.days_in_stage > 7 ? 'Following Up' : 'Quote Sent';
    case 'accepted':
      if (!j.deposit_invoice_id) return 'Create Invoice';
      if (!j.deposit_amount) return 'Awaiting Deposit';
      return 'Deposit Received';
    case 'approvals':
      if (!j.council_count) return 'Not Started';
      if (j.council_status === 'complete') return 'Approved';
      return 'Council ' + (j.council_step || 'In Progress');
    case 'processing':
      if (j.po_count === 0) return 'Order Materials';
      if (j.assignment_count === 0) return 'Materials Ordered';
      if (j.wo_count === 0) return 'Crew Assigned';
      return 'Ready to Start';
    case 'in_progress':
      return 'On Site';
    case 'complete':
      if (!j.has_invoice) return 'Needs Invoice';
      if (!j.invoice_paid) return 'Awaiting Payment';
      return 'Get Sign-off';
    default:
      return null;
  }
}

// Sub-stage ordering per column (top = earliest, bottom = most progressed)
var SUB_STAGE_ORDER = {
  quoted: ['Quote Sent', 'Following Up'],
  accepted: ['Create Invoice', 'Awaiting Deposit', 'Deposit Received'],
  approvals: null, // dynamic — sort alphabetically
  processing: ['Order Materials', 'Materials Ordered', 'Crew Assigned', 'Ready to Start'],
  in_progress: ['On Site'],
  complete: ['Needs Invoice', 'Awaiting Payment', 'Get Sign-off'],
};

function renderKanban(container, columns) {
  var order = _showDrafts
    ? ['draft', 'quoted', 'accepted', 'approvals', 'processing', 'in_progress', 'complete', 'invoiced']
    : ['quoted', 'accepted', 'approvals', 'processing', 'in_progress', 'complete', 'invoiced'];
  var html = '<div class="kanban-container">';

  order.forEach(function(status) {
    var jobs = columns[status] || [];
    html += '<div class="kanban-col" data-status="' + status + '" ondragover="kanbanDragOver(event)" ondragleave="kanbanDragLeave(event)" ondrop="kanbanDrop(event)">';
    html += '<div class="kanban-col-header">' + STATUS_LABELS[status] + '<span class="count">' + jobs.length + '</span></div>';
    html += '<div class="kanban-body">';

    if (jobs.length === 0) {
      html += '<div style="text-align:center; padding:20px; color:var(--sw-text-sec); font-size:12px;">No jobs</div>';
    } else {
      // Group jobs by sub-stage
      var groups = {};
      var groupOrder = [];
      jobs.forEach(function(j) {
        var sub = computeSubStage(j, status) || 'Other';
        if (!groups[sub]) { groups[sub] = []; groupOrder.push(sub); }
        groups[sub].push(j);
      });
      // Sort groups by defined order if available
      var definedOrder = SUB_STAGE_ORDER[status];
      if (definedOrder) {
        groupOrder.sort(function(a, b) {
          var ai = definedOrder.indexOf(a); if (ai < 0) ai = 999;
          var bi = definedOrder.indexOf(b); if (bi < 0) bi = 999;
          return ai - bi;
        });
      }
      // Render sub-stage groups
      var lastIdx = groupOrder.length - 1;
      groupOrder.forEach(function(subName, idx) {
        var subJobs = groups[subName];
        var isLast = idx === lastIdx;
        var subColor = isLast ? '#27AE60' : 'var(--sw-text-sec)';
        html += '<div class="kanban-substage-header" style="color:' + subColor + ';">';
        html += subName + ' <span class="count">' + subJobs.length + '</span></div>';
        subJobs.forEach(function(j) {
          html += renderKanbanCard(j, status);
        });
      });
    }

    html += '</div></div>';
  });

  html += '</div>';
  container.innerHTML = html;
}

function renderKanbanCard(j, status) {
  var html = '<div class="kanban-card" draggable="true" data-job-id="' + j.id + '" data-status="' + status + '" onclick="openJobQuickView(\'' + j.id + '\')" ondragstart="kanbanDragStart(event)" ondragend="kanbanDragEnd(event)">';
  html += '<div class="kanban-card-header">';
  html += '<span class="kanban-client">' + (j.client_name || 'Unknown') + '</span>';
  if (j.value) html += '<span class="kanban-value">' + fmt$(j.value) + '</span>';
  html += '</div>';
  html += '<div class="kanban-suburb">' + (j.site_suburb || '') + '</div>';
  html += '<div class="kanban-meta">';
  html += '<span class="type-badge ' + j.type + '">' + typeBadgeLabel(j.type) + '</span>';
  if (j.assignment_count > 0) html += '<span class="kanban-meta-badge">' + j.assignment_count + ' sched</span>';
  if (j.po_count > 0) html += '<span class="kanban-meta-badge">' + j.po_count + ' PO</span>';
  if (j.wo_count > 0) html += '<span class="kanban-meta-badge">' + j.wo_count + ' WO</span>';
  if (j.council_count > 0) html += '<span class="kanban-meta-badge" style="background:rgba(52,152,219,0.1);color:var(--sw-blue,#3498DB);">' + j.council_count + ' council</span>';
  // Quick quote status badge
  if (j.type === 'miscellaneous' && j.pricing_json) {
    try {
      var pjm = typeof j.pricing_json === 'string' ? JSON.parse(j.pricing_json) : j.pricing_json;
      if (pjm.source === 'quick_quote') {
        var qqs = j.status === 'invoiced' ? 'invoiced' : j.status === 'accepted' ? 'accepted' : j.quoted_at ? 'sent' : 'draft';
        var qqc = { draft: '#95A5A6', sent: '#3498DB', accepted: '#E67E22', invoiced: '#27AE60' };
        html += '<span class="kanban-meta-badge" style="background:' + (qqc[qqs] || '#999') + '20;color:' + (qqc[qqs] || '#999') + ';">Q:' + qqs + '</span>';
      }
    } catch(e) {}
  }
  // Multi-run fencing badge
  if (j.type === 'fencing' && j.pricing_json) {
    try {
      var pjk = typeof j.pricing_json === 'string' ? JSON.parse(j.pricing_json) : j.pricing_json;
      if (pjk.runs && pjk.runs.length > 1) {
        html += '<span class="kanban-meta-badge" style="background:rgba(241,90,41,0.1);color:var(--sw-orange);">' + pjk.runs.length + ' runs</span>';
      }
    } catch(e) {}
  }
  if (j.ghl_opportunity_id) html += '<a class="kanban-ghl-link" href="https://app.maxlead.com.au/v2/location/' + GHL_LOCATION_ID + '/opportunities/' + j.ghl_opportunity_id + '" target="_blank" onclick="event.stopPropagation()" title="View in GHL">&#8599;</a>';
  html += '</div>';
  var stale = j.days_in_stage > 14;
  html += '<div class="kanban-days' + (stale ? ' stale' : '') + '">' + j.days_in_stage + ' days in stage</div>';
  html += '</div>';
  return html;
}

/* ── Kanban drag-and-drop ── */
var _kanbanDragJobId = null;
var _kanbanDragFromStatus = null;

function kanbanDragAllowed(fromStatus, toStatus) {
  if (fromStatus === toStatus) return false;
  var allowed = {
    'draft': ['quoted'],
    'quoted': ['accepted', 'cancelled'],
    'accepted': ['approvals', 'processing'],
    'approvals': ['processing', 'accepted'],
    'processing': ['in_progress', 'approvals'],
    'in_progress': ['complete', 'processing', 'cancelled'],
    'complete': ['in_progress', 'invoiced'],
    'invoiced': ['complete']
  };
  return (allowed[fromStatus] || []).indexOf(toStatus) !== -1;
}

function kanbanDragStart(e) {
  var card = e.target.closest('.kanban-card');
  _kanbanDragJobId = card.dataset.jobId;
  _kanbanDragFromStatus = card.dataset.status;
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', _kanbanDragJobId);
  // Highlight valid/invalid columns after a tick so the dragging card renders first
  setTimeout(function() {
    document.querySelectorAll('.kanban-col').forEach(function(col) {
      var targetStatus = col.dataset.status;
      if (kanbanDragAllowed(_kanbanDragFromStatus, targetStatus)) {
        col.classList.add('drag-over');
      } else if (targetStatus !== _kanbanDragFromStatus) {
        col.classList.add('drag-invalid');
      }
    });
  }, 0);
}

function kanbanDragEnd(e) {
  _kanbanDragJobId = null;
  _kanbanDragFromStatus = null;
  document.querySelectorAll('.kanban-card.dragging').forEach(function(c) { c.classList.remove('dragging'); });
  document.querySelectorAll('.kanban-col').forEach(function(col) {
    col.classList.remove('drag-over', 'drag-invalid');
  });
}

function kanbanDragOver(e) {
  var col = e.target.closest('.kanban-col');
  if (!col || !_kanbanDragFromStatus) return;
  if (kanbanDragAllowed(_kanbanDragFromStatus, col.dataset.status)) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
}

function kanbanDragLeave(e) {
  // No per-column highlight toggle needed — all valid targets stay highlighted during drag
}

function kanbanDrop(e) {
  e.preventDefault();
  var col = e.target.closest('.kanban-col');
  if (!col || !_kanbanDragJobId) return;
  var targetStatus = col.dataset.status;
  if (!kanbanDragAllowed(_kanbanDragFromStatus, targetStatus)) return;
  var jobId = _kanbanDragJobId;
  kanbanDragEnd(e);
  changeJobStatus(jobId, targetStatus);
}

function renderJobList(container, columns) {
  var allJobs = [];
  Object.keys(columns).forEach(function(status) {
    if (status === 'draft' && !_showDrafts) return;
    allJobs = allJobs.concat(columns[status]);
  });

  var html = '<div class="data-table-wrap"><table class="data-table"><thead><tr>' +
    '<th>Client</th><th>Suburb</th><th>Type</th><th>Status</th><th>Value</th><th>Days</th><th>Sched</th><th>POs</th><th>WOs</th>' +
    '</tr></thead><tbody>';

  allJobs.forEach(function(j) {
    html += '<tr onclick="openJobQuickView(\'' + j.id + '\')" style="cursor:pointer;">';
    html += '<td><strong>' + (j.client_name || 'Unknown') + '</strong></td>';
    html += '<td>' + (j.site_suburb || '') + '</td>';
    html += '<td><span class="type-badge ' + j.type + '">' + typeBadgeLabel(j.type) + '</span></td>';
    html += '<td><span class="status-badge ' + j.status + '">' + STATUS_LABELS[j.status] + '</span></td>';
    html += '<td style="font-family:var(--sw-font-num);">' + (j.value ? fmt$(j.value) : '-') + '</td>';
    html += '<td>' + j.days_in_stage + 'd</td>';
    html += '<td>' + j.assignment_count + '</td>';
    html += '<td>' + j.po_count + '</td>';
    html += '<td>' + j.wo_count + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

