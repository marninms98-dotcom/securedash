// ════════════════════════════════════════════════════════════
// COUNCIL & ENGINEERING APPROVALS TAB
// ════════════════════════════════════════════════════════════

var _councilSubmissions = [];

async function loadApprovals() {
  var container = document.getElementById('approvalsKanban');
  var countEl = document.getElementById('approvalsCount');
  try {
    var resp = await opsFetch('list_council_submissions');
    _councilSubmissions = (resp.submissions || []).map(function(sub) {
      // Normalize joined job data to top level for card rendering
      if (sub.jobs) {
        sub.client_name = sub.client_name || sub.jobs.client_name;
        sub.job_number = sub.job_number || sub.jobs.job_number;
        sub.suburb = sub.suburb || sub.jobs.suburb;
      }
      return sub;
    });
    if (countEl) countEl.textContent = _councilSubmissions.length + ' submission' + (_councilSubmissions.length !== 1 ? 's' : '');
    renderCouncilKanban();
  } catch (e) {
    console.error('loadApprovals error:', e);
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sw-text-sec);grid-column:1/-1;">Failed to load council submissions.</div>';
  }
}

function renderCouncilKanban() {
  var container = document.getElementById('approvalsKanban');
  var stages = [
    { key: 'not_started', label: 'Not Started', color: '#95A5A6' },
    { key: 'in_progress', label: 'In Progress', color: '#3498DB' },
    { key: 'blocked', label: 'Blocked', color: '#E74C3C' },
    { key: 'complete', label: 'Complete', color: '#27AE60' },
  ];

  var html = '';
  stages.forEach(function(stage) {
    var items = _councilSubmissions.filter(function(s) { return s.overall_status === stage.key; });
    html += '<div class="kanban-col" style="background:var(--sw-bg);" ondragover="event.preventDefault();this.style.outline=\'2px solid ' + stage.color + '\'" ondragleave="this.style.outline=\'none\'" ondrop="this.style.outline=\'none\';onCouncilDrop(event,\'' + stage.key + '\')">';
    html += '<div class="kanban-col-header" style="border-bottom-color:' + stage.color + ';">' +
      stage.label + '<span class="count">' + items.length + '</span></div>';
    html += '<div class="kanban-body">';

    items.forEach(function(sub) {
      var steps = sub.steps || [];
      var totalSteps = steps.length;
      var completedSteps = steps.filter(function(s) { return s.status === 'complete'; }).length;
      var currentStep = steps[sub.current_step_index] || steps.find(function(s) { return s.status === 'in_progress'; }) || steps[0];
      var currentStepName = currentStep ? currentStep.name : 'Unknown';

      // Days in current step
      var daysInStep = 0;
      if (currentStep && currentStep.started_at) {
        daysInStep = Math.floor((Date.now() - new Date(currentStep.started_at).getTime()) / 86400000);
      }

      // Last email activity
      var emails = sub.email_threads || [];
      var lastEmail = emails.length > 0 ? emails[emails.length - 1] : null;
      var lastEmailText = '';
      if (lastEmail) {
        var emailAge = Math.floor((Date.now() - new Date(lastEmail.created_at).getTime()) / 86400000);
        lastEmailText = (lastEmail.direction === 'inbound' ? 'Reply' : 'Sent') + ' ' + emailAge + 'd ago';
      }

      var cardId = 'councilCard_' + sub.id;

      html += '<div class="kanban-card" style="cursor:pointer;" draggable="true" ondragstart="event.dataTransfer.setData(\'text/plain\',\'' + sub.id + '\')" onclick="toggleCouncilCard(\'' + sub.id + '\')">';

      // Job ref + client
      html += '<div class="kanban-card-header">';
      html += '<span class="kanban-client">' + escapeHtml(sub.job_number || '') + ' ' + escapeHtml(sub.client_name || '') + '</span>';
      html += '</div>';
      if (sub.suburb) {
        html += '<div class="kanban-suburb">' + escapeHtml(sub.suburb) + '</div>';
      }

      // Step progress
      html += '<div style="font-size:12px;margin:6px 0 4px;color:var(--sw-dark);font-weight:600;">Step ' + (sub.current_step_index + 1) + '/' + totalSteps + ': ' + escapeHtml(currentStepName) + '</div>';

      // Step progress bar
      html += '<div style="display:flex;gap:2px;margin-bottom:4px;">';
      steps.forEach(function(step, idx) {
        var stepColor = step.status === 'complete' ? '#27AE60' : step.status === 'in_progress' ? '#3498DB' : step.status === 'blocked' ? '#E74C3C' : '#E0E0E0';
        var stepIcon = step.status === 'complete' ? '&#10003;' : step.status === 'in_progress' ? '&#9679;' : step.status === 'blocked' ? '&#10007;' : '&#9675;';
        html += '<div title="' + escapeHtml(step.name) + ' — ' + step.status + '" style="flex:1;height:4px;border-radius:2px;background:' + stepColor + ';"></div>';
      });
      html += '</div>';

      // Days in step
      if (daysInStep > 0) {
        var daysColor = daysInStep > 7 ? 'var(--sw-red)' : daysInStep > 3 ? '#D97706' : 'var(--sw-text-sec)';
        html += '<div style="font-size:11px;color:' + daysColor + ';">' + daysInStep + ' days in current step</div>';
      }

      // Last email
      if (lastEmailText) {
        html += '<div style="font-size:11px;color:var(--sw-text-sec);margin-top:2px;">' + lastEmailText + '</div>';
      }

      // Expandable detail
      html += '<div id="' + cardId + '" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--sw-border);">';
      html += renderCouncilCardDetail(sub);
      html += '</div>';

      html += '</div>';
    });

    if (items.length === 0) {
      html += '<div style="text-align:center;padding:20px;color:var(--sw-text-sec);font-size:12px;">None</div>';
    }

    html += '</div></div>';
  });

  container.innerHTML = html;
}

