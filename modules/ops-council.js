// ════════════════════════════════════════════════════════════
// COUNCIL & ENGINEERING APPROVALS TAB
// 2-Layer UI: List → Detail (with unified conversation)
// ════════════════════════════════════════════════════════════

var _councilSubmissions = [];
var _councilFilter = null; // null = show all, or 'not_started'|'in_progress'|'blocked'|'complete'
var _councilDetailSubId = null; // currently open detail view

// ────────────────────────────────────────────────────────────
// DATA LOADING
// ────────────────────────────────────────────────────────────

async function loadApprovals() {
  var summaryEl = document.getElementById('approvalsSummary');
  var listEl = document.getElementById('approvalsList');
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
    renderApprovalsList();
  } catch (e) {
    console.error('loadApprovals error:', e);
    if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sw-text-sec);">Failed to load council submissions.</div>';
  }
}

// ────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────

/**
 * Compute urgency tier + scoring for a submission.
 * Returns { tier, score, daysInStep, unreadCount }
 */
function computeUrgency(sub) {
  var steps = sub.steps || [];
  var currentStep = steps[sub.current_step_index] || steps[0];
  var emails = sub.email_threads || [];

  // Days in current step
  var daysInStep = 0;
  if (currentStep && currentStep.started_at && sub.overall_status !== 'complete') {
    daysInStep = Math.floor((Date.now() - new Date(currentStep.started_at).getTime()) / 86400000);
  }

  // Unread inbound emails
  var unreadCount = emails.filter(function(em) {
    return (em.direction === 'inbound' || em.direction === 'received') && !em.read_at;
  }).length;

  // Tier assignment (priority order)
  var tier, score;
  if (sub.overall_status === 'complete') {
    tier = 'complete';
    score = 0;
  } else if (sub.overall_status === 'blocked' || (currentStep && currentStep.status === 'blocked')) {
    tier = 'blocked';
    score = 500 + daysInStep;
  } else if (unreadCount > 0) {
    tier = 'unread';
    score = 400 + unreadCount;
  } else if (daysInStep > 7) {
    tier = 'stalled';
    score = 300 + daysInStep;
  } else {
    tier = 'active';
    score = 200 - daysInStep; // newer = lower priority within active
  }

  return { tier: tier, score: score, daysInStep: daysInStep, unreadCount: unreadCount };
}

/**
 * SVG circular progress ring.
 * @param {number} completed - completed step count
 * @param {number} total - total step count
 * @param {string} status - overall_status for color
 * @returns {string} SVG markup
 */
function renderProgressRingSVG(completed, total, status) {
  var size = 40;
  var strokeWidth = 3.5;
  var radius = (size - strokeWidth) / 2;
  var circumference = 2 * Math.PI * radius;
  var progress = total > 0 ? completed / total : 0;
  var dashOffset = circumference * (1 - progress);

  var strokeColor = status === 'complete' ? '#27AE60' :
                    status === 'blocked' ? '#E74C3C' :
                    progress > 0 ? '#3498DB' : '#CCC';

  var pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="flex-shrink:0;">' +
    '<circle cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + radius + '" fill="none" stroke="#E8E8E8" stroke-width="' + strokeWidth + '"/>' +
    '<circle cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + radius + '" fill="none" stroke="' + strokeColor + '" stroke-width="' + strokeWidth + '" ' +
      'stroke-dasharray="' + circumference + '" stroke-dashoffset="' + dashOffset + '" ' +
      'stroke-linecap="round" transform="rotate(-90 ' + (size / 2) + ' ' + (size / 2) + ')"/>' +
    '<text x="' + (size / 2) + '" y="' + (size / 2) + '" text-anchor="middle" dominant-baseline="central" ' +
      'font-size="10" font-weight="700" fill="' + strokeColor + '">' + pct + '%</text>' +
    '</svg>';
}

/**
 * Relative time string: "2m", "3h", "5d", etc.
 * Falls back to date if > 5 weeks.
 */
