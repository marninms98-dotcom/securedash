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

var _expandedCouncilStepKey = null; // 'subId_stepIdx'

function renderCouncilCardDetail(sub) {
  var html = '';
  var steps = sub.steps || [];
  var emails = sub.email_threads || [];

  // Full step list with per-step email counts and expandable threads
  html += '<div style="font-size:11px;font-weight:600;color:var(--sw-dark);margin-bottom:4px;">Steps</div>';
  steps.forEach(function(step, idx) {
    var statusIcon = step.status === 'complete' ? '<span style="color:var(--sw-green);">&#10003;</span>' :
                     step.status === 'in_progress' ? '<span style="color:var(--sw-mid);">&#9679;</span>' :
                     step.status === 'blocked' ? '<span style="color:var(--sw-red);">&#10007;</span>' :
                     '<span style="color:var(--sw-text-sec);">&#9675;</span>';

    // Count emails for this step (match by step_index in reply-to encoding or by timing)
    var stepEmails = emails.filter(function(em) {
      // Best effort: match by subject containing step name, or by council_step_index if available
      return (em.subject && em.subject.indexOf(step.name) >= 0) || em.council_step_index === idx;
    });
    var stepEmailCount = stepEmails.length;

    // Days in this step
    var daysInStep = 0;
    if (step.started_at && step.status !== 'complete') {
      daysInStep = Math.floor((Date.now() - new Date(step.started_at).getTime()) / 86400000);
    }

    var stepKey = sub.id + '_' + idx;
    var isStepExpanded = _expandedCouncilStepKey === stepKey;

    html += '<div style="border-bottom:1px solid var(--sw-border);">';
    html += '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:11px;cursor:pointer;" onclick="event.stopPropagation();toggleCouncilStepExpand(\'' + sub.id + '\',' + idx + ')">';
    html += statusIcon;
    html += '<span style="flex:1;' + (step.status === 'complete' ? 'text-decoration:line-through;color:var(--sw-text-sec);' : '') + '">' + escapeHtml(step.name) + '</span>';
    if (stepEmailCount > 0) html += '<span style="font-size:10px;color:var(--sw-text-sec);">&#128233; ' + stepEmailCount + '</span>';
    if (daysInStep > 0) html += '<span style="font-size:10px;color:' + (daysInStep > 7 ? 'var(--sw-red)' : 'var(--sw-text-sec)') + ';">' + daysInStep + 'd</span>';
    if (step.status !== 'complete') {
      html += '<select style="font-size:10px;padding:1px 4px;border:1px solid var(--sw-border);border-radius:3px;" onclick="event.stopPropagation()" onchange="event.stopPropagation();updateCouncilStep(\'' + sub.id + '\',' + idx + ',this.value)">';
      html += '<option value="">...</option>';
      html += '<option value="in_progress">In Progress</option>';
      html += '<option value="complete">Complete</option>';
      html += '<option value="blocked">Blocked</option>';
      html += '</select>';
    }
    html += '<span style="font-size:10px;color:var(--sw-text-sec);">' + (isStepExpanded ? '&#9650;' : '&#9660;') + '</span>';
    html += '</div>';

    // Expanded step: email thread + compose/reply
    html += '<div id="councilStep_' + stepKey + '" style="display:' + (isStepExpanded ? 'block' : 'none') + ';padding:6px 0 8px 20px;">';

    if (stepEmails.length > 0) {
      // Show emails for this step
      stepEmails.forEach(function(em) {
        var isInbound = em.direction === 'inbound' || em.direction === 'received';
        var dir = isInbound ? '&#8601;' : '&#8599;';
        var date = em.created_at ? new Date(em.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        var bgColor = isInbound ? 'rgba(52,152,219,0.04)' : 'rgba(241,90,41,0.04)';
        var borderColor = isInbound ? 'var(--sw-blue,#3498DB)' : 'var(--sw-orange)';
        html += '<div style="padding:6px 8px;margin-bottom:4px;border-left:2px solid ' + borderColor + ';background:' + bgColor + ';border-radius:0 4px 4px 0;">';
        html += '<div style="font-size:10px;color:var(--sw-text-sec);display:flex;justify-content:space-between;">';
        html += '<span>' + dir + ' ' + escapeHtml(isInbound ? (em.from_email || '') : (em.to_email || '')) + '</span>';
        html += '<span>' + date + '</span></div>';
        if (em.subject) html += '<div style="font-size:11px;font-weight:600;margin-top:2px;">' + escapeHtml(em.subject) + '</div>';
        var bodyPreview = (em.body_text || '').slice(0, 200);
        if (bodyPreview) html += '<div style="font-size:11px;color:var(--sw-text);margin-top:3px;white-space:pre-wrap;line-height:1.4;">' + escapeHtml(bodyPreview) + (em.body_text && em.body_text.length > 200 ? '...' : '') + '</div>';
        html += '</div>';
      });

      // Inline reply bar
      var lastStepEmail = stepEmails[stepEmails.length - 1];
      var lastIsInbound = lastStepEmail && (lastStepEmail.direction === 'inbound' || lastStepEmail.direction === 'received');
      var replyTo = lastIsInbound ? (lastStepEmail.from_email || '') : (lastStepEmail.to_email || step.vendor_email || '');
      html += '<div style="display:flex;gap:4px;margin-top:4px;align-items:flex-end;">';
      html += '<textarea id="councilReply_' + stepKey + '" placeholder="Reply to ' + escapeHtml(replyTo) + '..." rows="1" style="flex:1;padding:6px 8px;border:1px solid var(--sw-border);border-radius:4px;font-size:11px;font-family:inherit;resize:none;min-height:30px;" onfocus="this.rows=3" onblur="if(!this.value)this.rows=1" onclick="event.stopPropagation()"></textarea>';
      html += '<button class="btn btn-sm btn-primary" style="font-size:10px;height:30px;" onclick="event.stopPropagation();sendCouncilStepReply(\'' + sub.id + '\',' + idx + ',\'' + escapeHtml(replyTo).replace(/'/g, "\\'") + '\')">Send &#8599;</button>';
      html += '</div>';
    } else {
      // No emails — first contact compose
      html += '<div style="font-size:11px;color:var(--sw-text-sec);margin-bottom:4px;">No emails for this step yet.</div>';
      html += '<div style="margin-bottom:4px;">';
      html += '<input type="email" id="councilTo_' + stepKey + '" placeholder="Recipient email..." value="' + escapeHtml(step.vendor_email || '') + '" style="width:100%;padding:6px 8px;border:1px solid var(--sw-border);border-radius:4px;font-size:11px;font-family:inherit;" onclick="event.stopPropagation()">';
      html += '</div>';
      html += '<div style="display:flex;gap:4px;align-items:flex-end;">';
      html += '<textarea id="councilReply_' + stepKey + '" placeholder="Type your message..." rows="2" style="flex:1;padding:6px 8px;border:1px solid var(--sw-border);border-radius:4px;font-size:11px;font-family:inherit;resize:none;" onclick="event.stopPropagation()"></textarea>';
      html += '<button class="btn btn-sm btn-primary" style="font-size:10px;height:30px;" onclick="event.stopPropagation();sendCouncilStepFirstEmail(\'' + sub.id + '\',' + idx + ',\'' + stepKey + '\')">Send &#8599;</button>';
      html += '</div>';
    }

    html += '</div>'; // step expand
    html += '</div>'; // step wrapper
  });

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

function toggleCouncilStepExpand(subId, stepIdx) {
  var stepKey = subId + '_' + stepIdx;
  var wasExpanded = _expandedCouncilStepKey === stepKey;

  // Collapse previous
  if (_expandedCouncilStepKey) {
    var prevEl = document.getElementById('councilStep_' + _expandedCouncilStepKey);
    if (prevEl) prevEl.style.display = 'none';
  }

  if (wasExpanded) {
    _expandedCouncilStepKey = null;
  } else {
    _expandedCouncilStepKey = stepKey;
    var el = document.getElementById('councilStep_' + stepKey);
    if (el) el.style.display = 'block';
  }
}

async function sendCouncilStepReply(submissionId, stepIndex, toEmail) {
  var stepKey = submissionId + '_' + stepIndex;
  var textEl = document.getElementById('councilReply_' + stepKey);
  if (!textEl) return;
  var body = textEl.value.trim();
  if (!body) { showToast('Type a message first', 'warning'); return; }

  var sub = _councilSubmissions.find(function(s) { return s.id === submissionId; });
  var step = sub ? (sub.steps || [])[stepIndex] : null;
  var subject = (sub ? (sub.job_number || '') : '') + ' — ' + (step ? step.name : 'Council') + ' — SecureWorks WA';

  textEl.value = '';
  textEl.rows = 1;

  try {
    await opsPost('send_council_email', {
      submission_id: submissionId,
      step_index: stepIndex,
      to_email: toEmail,
      subject: 'Re: ' + subject,
      body_text: body,
    });
    showToast('Email sent to ' + toEmail, 'success');
    loadApprovals();
  } catch (e) {
    showToast('Failed to send: ' + e.message, 'warning');
  }
}

async function sendCouncilStepFirstEmail(submissionId, stepIndex, stepKey) {
  var toEl = document.getElementById('councilTo_' + stepKey);
  var textEl = document.getElementById('councilReply_' + stepKey);
  if (!toEl || !textEl) return;

  var toEmail = toEl.value.trim();
  var body = textEl.value.trim();
  if (!toEmail) { showToast('Enter recipient email', 'warning'); return; }
  if (!toEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { showToast('Invalid email', 'warning'); return; }
  if (!body) { showToast('Type a message first', 'warning'); return; }

  var sub = _councilSubmissions.find(function(s) { return s.id === submissionId; });
  var step = sub ? (sub.steps || [])[stepIndex] : null;
  var subject = (sub ? (sub.job_number || '') : '') + ' — ' + (step ? step.name : 'Council') + ' — SecureWorks WA';

  textEl.value = '';

  try {
    await opsPost('send_council_email', {
      submission_id: submissionId,
      step_index: stepIndex,
      to_email: toEmail,
      subject: subject,
      body_text: body,
    });

    // Save vendor_email on the step for next time
    try {
      await opsPost('update_council_status', {
        submission_id: submissionId,
        step_index: stepIndex,
        vendor_email: toEmail,
      });
    } catch (e2) { /* non-critical */ }

    showToast('Email sent to ' + toEmail, 'success');
    loadApprovals();
  } catch (e) {
    showToast('Failed to send: ' + e.message, 'warning');
  }
}

function openCouncilEmailCompose(submissionId, stepIndex) {
  var sub = _councilSubmissions.find(function(s) { return s.id === submissionId; });
  if (!sub) return;
  var idx = (stepIndex !== undefined) ? stepIndex : sub.current_step_index;
  var step = (sub.steps || [])[idx] || {};
  var toEmail = step.vendor_email || '';
  var subject = (sub.job_number || '') + ' — ' + (step.name || 'Council Application') + ' — SecureWorks WA';
  var body = 'Hi,\n\nRegarding the ' + (step.name || 'application') + ' for ' + (sub.job_number || '') + ' — ' + (sub.client_name || '') + '.\n\n\n\nThanks,\nSecureWorks WA';

  // Use the PO email compose modal (repurposed for council)
  document.getElementById('poComposeTitle').textContent = 'Email — ' + (step.name || 'Council Step');
  document.getElementById('poComposeTo').value = toEmail;
  document.getElementById('poComposeSubject').value = subject;
  document.getElementById('poComposeBody').value = body;
  document.getElementById('poComposePoId').value = '';
  document.getElementById('poComposeJobId').value = sub.job_id || '';
  document.getElementById('poComposeAttachPDF').checked = false;
  document.getElementById('poComposeTemplate').value = 'custom';
  document.getElementById('poComposeFiles').value = '';
  document.getElementById('poComposeFileList').textContent = '';

  // Store council context for send handler
  window._councilComposeContext = { submission_id: submissionId, step_index: idx };

  var formView = document.getElementById('poComposeFormView');
  var previewView = document.getElementById('poComposePreviewView');
  if (formView) formView.style.display = '';
  if (previewView) previewView.style.display = 'none';

  document.getElementById('poEmailComposeModal').classList.add('active');
}

// Open council start modal from Approvals page (needs job picker)
function openCouncilStartModalFromApprovals() {
  // Build a quick job picker from _allJobs (patio jobs without council submissions)
  var existingJobIds = _councilSubmissions.map(function(s) { return s.job_id; });
  var patioJobs = (typeof _allJobs !== 'undefined' ? _allJobs : []).filter(function(j) {
    return j.type === 'patio' && existingJobIds.indexOf(j.id) < 0 && ['cancelled', 'lost'].indexOf(j.status) < 0;
  });

  if (patioJobs.length === 0) {
    alert('No patio jobs available for council process (all either have one started or are cancelled).');
    return;
  }

  // Simple selection prompt — list jobs
  var options = patioJobs.map(function(j) { return (j.job_number || '') + ' — ' + (j.client_name || '') + ' (' + (j.suburb || '') + ')'; });
  var choice = prompt('Select a patio job (enter number):\n\n' + options.map(function(o, i) { return (i + 1) + '. ' + o; }).join('\n'));
  if (!choice) return;
  var idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= patioJobs.length) { alert('Invalid selection.'); return; }

  openCouncilStartModal(patioJobs[idx].id);
}