function toggleCouncilCard(subId) {
  var el = document.getElementById('councilCard_' + subId);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function renderCouncilCardDetail(sub) {
  var html = '';
  var steps = sub.steps || [];
  var emails = sub.email_threads || [];

  // Full step list
  html += '<div style="font-size:11px;font-weight:600;color:var(--sw-dark);margin-bottom:4px;">Steps</div>';
  steps.forEach(function(step, idx) {
    var statusIcon = step.status === 'complete' ? '<span style="color:var(--sw-green);">&#10003;</span>' :
                     step.status === 'in_progress' ? '<span style="color:var(--sw-mid);">&#9679;</span>' :
                     step.status === 'blocked' ? '<span style="color:var(--sw-red);">&#10007;</span>' :
                     '<span style="color:var(--sw-text-sec);">&#9675;</span>';

    html += '<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:11px;border-bottom:1px solid var(--sw-border);">';
    html += statusIcon;
    html += '<span style="flex:1;' + (step.status === 'complete' ? 'text-decoration:line-through;color:var(--sw-text-sec);' : '') + '">' + escapeHtml(step.name) + '</span>';
    if (step.vendor) html += '<span style="color:var(--sw-text-sec);">' + escapeHtml(step.vendor) + '</span>';
    if (step.completed_at) html += '<span style="color:var(--sw-green);font-size:10px;">' + fmtDate(step.completed_at) + '</span>';

    // Update status dropdown
    if (step.status !== 'complete') {
      html += '<select style="font-size:10px;padding:1px 4px;border:1px solid var(--sw-border);border-radius:3px;" onchange="updateCouncilStep(\'' + sub.id + '\',' + idx + ',this.value)">';
      html += '<option value="">Update...</option>';
      html += '<option value="in_progress">In Progress</option>';
      html += '<option value="complete">Complete</option>';
      html += '<option value="blocked">Blocked</option>';
      html += '</select>';
    }
    html += '</div>';
  });

  // Email thread for this submission
  if (emails.length > 0) {
    html += '<div style="font-size:11px;font-weight:600;color:var(--sw-dark);margin:8px 0 4px;">Email Thread (' + emails.length + ')</div>';
    emails.forEach(function(em) {
      var dir = em.direction === 'inbound' ? '&#8601;' : '&#8599;';
      html += '<div style="padding:3px 0;border-bottom:1px solid var(--sw-border);font-size:11px;">';
      html += '<span style="color:var(--sw-mid);">' + dir + '</span> ';
      html += '<span style="color:var(--sw-text-sec);">' + fmtDate(em.created_at) + '</span> ';
      if (em.from_email) html += '<span style="color:var(--sw-text-sec);">' + escapeHtml(em.from_email) + '</span> ';
      html += '<span style="color:var(--sw-dark);">' + escapeHtml(em.subject || em.body_text?.slice(0, 60) || '') + '</span>';
      html += '</div>';
    });
  }

  // Action buttons
  var hasIncompleteSteps = steps.some(function(s) { return s.status !== 'complete'; });
  html += '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">';
  if (hasIncompleteSteps) {
    html += '<button class="btn btn-sm" style="font-size:11px;background:var(--sw-green);color:#fff;" onclick="event.stopPropagation();openCouncilAdvanceModal(\'' + sub.id + '\',' + sub.current_step_index + ')">Advance Step &#8594;</button>';
    html += '<button class="btn btn-sm" style="font-size:11px;background:var(--sw-red);color:#fff;" onclick="event.stopPropagation();updateCouncilStep(\'' + sub.id + '\',' + sub.current_step_index + ',\'blocked\')">Mark Blocked</button>';
  }
  html += '<button class="btn btn-sm btn-secondary" style="font-size:11px;" onclick="event.stopPropagation();openCouncilEmailCompose(\'' + sub.id + '\')">Send Email</button>';
  if (sub.job_id) {
    html += '<button class="btn btn-sm btn-secondary" style="font-size:11px;" onclick="event.stopPropagation();openJobQuickView(\'' + sub.job_id + '\')">View Job</button>';
  }
  html += '</div>';

  return html;
}

async function updateCouncilStep(submissionId, stepIndex, newStatus) {
  if (!newStatus) return;
  try {
    await opsPost('update_council_status', {
      submission_id: submissionId,
      step_index: stepIndex,
      status: newStatus,
    });
    loadApprovals();
  } catch (e) {
    alert('Failed to update step: ' + e.message);
  }
}

function onCouncilDrop(event, targetStatus) {
  event.preventDefault();
  var subId = event.dataTransfer.getData('text/plain');
  if (!subId) return;
  var sub = _councilSubmissions.find(function(s) { return s.id === subId; });
  if (!sub) return;

  // If dropping to 'complete', use the advance confirmation modal
  if (targetStatus === 'complete') {
    openCouncilAdvanceModal(subId, sub.current_step_index);
    return;
  }

  // For other statuses, map to step status
  var stepStatusMap = { not_started: 'pending', in_progress: 'in_progress', blocked: 'blocked' };
  var newStepStatus = stepStatusMap[targetStatus];
  if (!newStepStatus) return;

  updateCouncilStep(subId, sub.current_step_index, newStepStatus);
}

function openCouncilEmailCompose(submissionId) {
  var sub = _councilSubmissions.find(function(s) { return s.id === submissionId; });
  if (!sub) return;
  var currentStep = (sub.steps || [])[sub.current_step_index] || {};
  var toEmail = currentStep.vendor_email || '';
  var subject = 'Re: ' + (sub.job_number || '') + ' — ' + (currentStep.name || 'Council Application');

  // Use the existing compose modal pattern if available
  var body = 'Hi,\n\nRegarding the ' + (currentStep.name || 'application') + ' for ' + (sub.job_number || '') + ' ' + escapeHtml(sub.client_name || '') + '.\n\n';

  // Simple prompt-based compose for now
  var userBody = prompt('Email body to ' + (toEmail || 'council/engineer') + ':', body);
  if (!userBody) return;

  opsPost('send_council_email', {
    submission_id: submissionId,
    step_index: sub.current_step_index,
    to_email: toEmail,
    subject: subject,
    body_text: userBody,
  }).then(function() {
    alert('Email sent');
    loadApprovals();
  }).catch(function(e) {
    alert('Failed to send: ' + e.message);
  });
}