function councilRelativeTime(dateStr) {
  if (!dateStr) return '';
  var diffMs = Date.now() - new Date(dateStr).getTime();
  var mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return mins + 'm';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h';
  var days = Math.floor(hrs / 24);
  if (days < 7) return days + 'd';
  var weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks + 'w';
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

/**
 * Get emails filtered to a specific step index.
 */
function getStepEmails(sub, stepIdx) {
  var emails = sub.email_threads || [];
  var step = (sub.steps || [])[stepIdx];
  return emails.filter(function(em) {
    if (em.council_step_index === stepIdx) return true;
    if (em.council_step_index == null && step && em.subject && em.subject.indexOf(step.name) >= 0) return true;
    return false;
  });
}

// ────────────────────────────────────────────────────────────
// LAYER 1: APPROVAL LIST
// ────────────────────────────────────────────────────────────

/**
 * Render the stat pills at the top + the card list.
 */
function renderApprovalsList() {
  var summaryEl = document.getElementById('approvalsSummary');
  var listEl = document.getElementById('approvalsList');
  if (!listEl) return;

  // ── Summary pills ──
  if (summaryEl) summaryEl.innerHTML = renderApprovalsSummary();

  var html = '';

  // ── Sort submissions by urgency ──
  var sorted = _councilSubmissions.slice().map(function(sub) {
    sub._urgency = computeUrgency(sub);
    return sub;
  });

  // Apply filter
  if (_councilFilter) {
    sorted = sorted.filter(function(sub) {
      return sub.overall_status === _councilFilter;
    });
  }

  // Sort: highest score first (blocked > unread > stalled > active > complete)
  sorted.sort(function(a, b) { return b._urgency.score - a._urgency.score; });

  if (sorted.length === 0) {
    html += '<div style="text-align:center;padding:40px;color:var(--sw-text-sec);font-size:13px;">';
    html += _councilFilter ? 'No ' + _councilFilter.replace('_', ' ') + ' submissions.' : 'No council submissions yet.';
    html += '</div>';
    listEl.innerHTML = html;
    return;
  }

  // ── Card list ──
  html += '<div style="display:flex;flex-direction:column;gap:10px;">';
  sorted.forEach(function(sub) {
    html += renderApprovalCard(sub);
  });
  html += '</div>';

  listEl.innerHTML = html;
}

/**
 * Render the 4 stat pills: Not Started, In Progress, Blocked, Complete.
 */
function renderApprovalsSummary() {
  var counts = { not_started: 0, in_progress: 0, blocked: 0, complete: 0 };
  _councilSubmissions.forEach(function(sub) {
    if (counts.hasOwnProperty(sub.overall_status)) counts[sub.overall_status]++;
  });

  var pills = [
    { key: 'not_started', label: 'Not Started', color: '#95A5A6', bg: '#95A5A620' },
    { key: 'in_progress', label: 'In Progress', color: '#3498DB', bg: '#3498DB20' },
    { key: 'blocked', label: 'Blocked', color: '#E74C3C', bg: '#E74C3C20' },
    { key: 'complete', label: 'Complete', color: '#27AE60', bg: '#27AE6020' }
  ];

  var html = '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
  pills.forEach(function(p) {
    var isActive = _councilFilter === p.key;
    var border = isActive ? '2px solid ' + p.color : '2px solid transparent';
    html += '<button onclick="toggleCouncilFilter(\'' + p.key + '\')" style="' +
      'display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:12px;' +
      'background:' + p.bg + ';border:' + border + ';cursor:pointer;font-size:12px;font-weight:600;' +
      'color:' + p.color + ';transition:all 0.2s;">' +
      '<span style="font-size:18px;font-weight:700;line-height:1;">' + counts[p.key] + '</span>' +
      p.label +
      '</button>';
  });
  html += '</div>';
  return html;
}

/**
 * Toggle filter by status pill tap.
 */
function toggleCouncilFilter(status) {
  _councilFilter = (_councilFilter === status) ? null : status;
  renderApprovalsList();
}

/**
 * Render a single approval card for the list.
 */
function renderApprovalCard(sub) {
  var u = sub._urgency || computeUrgency(sub);
  var steps = sub.steps || [];
  var totalSteps = steps.length;
  var completedSteps = steps.filter(function(s) { return s.status === 'complete'; }).length;
  var currentStep = steps[sub.current_step_index] || steps[0];
  var currentStepName = currentStep ? currentStep.name : 'Unknown';

  // Border color by urgency tier
  var borderColors = {
    blocked: '#E74C3C',
    unread: '#F39C12',
    stalled: '#D97706',
    active: '#27AE60',
    complete: '#95A5A6'
  };
  var borderColor = borderColors[u.tier] || '#E0E0E0';

  // Days badge color
  var daysBadgeBg = u.daysInStep > 7 ? '#E74C3C' : u.daysInStep > 3 ? '#D97706' : '#95A5A6';
  var daysBadgeColor = u.daysInStep > 3 ? '#fff' : '#fff';

  var html = '<div onclick="openCouncilDetail(\'' + sub.id + '\')" style="' +
    'display:flex;align-items:center;gap:12px;padding:14px 16px;' +
    'background:var(--sw-card,#fff);border-radius:12px;border-left:4px solid ' + borderColor + ';' +
    'box-shadow:0 1px 3px rgba(0,0,0,0.06);cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;' +
    '" onmousedown="this.style.transform=\'scale(0.98)\'" onmouseup="this.style.transform=\'\'" onmouseleave="this.style.transform=\'\'">';

  // Progress ring (left)
  html += renderProgressRingSVG(completedSteps, totalSteps, sub.overall_status);

  // Middle content
  html += '<div style="flex:1;min-width:0;">';

  // Job number + client name
  html += '<div style="font-size:14px;font-weight:700;color:var(--sw-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
    escapeHtml(sub.job_number || '') + ' ' + escapeHtml(sub.client_name || '') + '</div>';

  // Current step
  html += '<div style="font-size:12px;color:var(--sw-text-sec);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">';
  html += 'Step ' + (sub.current_step_index + 1) + '/' + totalSteps + ': ' + escapeHtml(currentStepName);
  html += '</div>';

  // Unread badge (if any)
  if (u.unreadCount > 0) {
    html += '<div style="margin-top:4px;"><span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#3498DB;color:#fff;font-size:10px;font-weight:700;">' + u.unreadCount + ' unread</span></div>';
  }

  html += '</div>'; // end middle

  // Right side: days badge + chevron
  html += '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">';
  if (u.daysInStep > 0 && u.tier !== 'complete') {
    html += '<span style="display:inline-block;padding:3px 8px;border-radius:10px;background:' + daysBadgeBg + ';color:' + daysBadgeColor + ';font-size:11px;font-weight:700;white-space:nowrap;">' + u.daysInStep + 'd</span>';
  }
  // Chevron
  html += '<span style="font-size:18px;color:var(--sw-text-sec);line-height:1;">&#8250;</span>';
  html += '</div>';

  html += '</div>'; // end card
  return html;
}

// ────────────────────────────────────────────────────────────
// LAYER 2: COUNCIL DETAIL VIEW
// ────────────────────────────────────────────────────────────

/**
 * Ensure the detail view container exists in the DOM.
 * Created once, reused thereafter.
 */
function ensureCouncilDetailView() {
  if (document.getElementById('councilDetailView')) return;

  var el = document.createElement('div');
  el.id = 'councilDetailView';
  el.style.cssText = 'position:fixed;inset:0;z-index:200;background:var(--sw-bg,#F5F3F0);' +
    'display:flex;flex-direction:column;overflow:hidden;' +
    'transform:translateX(100%);transition:transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94);' +
    'will-change:transform;';
  el.innerHTML = '<div id="councilDetailContent" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>';
  document.body.appendChild(el);
}

/**
 * Open the detail view for a submission. Slides in from right.
 */
function openCouncilDetail(subId) {
  var sub = _councilSubmissions.find(function(s) { return s.id === subId; });
  if (!sub) return;
  _councilDetailSubId = subId;

  ensureCouncilDetailView();
  var view = document.getElementById('councilDetailView');
  var content = document.getElementById('councilDetailContent');

  var steps = sub.steps || [];
  var totalSteps = steps.length;
  var completedSteps = steps.filter(function(s) { return s.status === 'complete'; }).length;
  var currentStep = steps[sub.current_step_index] || steps[0];

  var html = '';

  // ── Header with back button ──
  html += '<div style="flex-shrink:0;padding:16px 16px 12px;background:var(--sw-card,#fff);border-bottom:1px solid var(--sw-border,#E0E0E0);">';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">';
  html += '<button onclick="closeCouncilDetail()" style="display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;font-size:14px;color:var(--sw-orange,#F15A29);font-weight:600;padding:0;">&#8249; Approvals</button>';
  html += '<div style="flex:1;"></div>';
  // Action menu
  if (sub.job_id) {
    html += '<button onclick="openJobQuickView(\'' + sub.job_id + '\')" style="font-size:11px;padding:4px 10px;border:1px solid var(--sw-border);border-radius:6px;background:var(--sw-card,#fff);cursor:pointer;color:var(--sw-text-sec);">View Job</button>';
  }
  html += '</div>';

  // Job title
  html += '<div style="font-size:18px;font-weight:700;color:var(--sw-dark);">' + escapeHtml(sub.job_number || '') + ' — ' + escapeHtml(sub.client_name || '') + '</div>';
  if (sub.suburb) {
    html += '<div style="font-size:12px;color:var(--sw-text-sec);margin-top:2px;">' + escapeHtml(sub.suburb) + '</div>';
  }

  // ── Segmented progress bar ──
  html += '<div style="display:flex;gap:3px;margin-top:14px;">';
  steps.forEach(function(step, idx) {
    var segColor, animation;
    if (step.status === 'complete') {
      segColor = '#27AE60';
      animation = '';
    } else if (step.status === 'blocked') {
      segColor = '#E74C3C';
      animation = '';
    } else if (idx === sub.current_step_index) {
      segColor = '#F39C12';
      animation = 'animation:councilPulse 2s ease-in-out infinite;';
    } else {
      segColor = '#E0E0E0';
      animation = '';
    }
    html += '<div style="flex:1;height:6px;border-radius:3px;background:' + segColor + ';' + animation + '"></div>';
  });
  html += '</div>';

  // Progress text
  html += '<div style="font-size:11px;color:var(--sw-text-sec);margin-top:6px;">' + completedSteps + ' of ' + totalSteps + ' steps complete</div>';

  html += '</div>'; // end header

  // ── Current step hero ──
  if (currentStep && sub.overall_status !== 'complete') {
    html += '<div style="padding:16px;background:var(--sw-card,#fff);margin:12px 16px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--sw-text-sec);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Current Step</div>';
    html += '<div style="font-size:20px;font-weight:700;color:var(--sw-dark);">' + escapeHtml(currentStep.name) + '</div>';
    // Days in step
    if (currentStep.started_at) {
      var heroDs = Math.floor((Date.now() - new Date(currentStep.started_at).getTime()) / 86400000);
      if (heroDs > 0) {
        var heroDsColor = heroDs > 7 ? '#E74C3C' : heroDs > 3 ? '#D97706' : 'var(--sw-text-sec)';
        html += '<div style="font-size:12px;color:' + heroDsColor + ';margin-top:2px;font-weight:' + (heroDs > 7 ? '700' : '400') + ';">' + heroDs + ' days in this step</div>';
      }
    }
    // Vendor info or setter
    if (currentStep.vendor) {
      html += '<div style="font-size:12px;color:var(--sw-text-sec);margin-top:4px;">' + escapeHtml(currentStep.vendor) + (currentStep.vendor_email ? ' &mdash; ' + escapeHtml(currentStep.vendor_email) : '') + '</div>';
    } else {
      html += '<div id="councilVendorSet_' + sub.current_step_index + '" style="margin-top:6px;">';
      html += '<button onclick="toggleCouncilVendorEditor(\'' + sub.id + '\',' + sub.current_step_index + ')" style="background:none;border:1px dashed var(--sw-border);padding:6px 12px;border-radius:6px;font-size:11px;color:var(--sw-text-sec);cursor:pointer;">+ Set vendor &amp; email for this step</button>';
      html += '</div>';
    }
    // Advance button
    html += '<button onclick="openCouncilAdvanceModal(\'' + sub.id + '\',' + sub.current_step_index + ')" style="margin-top:12px;padding:10px 20px;background:var(--sw-green,#27AE60);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;width:100%;">Complete &amp; Advance &#10003;</button>';
    html += '</div>';
  }

  // ── Step timeline ──
  html += '<div style="padding:0 16px 16px;">';
  html += '<div style="font-size:13px;font-weight:700;color:var(--sw-dark);margin:16px 0 10px;">All Steps</div>';

  steps.forEach(function(step, idx) {
    var isComplete = step.status === 'complete';
    var isActive = idx === sub.current_step_index && sub.overall_status !== 'complete';
    var isBlocked = step.status === 'blocked';
    var isPending = !isComplete && !isActive && !isBlocked;
    var isLast = idx === steps.length - 1;

    // Count emails for badge
    var stepEmails = getStepEmails(sub, idx);
    var stepUnread = stepEmails.filter(function(em) { return (em.direction === 'inbound' || em.direction === 'received') && !em.read_at; }).length;

    // Circle indicator color
    var circleColor = isComplete ? '#27AE60' : isBlocked ? '#E74C3C' : isActive ? '#F39C12' : '#CCC';
    var circleIcon = isComplete ? '&#10003;' : isBlocked ? '!' : isActive ? '&#9679;' : (idx + 1);
    var circleBg = isComplete ? '#27AE60' : isBlocked ? '#E74C3C' : isActive ? '#F39C12' : '#E8E8E8';
    var circleFg = (isComplete || isBlocked || isActive) ? '#fff' : '#999';

    // Connecting line color
    var lineColor = isComplete ? '#27AE60' : '#E0E0E0';

    html += '<div onclick="filterCouncilEmails(' + idx + ')" style="display:flex;gap:12px;cursor:pointer;position:relative;">';

    // Left: circle + vertical line
    html += '<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:28px;">';
    // Circle
    html += '<div style="width:28px;height:28px;border-radius:50%;background:' + circleBg + ';color:' + circleFg + ';' +
      'display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;' +
      (isActive ? 'box-shadow:0 0 0 3px ' + circleBg + '40;' : '') + '">' + circleIcon + '</div>';
    // Vertical line (not on last step)
    if (!isLast) {
      html += '<div style="flex:1;width:2px;background:' + lineColor + ';min-height:16px;margin:4px 0;"></div>';
    }
    html += '</div>';

    // Right: step content
    html += '<div style="flex:1;padding-bottom:' + (isLast ? '0' : '16px') + ';min-width:0;">';

    // Step name row
    html += '<div style="display:flex;align-items:center;gap:8px;min-height:28px;">';
    html += '<div style="flex:1;font-size:14px;font-weight:' + (isActive ? '700' : '600') + ';color:' + (isComplete ? 'var(--sw-text-sec)' : 'var(--sw-dark)') + ';' +
      (isComplete ? 'text-decoration:line-through;' : '') + '">' + escapeHtml(step.name) + '</div>';

    // Unread badge
    if (stepUnread > 0) {
      html += '<span style="display:inline-block;padding:2px 7px;border-radius:10px;background:#3498DB;color:#fff;font-size:10px;font-weight:700;">' + stepUnread + '</span>';
    } else if (stepEmails.length > 0) {
      html += '<span style="font-size:11px;color:var(--sw-text-sec);">&#128233; ' + stepEmails.length + '</span>';
    }

    html += '</div>';

    // Vendor + time info
    if (step.vendor) {
      html += '<div style="font-size:11px;color:var(--sw-text-sec);margin-top:2px;">' + escapeHtml(step.vendor) + (step.vendor_email ? ' — ' + escapeHtml(step.vendor_email) : '') + '</div>';
    } else if (!isComplete) {
      html += '<div style="margin-top:2px;"><button onclick="event.stopPropagation();toggleCouncilVendorEditor(\'' + sub.id + '\',' + idx + ')" style="background:none;border:none;padding:0;font-size:10px;color:var(--sw-orange,#F15A29);cursor:pointer;text-decoration:underline;">+ Set vendor</button></div>';
    }
    // Skip button for pending future steps
    if (isPending && idx > sub.current_step_index) {
      html += '<div style="margin-top:4px;"><button onclick="event.stopPropagation();skipCouncilStep(\'' + sub.id + '\',' + idx + ',\'' + escapeHtml(step.name).replace(/'/g, "\\'") + '\')" style="background:none;border:none;padding:0;font-size:10px;color:var(--sw-text-sec);cursor:pointer;text-decoration:underline;">Skip this step</button></div>';
    }
    if (step.started_at && !isComplete) {
      var daysIn = Math.floor((Date.now() - new Date(step.started_at).getTime()) / 86400000);
      if (daysIn > 0) {
        var daysColor = daysIn > 7 ? '#E74C3C' : daysIn > 3 ? '#D97706' : 'var(--sw-text-sec)';
        html += '<div style="font-size:11px;color:' + daysColor + ';margin-top:2px;font-weight:' + (daysIn > 7 ? '700' : '400') + ';">' + daysIn + ' days in this step</div>';
      }
    }
    if (step.completed_at) {
      html += '<div style="font-size:11px;color:var(--sw-text-sec);margin-top:2px;">Completed ' + councilRelativeTime(step.completed_at) + ' ago</div>';
    }
    if (step.notes) {
      html += '<div style="font-size:11px;color:var(--sw-text-sec);margin-top:2px;font-style:italic;">' + escapeHtml(step.notes) + '</div>';
    }

    html += '</div>'; // end right
    html += '</div>'; // end step row
  });

  html += '</div>'; // end timeline

  // ── Unified Conversation ──
  var allEmails = (sub.email_threads || []).sort(function(a, b) {
    return new Date(a.created_at || a.sent_at || 0) - new Date(b.created_at || b.sent_at || 0);
  });

  // Build filter chips from unique email parties
  var parties = {};
  allEmails.forEach(function(em) {
    var addr = em.direction === 'inbound' || em.direction === 'received' ? em.from_email : em.to_email;
    if (addr && addr.indexOf('secureworks') === -1 && addr.indexOf('orders+') === -1) {
      var domain = addr.split('@')[1] || '';
      var label = domain.split('.')[0] || addr;
      // Try to match to a step vendor
      (sub.steps || []).forEach(function(s) {
        if (s.vendor_email === addr && s.vendor) label = s.vendor;
      });
      if (!parties[addr]) parties[addr] = { label: label, addr: addr };
    }
  });
  var partyList = Object.values(parties);

  // Filter chips
  html += '<div style="padding:12px 16px 8px;background:var(--sw-card,#fff);border-top:1px solid var(--sw-border,#E0E0E0);">';
  html += '<div style="font-size:13px;font-weight:700;color:var(--sw-dark);margin-bottom:8px;">Conversation</div>';
  html += '<div id="councilFilterChips" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">';
  html += '<button class="council-filter-chip active" onclick="filterCouncilEmails(-1)" data-filter="-1" style="padding:4px 12px;border-radius:100px;border:1px solid var(--sw-border);background:var(--sw-dark);color:#fff;font-size:11px;font-weight:600;cursor:pointer;">All (' + allEmails.length + ')</button>';
  partyList.forEach(function(p) {
    var count = allEmails.filter(function(em) { return em.from_email === p.addr || em.to_email === p.addr; }).length;
    html += '<button class="council-filter-chip" onclick="filterCouncilEmails(-1,\'' + escapeHtml(p.addr) + '\')" data-filter="' + escapeHtml(p.addr) + '" style="padding:4px 12px;border-radius:100px;border:1px solid var(--sw-border);background:var(--sw-card,#fff);color:var(--sw-dark);font-size:11px;font-weight:500;cursor:pointer;">' + escapeHtml(p.label) + ' (' + count + ')</button>';
  });
  html += '</div></div>';

  // Messages
  html += '<div id="councilMessages" style="padding:16px;display:flex;flex-direction:column;gap:8px;">';

  if (allEmails.length === 0) {
    html += '<div style="text-align:center;padding:40px 20px;color:var(--sw-text-sec);font-size:13px;">';
    html += '<div style="font-size:32px;margin-bottom:8px;">📧</div>';
    html += 'No emails yet. Use the compose bar below to send the first message.';
    html += '</div>';
  } else {
    allEmails.forEach(function(em) {
      var isInbound = em.direction === 'inbound' || em.direction === 'received';
      var ts = em.created_at || em.sent_at || em.received_at;
      var align = isInbound ? 'flex-start' : 'flex-end';
      var bubbleBg = isInbound ? '#F0ECE8' : '#FEF3EF';
      var bubbleBorder = isInbound ? '12px 12px 12px 2px' : '12px 12px 2px 12px';

      // Data attributes for filtering
      var filterAddr = isInbound ? (em.from_email || '') : (em.to_email || '');
      var stepIdx = em.council_step_index != null ? em.council_step_index : -1;
      var stepName = stepIdx >= 0 && sub.steps[stepIdx] ? sub.steps[stepIdx].name : '';

      html += '<div class="council-msg-item" data-addr="' + escapeHtml(filterAddr) + '" data-step="' + stepIdx + '" style="display:flex;flex-direction:column;align-items:' + align + ';max-width:82%;">';

      // Step badge
      if (stepName) {
        html += '<div style="font-size:9px;padding:2px 8px;border-radius:8px;background:rgba(41,60,70,0.06);color:var(--sw-text-sec);font-weight:500;margin-bottom:3px;">' + escapeHtml(stepName) + '</div>';
      }

      // AI classification pill (inbound only)
      if (isInbound && em.ai_classification) {
        var confColor = (em.ai_confidence && em.ai_confidence > 0.8) ? '#27AE60' : '#D97706';
        html += '<div style="font-size:9px;padding:2px 8px;border-radius:8px;background:' + confColor + '15;color:' + confColor + ';font-weight:600;margin-bottom:3px;">' + escapeHtml(em.ai_classification) + '</div>';
      }

      // From/To/CC info
      if (isInbound) {
        html += '<div style="font-size:10px;color:var(--sw-text-sec);margin-bottom:2px;padding:0 4px;">From: ' + escapeHtml(em.from_email || '') + '</div>';
      } else {
        var toInfo = 'To: ' + escapeHtml(em.to_email || '');
        var ccEmails = em.cc_emails || [];
        if (Array.isArray(ccEmails) && ccEmails.length > 0) {
          toInfo += ' · CC: ' + ccEmails.map(function(c) { return escapeHtml(c); }).join(', ');
        }
        html += '<div style="font-size:10px;color:var(--sw-text-sec);margin-bottom:2px;padding:0 4px;">' + toInfo + '</div>';
      }

      // Bubble
      html += '<div style="background:' + bubbleBg + ';border-radius:' + bubbleBorder + ';padding:10px 14px;">';
      if (em.subject) {
        html += '<div style="font-size:11px;font-weight:700;color:var(--sw-dark);margin-bottom:4px;">' + escapeHtml(em.subject) + '</div>';
      }
      var bodyText = em.body_text || '';
      html += '<div style="font-size:13px;color:var(--sw-dark);line-height:1.5;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(bodyText) + '</div>';

      // Attachments
      var atts = em.attachments_json || em.attachments || [];
      if (Array.isArray(atts) && atts.length > 0) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;">';
        atts.forEach(function(att) {
          var name = att.filename || att.name || 'Document';
          var url = att.storage_url || att.url || '';
          html += '<a href="' + escapeHtml(url) + '" target="_blank" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(255,255,255,0.7);border:1px solid var(--sw-border,#E0E0E0);border-radius:8px;font-size:11px;color:var(--sw-dark);text-decoration:none;font-weight:600;">📎 ' + escapeHtml(name) + '</a>';
        });
        html += '</div>';
      }

      html += '</div>'; // end bubble

      // Timestamp
      var senderText = isInbound ? escapeHtml(em.from_email || '') : 'You';
      html += '<div style="font-size:10px;color:var(--sw-text-sec);margin-top:3px;padding:0 4px;">' + senderText + ' · ' + councilRelativeTime(ts) + '</div>';

      html += '</div>'; // end message container
    });
  }

  html += '</div>'; // end messages

  // ── Compose bar (inline in detail view) ──
  html += '<div style="padding:12px 16px;background:var(--sw-card,#fff);border-top:1px solid var(--sw-border,#E0E0E0);display:flex;flex-direction:column;gap:6px;">';
  // To field
  var lastInbound = null;
  for (var li = allEmails.length - 1; li >= 0; li--) {
    if (allEmails[li].direction === 'inbound' || allEmails[li].direction === 'received') { lastInbound = allEmails[li]; break; }
  }
  var defaultTo = lastInbound ? (lastInbound.from_email || '') : '';
  var defaultCc = 'admin@secureworkswa.com.au';
  if (lastInbound && Array.isArray(lastInbound.cc_emails) && lastInbound.cc_emails.length > 0) {
    defaultCc = lastInbound.cc_emails.concat(['admin@secureworkswa.com.au']).filter(function(v, i, a) { return a.indexOf(v) === i; }).join(', ');
  }
  html += '<input type="text" id="councilDetailTo" placeholder="To: email..." value="' + escapeHtml(defaultTo) + '" style="padding:8px 14px;border:1px solid var(--sw-border);border-radius:20px;font-size:12px;font-family:inherit;outline:none;width:100%;box-sizing:border-box;">';
  html += '<input type="text" id="councilDetailCc" placeholder="CC: (comma-separated)" value="' + escapeHtml(defaultCc) + '" style="padding:8px 14px;border:1px solid var(--sw-border);border-radius:20px;font-size:12px;font-family:inherit;outline:none;width:100%;box-sizing:border-box;">';
  html += '<div style="display:flex;align-items:flex-end;gap:8px;">';
  html += '<textarea id="councilDetailMsg" placeholder="Type a message..." rows="1" style="flex:1;padding:10px 14px;border:1px solid var(--sw-border);border-radius:20px;font-size:13px;font-family:inherit;resize:none;outline:none;max-height:100px;line-height:1.4;" oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,100)+\'px\'"></textarea>';
  html += '<button onclick="sendCouncilDetailMessage(\'' + sub.id + '\')" style="width:40px;height:40px;border-radius:50%;background:var(--sw-orange,#F15A29);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>';
  html += '</div>';
  html += '<div style="text-align:center;"><button onclick="openCouncilEmailCompose(\'' + sub.id + '\',0)" style="background:none;border:none;color:var(--sw-text-sec);font-size:11px;cursor:pointer;text-decoration:underline;">Open full compose (with attachments)</button></div>';
  html += '</div>';

  content.innerHTML = html;

  // Inject pulse animation if not already present
  if (!document.getElementById('councilPulseStyle')) {
    var style = document.createElement('style');
    style.id = 'councilPulseStyle';
    style.textContent = '@keyframes councilPulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }';
    document.head.appendChild(style);
  }

  // Slide in
  requestAnimationFrame(function() {
    view.style.transform = 'translateX(0)';
  });
}

/**
 * Close the detail view. Slides out to right.
 */
function closeCouncilDetail() {
  var view = document.getElementById('councilDetailView');
  if (!view) return;
  view.style.transform = 'translateX(100%)';
  _councilDetailSubId = null;
}

// ────────────────────────────────────────────────────────────
// UNIFIED CONVERSATION HELPERS
// ────────────────────────────────────────────────────────────

// Filter council emails by party address or step index
function filterCouncilEmails(stepIdx, partyAddr) {
  var msgs = document.querySelectorAll('.council-msg-item');
  var chips = document.querySelectorAll('.council-filter-chip');

  // Update chip active states
  chips.forEach(function(chip) {
    var isAll = chip.getAttribute('data-filter') === '-1';
    var isMatch = partyAddr ? chip.getAttribute('data-filter') === partyAddr : (stepIdx === -1 && isAll);
    chip.style.background = isMatch ? 'var(--sw-dark,#293C46)' : 'var(--sw-card,#fff)';
    chip.style.color = isMatch ? '#fff' : 'var(--sw-dark,#293C46)';
  });

  // Show/hide messages
  msgs.forEach(function(msg) {
    var show = true;
    if (partyAddr) {
      show = msg.getAttribute('data-addr') === partyAddr;
    } else if (stepIdx >= 0) {
      show = msg.getAttribute('data-step') === String(stepIdx);
    }
    msg.style.display = show ? '' : 'none';
  });
}

// Send message from the unified detail compose bar
async function sendCouncilDetailMessage(subId) {
  var toEl = document.getElementById('councilDetailTo');
  var ccEl = document.getElementById('councilDetailCc');
  var msgEl = document.getElementById('councilDetailMsg');

  if (!msgEl || !toEl) return;
  var body = msgEl.value.trim();
  var toEmail = toEl.value.trim();

  if (!toEmail) { showToast('Enter recipient email', 'warning'); return; }
  if (!toEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { showToast('Invalid email', 'warning'); return; }
  if (!body) { showToast('Type a message first', 'warning'); return; }

  var ccList = ccEl ? ccEl.value.split(',').map(function(e) { return e.trim(); }).filter(function(e) { return e.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/); }) : [];

  var sub = _councilSubmissions.find(function(s) { return s.id === subId; });
  if (!sub) return;

  // Determine step index from current step
  var stepIdx = sub.current_step_index || 0;

  // Check for existing thread to reply to
  var allEmails = (sub.email_threads || []).sort(function(a, b) {
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });
  var lastEmail = allEmails.length > 0 ? allEmails[allEmails.length - 1] : null;
  var inReplyTo = lastEmail ? (lastEmail.message_id || '') : '';

  var subject = (allEmails.length > 0 ? 'Re: ' : '') + (sub.job_number || '') + ' — Council Approval — SecureWorks Group';

  msgEl.value = '';
  msgEl.style.height = 'auto';

  try {
    var payload = {
      submission_id: subId,
      step_index: stepIdx,
      to_email: toEmail,
      subject: subject,
      body_text: body,
    };
    if (inReplyTo) payload.in_reply_to = inReplyTo;
    if (ccList.length > 0) payload.cc = ccList;

    await opsPost('send_council_email', payload);
    showToast('Email sent to ' + toEmail, 'success');

    // Save vendor email if step doesn't have one
    var step = (sub.steps || [])[stepIdx];
    if (step && !step.vendor_email) {
      try {
        await opsPost('update_council_status', { submission_id: subId, step_index: stepIdx, vendor_email: toEmail });
      } catch (e2) { /* non-critical */ }
    }

    await loadApprovals();
    openCouncilDetail(subId);
  } catch (e) {
    showToast('Failed to send: ' + e.message, 'warning');
  }
}

// ────────────────────────────────────────────────────────────
// EXISTING FUNCTIONS (preserved)
// ────────────────────────────────────────────────────────────

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

async function sendCouncilStepReply(submissionId, stepIndex, toEmail, inReplyTo) {
  var stepKey = submissionId + '_' + stepIndex;
  var textEl = document.getElementById('councilReply_' + stepKey);
  if (!textEl) return;
  var body = textEl.value.trim();
  if (!body) { showToast('Type a message first', 'warning'); return; }

  var sub = _councilSubmissions.find(function(s) { return s.id === submissionId; });
  var step = sub ? (sub.steps || [])[stepIndex] : null;
  var subject = (sub ? (sub.job_number || '') : '') + ' — ' + (step ? step.name : 'Council') + ' — SecureWorks Group';

  textEl.value = '';
  textEl.rows = 1;

  try {
    var payload = {
      submission_id: submissionId,
      step_index: stepIndex,
      to_email: toEmail,
      subject: 'Re: ' + subject,
      body_text: body,
    };
    if (inReplyTo) payload.in_reply_to = inReplyTo;
    await opsPost('send_council_email', payload);
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
  var subject = (sub ? (sub.job_number || '') : '') + ' — ' + (step ? step.name : 'Council') + ' — SecureWorks Group';

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
  var subject = (sub.job_number || '') + ' — ' + (step.name || 'Council Application') + ' — SecureWorks Group';
  var body = 'Hi,\n\nRegarding the ' + (step.name || 'application') + ' for ' + (sub.job_number || '') + ' — ' + (sub.client_name || '') + '.\n\n\n\nThanks,\nSecureWorks Group';

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
  var ccEl = document.getElementById('poComposeCc');
  if (ccEl) ccEl.value = '';

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

// ────────────────────────────────────────────────────────────
// VENDOR EDITOR (inline on step timeline)
// ────────────────────────────────────────────────────────────

function toggleCouncilVendorEditor(subId, stepIdx) {
  var el = document.getElementById('councilVendorSet_' + stepIdx);
  if (!el) return;
  var sub = _councilSubmissions.find(function(s) { return s.id === subId; });
  var step = sub && sub.steps ? sub.steps[stepIdx] : null;

  el.innerHTML = '<div style="display:flex;flex-direction:column;gap:4px;margin-top:4px;">' +
    '<input type="text" id="councilVendorName_' + stepIdx + '" placeholder="Vendor name (e.g. PS Engineering)" value="' + escapeHtml((step && step.vendor) || '') + '" style="padding:6px 10px;border:1px solid var(--sw-border);border-radius:6px;font-size:12px;font-family:inherit;">' +
    '<input type="email" id="councilVendorEmail_' + stepIdx + '" placeholder="Vendor email" value="' + escapeHtml((step && step.vendor_email) || '') + '" style="padding:6px 10px;border:1px solid var(--sw-border);border-radius:6px;font-size:12px;font-family:inherit;">' +
    '<div style="display:flex;gap:6px;">' +
    '<button onclick="saveCouncilVendor(\'' + subId + '\',' + stepIdx + ')" style="padding:4px 12px;background:var(--sw-orange,#F15A29);color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">Save</button>' +
    '<button onclick="openCouncilDetail(\'' + subId + '\')" style="padding:4px 12px;background:var(--sw-border);color:var(--sw-dark);border:none;border-radius:4px;font-size:11px;cursor:pointer;">Cancel</button>' +
    '</div></div>';
}

async function saveCouncilVendor(subId, stepIdx) {
  var nameEl = document.getElementById('councilVendorName_' + stepIdx);
  var emailEl = document.getElementById('councilVendorEmail_' + stepIdx);
  var vendor = nameEl ? nameEl.value.trim() : '';
  var vendorEmail = emailEl ? emailEl.value.trim() : '';

  if (!vendor) { showToast('Enter vendor name', 'warning'); return; }

  try {
    await opsPost('update_council_status', {
      submission_id: subId,
      step_index: stepIdx,
      vendor: vendor,
      vendor_email: vendorEmail
    });
    showToast('Vendor saved: ' + vendor, 'success');
    await loadApprovals();
    openCouncilDetail(subId);
  } catch (e) {
    showToast('Failed to save vendor: ' + e.message, 'warning');
  }
}

// ────────────────────────────────────────────────────────────
// SKIP STEP
// ────────────────────────────────────────────────────────────

async function skipCouncilStep(subId, stepIdx, stepName) {
  if (!confirm('Skip "' + stepName + '"? This will mark it as complete and move to the next step.')) return;

  try {
    await opsPost('update_council_status', {
      submission_id: subId,
      step_index: stepIdx,
      status: 'complete',
      notes: 'Skipped'
    });
    showToast('Skipped: ' + stepName, 'success');
    await loadApprovals();
    openCouncilDetail(subId);
  } catch (e) {
    showToast('Failed to skip step: ' + e.message, 'warning');
  }
}
