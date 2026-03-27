// ════════════════════════════════════════════════════════════
// CLEAR DEBT v4 — Polish, Timeline & Smart Context
// ════════════════════════════════════════════════════════════

var _clearDebtData = null;
var _clearDebtFilter = 'all';
var _clearDebtSearch = '';
var _clearDebtViewMode = 'cards';
var _clearDebtSort = { col: 'priority', asc: false };
var _clearDebtMaxOwed = 1; // cached max total_owed for normalised scoring
var _expandedClient = null;
var _expandedTab = 'invoices';
var _expandedInvoice = null;
var _commsCache = {};

var _debtClassLabels = {
  unclassified: { label: 'Unclassified', icon: '\u2B1C', color: '#999', short: 'Triage' },
  genuine_debt: { label: 'Genuine Debt', icon: '\uD83D\uDD34', color: '#e74c3c', short: 'Chase' },
  blocked_by_us: { label: 'Blocked by Us', icon: '\uD83D\uDFE1', color: '#f39c12', short: 'Blocked' },
  in_dispute: { label: 'In Dispute', icon: '\uD83D\uDFE0', color: '#e67e22', short: 'Dispute' },
  bad_debt: { label: 'Bad Debt', icon: '\u26AB', color: '#2c3e50', short: 'Written Off' },
};

// ── Helpers ──
function _fmtPhone(p) {
  if (!p) return '';
  var clean = p.replace(/[\s\-\(\)\.]/g, '');
  if (clean.startsWith('+61')) clean = '0' + clean.slice(3);
  if (clean.startsWith('61') && clean.length === 11) clean = '0' + clean.slice(2);
  if (clean.length === 10 && clean.startsWith('0')) return clean.slice(0,4)+' '+clean.slice(4,7)+' '+clean.slice(7);
  return p;
}
function _worstClassification(invoices) {
  var p = ['genuine_debt','in_dispute','blocked_by_us','unclassified','bad_debt'];
  for (var i=0;i<p.length;i++) { if (invoices.some(function(inv){return inv.classification===p[i];})) return p[i]; }
  return 'unclassified';
}
function _oldestDays(invoices) { return Math.max.apply(null, invoices.map(function(inv){return inv.days_overdue||0;})); }
function _lastChaseDesc(invoices) {
  var icons = {call:'\uD83D\uDCDE',sms:'\uD83D\uDCAC',auto_sms:'\uD83E\uDD16',email:'\uD83D\uDCE7',note:'\uD83D\uDCDD',status_change:'\uD83C\uDFF7'};
  var all = []; invoices.forEach(function(inv){all=all.concat(inv.chase_logs||[]);});
  all.sort(function(a,b){return new Date(b.created_at)-new Date(a.created_at);});
  if (!all.length) return 'Never';
  var l=all[0]; return (icons[l.method]||'')+' '+fmtDate(l.created_at)+(l.outcome?' \u2014 '+l.outcome:'');
}
function _fmtDateShort(d) { if (!d) return ''; return new Date(d).toLocaleDateString('en-AU',{day:'numeric',month:'short'}); }
function _filterClients(data) {
  if (!data||!data.clients) return [];
  var today = new Date().toISOString().slice(0,10);
  return data.clients.filter(function(c) {
    if (_clearDebtSearch) {
      var hay=((c.contact_name||'')+' '+c.invoices.map(function(i){return (i.invoice_number||'')+' '+(i.job_number||'')+' '+(i.reference||'')+' '+(i.site_suburb||'');}).join(' ')).toLowerCase();
      if (hay.indexOf(_clearDebtSearch)===-1) return false;
    }
    if (_clearDebtFilter==='all') return true;
    if (_clearDebtFilter==='followups') return c.invoices.some(function(inv){return inv.next_follow_up&&inv.next_follow_up<=today;});
    return c.invoices.some(function(inv){return inv.classification===_clearDebtFilter;});
  });
}
function _esc(s){return (s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');}

// Build one-line scope snapshot for collapsed card
function _buildScopeSnapshot(client) {
  var jobsSeen = {}, primary = null, jobCount = 0;
  client.invoices.forEach(function(inv) {
    if (inv.job_id && !jobsSeen[inv.job_id]) {
      jobsSeen[inv.job_id] = true; jobCount++;
      if (!primary || (Number(inv.amount_due) > Number(primary.amount_due))) primary = inv;
    }
  });
  var suburbs = []; client.invoices.forEach(function(inv){ if (inv.site_suburb && suburbs.indexOf(inv.site_suburb)<0) suburbs.push(inv.site_suburb); });
  var pin = suburbs.length ? '\uD83D\uDCCD '+suburbs.join(', ')+' \u2014 ' : '';
  if (!primary || !primary.job_id) return pin ? pin+'<span style="color:var(--sw-orange);">No job linked</span>' : '<span style="color:var(--sw-orange);">\uD83D\uDCCD No job linked</span>';

  var desc = '';
  var scope = typeof primary.scope_json === 'string' ? JSON.parse(primary.scope_json||'{}') : (primary.scope_json||{});
  if (primary.job_type === 'fencing' && scope && Object.keys(scope).length > 0) {
    var fj = scope.job || scope;
    var runs = fj.runs || scope.sections || [];
    var totalM = runs.reduce(function(s,r){return s+(r.length||r.totalLength||r.lengthM||0);},0);
    var gates = fj.gates || [];
    desc = Math.round(totalM)+'m';
    if (fj.sheetColour||fj.colour) desc += ' '+(fj.sheetColour||fj.colour);
    desc += ' fence';
    if (gates.length) desc += ' + '+gates.length+' gate'+(gates.length!==1?'s':'');
  } else if (scope && Object.keys(scope).length > 0) {
    var cfg = scope.config || {};
    if (cfg.length && cfg.projection) {
      desc = cfg.length+'m \u00D7 '+cfg.projection+'m';
      if (cfg.roofStyle) desc += ' '+cfg.roofStyle;
      desc += ' patio';
      if (cfg.sheetColor) { var sc = typeof cfg.sheetColor==='object'?cfg.sheetColor.name:cfg.sheetColor; if(sc) desc += ', '+sc; }
    } else {
      desc = (primary.job_type||'Job').charAt(0).toUpperCase()+(primary.job_type||'job').slice(1)+' job';
      if (primary.job_number) desc += ' \u00B7 '+primary.job_number;
    }
  } else {
    desc = (primary.job_type||'Job').charAt(0).toUpperCase()+(primary.job_type||'job').slice(1)+' job';
    if (primary.job_number) desc += ' \u00B7 '+primary.job_number;
  }
  if (jobCount > 1) desc += ' <span style="color:var(--sw-text-sec);font-size:10px;">+ '+(jobCount-1)+' more</span>';
  return pin + desc;
}

// ── Completeness score ──
function _completenessScore(client) {
  var score = 0, total = 7;
  var hasJob = client.invoices.some(function(i){return !!i.job_id;});
  var hasStatus = client.invoices.some(function(i){return !!i.job_status;});
  var hasScope = client.invoices.some(function(i){
    var s = typeof i.scope_json==='string'?JSON.parse(i.scope_json||'{}'):(i.scope_json||{});
    return s && Object.keys(s).length > 0;
  });
  var hasQuote = client.invoices.some(function(i){
    var p = typeof i.pricing_json==='string'?JSON.parse(i.pricing_json||'{}'):(i.pricing_json||{});
    return p && (p.totalIncGST || p.total);
  });
  var hasChase = client.invoices.some(function(i){return i.chase_logs && i.chase_logs.length > 0;});
  var hasComms = !!client.ghl_contact_id;
  var worst = _worstClassification(client.invoices);
  var hasFollowUp = worst!=='genuine_debt' || client.invoices.some(function(i){return !!i.next_follow_up;});
  if (hasJob) score++; if (hasStatus) score++; if (hasScope) score++;
  if (hasQuote) score++; if (hasChase) score++; if (hasComms) score++;
  if (hasFollowUp) score++;
  return {score: score, total: total};
}

// ── Red flag / risk badges ──
function _computeRedFlags(client) {
  var flags = [];
  var today = new Date();
  var todayStr = today.toISOString().slice(0,10);

  // Quote blowout
  var quotedVal = 0, invoicedTotal = 0;
  client.invoices.forEach(function(inv) {
    invoicedTotal += Number(inv.total) || 0;
    var p = typeof inv.pricing_json === 'string' ? JSON.parse(inv.pricing_json||'{}') : (inv.pricing_json||{});
    quotedVal = Math.max(quotedVal, p.totalIncGST || p.total || 0);
  });
  if (quotedVal > 0 && invoicedTotal > quotedVal * 1.3) {
    flags.push({key:'quote_blowout', label:'\uD83D\uDCCA '+(invoicedTotal/quotedVal).toFixed(1)+'x quote', priority:1});
  }

  // No chase activity (overdue 7d+ with no logs)
  var hasAnyChaseLogs = client.invoices.some(function(inv){return inv.chase_logs && inv.chase_logs.length > 0;});
  var hasOld = client.invoices.some(function(inv){return inv.days_overdue >= 7;});
  if (!hasAnyChaseLogs && hasOld) {
    flags.push({key:'no_chase', label:'\uD83D\uDCDD No chase activity', priority:2});
  }

  // Stale follow-up
  if (client.invoices.some(function(inv){return inv.next_follow_up && inv.next_follow_up <= todayStr;})) {
    flags.push({key:'stale_followup', label:'\u23F0 Overdue follow-up', priority:3});
  }

  // Repeat chaser (3+ manual attempts, no payment received)
  var allLogs = [];
  client.invoices.forEach(function(inv){ if(inv.chase_logs) allLogs = allLogs.concat(inv.chase_logs); });
  var manualCount = allLogs.filter(function(l){return l.method==='call'||l.method==='sms'||l.method==='email';}).length;
  var hasPaid = allLogs.some(function(l){return l.outcome==='Payment received';});
  if (manualCount >= 3 && !hasPaid) {
    flags.push({key:'repeat_chaser', label:'\uD83D\uDD04 '+manualCount+' chases', priority:4});
  }

  // Comms gone cold (14+ days)
  if (allLogs.length > 0) {
    allLogs.sort(function(a,b){return new Date(b.created_at)-new Date(a.created_at);});
    var daysSince = Math.floor((today - new Date(allLogs[0].created_at)) / 86400000);
    if (daysSince >= 14) flags.push({key:'comms_cold', label:'\uD83D\uDCAC Cold '+daysSince+'d', priority:5});
  }

  // First client (from backend)
  if (client.first_client) {
    flags.push({key:'first_client', label:'\uD83C\uDD95 First client', priority:6});
  }

  // No job linked
  if (client.invoices.some(function(inv){return !inv.job_id;})) {
    flags.push({key:'no_job', label:'\uD83D\uDD17 Unlinked invoice', priority:7});
  }

  flags.sort(function(a,b){return a.priority - b.priority;});
  return flags;
}
function _renderRedFlagPills(flags, max) {
  var show = max ? flags.slice(0,max) : flags;
  if (!show.length) return '';
  return '<div style="display:flex;gap:4px;margin-top:3px;flex-wrap:wrap;">'+show.map(function(f){
    return '<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:#fff3cd;color:#856404;font-weight:500;">'+f.label+'</span>';
  }).join('')+'</div>';
}

// ── Chase narrative + suggested next step ──
function _buildChaseNarrative(client) {
  var today = new Date();
  var todayStr = today.toISOString().slice(0,10);

  // Gather ALL chase logs across ALL invoices, sorted newest first
  var allLogs = [];
  client.invoices.forEach(function(inv){ if(inv.chase_logs) allLogs = allLogs.concat(inv.chase_logs); });
  allLogs.sort(function(a,b){return new Date(b.created_at)-new Date(a.created_at);});

  var autoCount = allLogs.filter(function(l){return l.method==='auto_sms';}).length;
  var manualLogs = allLogs.filter(function(l){return l.method==='call'||l.method==='sms'||l.method==='email';});
  var promises = allLogs.filter(function(l){return l.outcome==='Promised to pay';});
  var lastLog = allLogs.length > 0 ? allLogs[0] : null;
  var daysSinceLast = lastLog ? Math.floor((today - new Date(lastLog.created_at)) / 86400000) : null;

  // Build narrative
  var parts = [];
  if (autoCount > 0) {
    var autoDates = allLogs.filter(function(l){return l.method==='auto_sms';}).slice(0,3).map(function(l){return _fmtDateShort(l.created_at);}).join(', ');
    parts.push(autoCount+' auto-reminder'+(autoCount!==1?'s':'')+' sent ('+autoDates+')');
  }
  manualLogs.slice(0,3).forEach(function(log) {
    var who = log.chased_by ? log.chased_by.split('@')[0] : '';
    var method = log.method==='call'?'called':log.method==='sms'?'SMS\'d':'emailed';
    parts.push((who?who+' ':'')+method+' '+_fmtDateShort(log.created_at)+(log.outcome?' \u2014 '+log.outcome:''));
  });
  if (promises.length > 0) {
    var lastPromise = promises[0];
    var promiseDate = lastPromise.follow_up_date || lastPromise.created_at;
    if (promiseDate && promiseDate < todayStr) {
      parts.push('Promise to pay passed with no payment');
    }
  }
  if (daysSinceLast !== null && daysSinceLast > 14) parts.push('No contact in '+daysSinceLast+' days');
  if (allLogs.length === 0) parts.push('No chase activity yet');

  var summary = parts.join('. ')+'.';

  // Determine suggestion based on client-level worst classification
  var worst = _worstClassification(client.invoices);
  var suggestion = '';
  var urgency = 'low';

  // Check conditions in priority order
  var hasFollowUpDue = client.invoices.some(function(inv){return inv.next_follow_up && inv.next_follow_up <= todayStr;});
  var hasBrokenPromise = promises.length > 0 && promises[0].follow_up_date && promises[0].follow_up_date < todayStr;

  if (worst === 'blocked_by_us') {
    suggestion = 'Resolve internal blocker before chasing';
    urgency = 'medium';
  } else if (worst === 'in_dispute') {
    suggestion = 'Dispute needs resolution \u2014 don\'t chase for payment';
    urgency = 'low';
  } else if (allLogs.length === 0) {
    suggestion = 'Needs first contact \u2014 call or SMS';
    urgency = 'high';
  } else if (hasBrokenPromise) {
    suggestion = 'Follow up on broken promise from ' + _fmtDateShort(promises[0].follow_up_date);
    urgency = 'high';
  } else if (hasFollowUpDue) {
    suggestion = 'Follow-up is due \u2014 contact ' + (client.contact_name||'').split(' ')[0];
    urgency = 'high';
  } else if (autoCount > 0 && manualLogs.length === 0) {
    suggestion = 'Auto-reminders haven\'t worked \u2014 needs a manual call';
    urgency = 'high';
  } else if (manualLogs.length >= 3 && !allLogs.some(function(l){return l.outcome==='Payment received';})) {
    suggestion = 'Consider escalation or formal demand';
    urgency = 'medium';
  } else if (daysSinceLast !== null && daysSinceLast < 3) {
    suggestion = 'Chased '+daysSinceLast+'d ago \u2014 wait for response';
    urgency = 'low';
  } else {
    suggestion = 'Follow up with ' + (client.contact_name||'').split(' ')[0];
    urgency = 'medium';
  }

  // Mixed classification note
  var unclassCount = client.invoices.filter(function(inv){return inv.classification==='unclassified';}).length;
  if (unclassCount > 0 && worst !== 'unclassified') {
    suggestion += ' (also '+unclassCount+' unclassified inv \u2014 triage needed)';
  }

  return { summary: summary, suggestion: suggestion, urgency: urgency };
}

// ── Chase priority scoring (client-level) ──
function _chasePriorityScore(client) {
  var score = 0;
  var today = new Date();

  // Classification weight — use worst (most actionable) across all invoices
  var worst = _worstClassification(client.invoices);
  if (worst==='genuine_debt') score += 10;
  else if (worst==='unclassified') score += 5;
  // blocked/dispute/bad_debt = 0

  // Amount (normalised 0-10)
  score += (_clearDebtMaxOwed > 0 ? ((client.total_owed||0) / _clearDebtMaxOwed) * 10 : 0);

  // Age (0-10, capped at 90 days)
  var oldest = _oldestDays(client.invoices);
  score += Math.min(oldest / 9, 10);

  // Chase recency — CLIENT-LEVEL: gather all logs across all invoices
  var allLogs = [];
  client.invoices.forEach(function(inv){ if(inv.chase_logs) allLogs = allLogs.concat(inv.chase_logs); });
  allLogs.sort(function(a,b){return new Date(b.created_at)-new Date(a.created_at);});
  if (allLogs.length > 0) {
    var daysSinceChase = Math.floor((today - new Date(allLogs[0].created_at)) / 86400000);
    if (daysSinceChase < 3) score -= 5;
    else if (daysSinceChase < 7) score -= 2;
    if (daysSinceChase >= 14) score += 3; // stale boost
  } else {
    score += 3; // never chased = stale
  }

  // Follow-up boost
  var todayStr = today.toISOString().slice(0,10);
  if (client.invoices.some(function(inv){return inv.next_follow_up && inv.next_follow_up <= todayStr;})) score += 5;

  return score;
}

// ── Sort clients ──
function _sortClients(clients) {
  var col=_clearDebtSort.col, asc=_clearDebtSort.asc;
  return clients.slice().sort(function(a,b) {
    var va,vb;
    if (col==='name'){va=a.contact_name||'';vb=b.contact_name||'';return asc?va.localeCompare(vb):vb.localeCompare(va);}
    if (col==='priority'){va=_chasePriorityScore(a);vb=_chasePriorityScore(b);}
    else if (col==='invoices'){va=a.invoices.length;vb=b.invoices.length;}
    else if (col==='oldest'){va=_oldestDays(a.invoices);vb=_oldestDays(b.invoices);}
    else {va=a.total_owed||0;vb=b.total_owed||0;} // default: total
    return asc?va-vb:vb-va;
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
    // Cache max owed for priority scoring normalisation
    _clearDebtMaxOwed = Math.max.apply(null, (_clearDebtData.clients||[]).map(function(c){return c.total_owed||0;}).concat([1]));
    renderClearDebtStats(_clearDebtData);
    renderClearDebtFilters();
    _renderClearDebtView();
  } catch(e) { container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sw-red);">Error: '+e.message+'</div>'; }
}
function _renderClearDebtView() {
  if (_clearDebtViewMode==='list') renderClearDebtList(_clearDebtData);
  else renderClearDebtCards(_clearDebtData);
}

// ════════════════════════════════════════════════════════════
// STATS BAR
// ════════════════════════════════════════════════════════════

function renderClearDebtStats(data) {
  var el = document.getElementById('clearDebtStats');
  var s=data.stats||{}, a=data.amounts||{};
  var html = '<div class="stat-card" style="grid-column:span 2;border-left:4px solid var(--sw-red);">';
  html += '<div class="stat-body"><div class="stat-label" style="display:flex;align-items:center;gap:6px;">TOTAL OVERDUE <button onclick="showClassificationGuide()" style="background:none;border:1px solid var(--sw-border);border-radius:50%;width:20px;height:20px;font-size:12px;cursor:pointer;color:var(--sw-text-sec);line-height:1;" title="Classification guide">?</button></div>';
  html += '<div class="stat-value" style="color:var(--sw-red);font-size:24px;">'+fmt$(data.total_outstanding)+'</div>';
  // Xero sync timestamp
  var syncLine = '';
  if (data.last_synced_at) {
    var minsAgo = Math.floor((Date.now() - new Date(data.last_synced_at).getTime()) / 60000);
    var syncColor = minsAgo > 30 ? 'var(--sw-orange)' : 'var(--sw-text-sec)';
    syncLine = ' \u00B7 <span style="color:'+syncColor+';">Xero synced '+minsAgo+'m ago</span> <button onclick="event.stopPropagation();refreshXeroSync()" style="font-size:9px;background:none;border:1px solid var(--sw-border);border-radius:4px;padding:0 4px;cursor:pointer;color:var(--sw-text-sec);">\u21BB</button>';
  }
  html += '<div class="stat-sub">'+data.total_invoices+' invoices \u00B7 '+data.total_clients+' clients'+syncLine+'</div></div></div>';
  ['genuine_debt','blocked_by_us','in_dispute','unclassified','bad_debt'].forEach(function(key) {
    var count=s[key]||0, amount=a[key]||0;
    if (count===0&&key!=='genuine_debt'&&key!=='unclassified') return;
    var c=_debtClassLabels[key], muted=count===0?'opacity:0.5;':'';
    html += '<div class="stat-card" style="cursor:pointer;border-left:3px solid '+c.color+';'+muted+'" onclick="filterClearDebt(\''+key+'\')">';
    html += '<div class="stat-body"><div class="stat-label">'+c.icon+' '+c.label+'</div><div class="stat-value" style="font-size:16px;">'+fmt$(amount)+'</div>';
    html += '<div class="stat-sub">'+count+' invoice'+(count!==1?'s':'')+'</div></div></div>';
  });
  el.innerHTML = html;
}

// ════════════════════════════════════════════════════════════
// FILTER BAR + VIEW TOGGLE + SORT
// ════════════════════════════════════════════════════════════

function renderClearDebtFilters() {
  var el = document.getElementById('clearDebtFilters');
  var filters = [
    {key:'all',label:'All'},{key:'genuine_debt',label:'\uD83D\uDD34 Chase'},{key:'blocked_by_us',label:'\uD83D\uDFE1 Blocked'},
    {key:'in_dispute',label:'\uD83D\uDFE0 Dispute'},{key:'unclassified',label:'\u2B1C Triage'},
    {key:'followups',label:'\u23F0 Follow-ups'},{key:'bad_debt',label:'\u26AB Written Off'},
  ];
  var html = filters.map(function(f){return '<button class="filter-chip'+(_clearDebtFilter===f.key?' active':'')+'" onclick="filterClearDebt(\''+f.key+'\')">'+f.label+'</button>';}).join('');

  // Sort dropdown
  html += '<select style="margin-left:8px;font-size:11px;padding:4px 8px;border:1px solid var(--sw-border);border-radius:6px;background:#fff;color:var(--sw-text-sec);cursor:pointer;" onchange="sortClearDebt(this.value)">';
  html += '<option value="priority"' + (_clearDebtSort.col==='priority'?' selected':'') + '>Sort: Priority</option>';
  html += '<option value="total"' + (_clearDebtSort.col==='total'?' selected':'') + '>Sort: Amount</option>';
  html += '<option value="oldest"' + (_clearDebtSort.col==='oldest'?' selected':'') + '>Sort: Oldest</option>';
  html += '<option value="name"' + (_clearDebtSort.col==='name'?' selected':'') + '>Sort: Name</option>';
  html += '</select>';

  // View toggle
  html += '<div style="margin-left:auto;display:flex;gap:2px;border:1px solid var(--sw-border);border-radius:6px;overflow:hidden;">';
  html += '<button style="padding:4px 10px;font-size:11px;border:none;cursor:pointer;background:'+(_clearDebtViewMode==='cards'?'var(--sw-dark);color:#fff':'#fff;color:var(--sw-text-sec)')+';" onclick="setClearDebtView(\'cards\')">Cards</button>';
  html += '<button style="padding:4px 10px;font-size:11px;border:none;cursor:pointer;background:'+(_clearDebtViewMode==='list'?'var(--sw-dark);color:#fff':'#fff;color:var(--sw-text-sec)')+';" onclick="setClearDebtView(\'list\')">List</button>';
  html += '</div>';
  html += '<input type="text" class="filter-search" id="clearDebtSearch" placeholder="Search name / job# / suburb..." oninput="searchClearDebt(this.value)" style="width:180px;" value="'+(_clearDebtSearch||'')+'">';
  el.innerHTML = html;
}
function filterClearDebt(key){_clearDebtFilter=key;renderClearDebtFilters();_renderClearDebtView();}
function searchClearDebt(q){_clearDebtSearch=(q||'').toLowerCase();_renderClearDebtView();}
function setClearDebtView(mode){_clearDebtViewMode=mode;_expandedClient=null;renderClearDebtFilters();_renderClearDebtView();}
function sortClearDebt(col){
  if (typeof col === 'string' && ['priority','total','oldest','name'].indexOf(col)>=0) {
    _clearDebtSort.col=col; _clearDebtSort.asc=col==='name';
  } else { if(_clearDebtSort.col===col){_clearDebtSort.asc=!_clearDebtSort.asc;}else{_clearDebtSort.col=col;_clearDebtSort.asc=col==='name';} }
  renderClearDebtFilters(); _renderClearDebtView();
}

// ════════════════════════════════════════════════════════════
// CARD VIEW — grouped by client with accordion
// ════════════════════════════════════════════════════════════

function renderClearDebtCards(data) {
  var container = document.getElementById('clearDebtCards');
  var clients = _sortClients(_filterClients(data));
  if (!clients.length) { container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sw-text-sec);">'+(data&&data.clients&&data.clients.length>0?'No clients matching filter.':'No overdue invoices. Nice work!')+'</div>'; return; }
  container.innerHTML = clients.map(function(c){return _renderClientCard(c);}).join('');
}

function _renderClientCard(client) {
  var worst=_worstClassification(client.invoices), wc=_debtClassLabels[worst];
  var oldest=_oldestDays(client.invoices);
  var agingColor=oldest<=30?'#27ae60':oldest<=60?'#f39c12':'#e74c3c';
  var hasGHL=!!client.ghl_contact_id;
  var today=new Date().toISOString().slice(0,10);
  var isExpanded = _expandedClient === (client.xero_contact_id||client.contact_name);
  var clientKey = _esc(client.xero_contact_id||client.contact_name);

  // Gather unique data across invoices
  var suburbs = []; var completedJob = null; var quotedTotal = 0; var invoicedTotal = 0;
  client.invoices.forEach(function(inv) {
    if (inv.site_suburb && suburbs.indexOf(inv.site_suburb)<0) suburbs.push(inv.site_suburb);
    if (inv.days_since_completion && !completedJob) completedJob = inv;
    var p = typeof inv.pricing_json === 'string' ? JSON.parse(inv.pricing_json||'{}') : (inv.pricing_json||{});
    if (p.totalIncGST || p.total) quotedTotal = Math.max(quotedTotal, p.totalIncGST || p.total || 0);
    invoicedTotal += Number(inv.amount_due) + Number(inv.amount_paid || 0);
  });

  var html = '<div class="chase-card" style="background:#fff;border:1px solid var(--sw-border);border-left:4px solid '+wc.color+';border-radius:8px;overflow:hidden;">';

  // ── Clickable header ──
  html += '<div style="padding:16px;cursor:pointer;" onclick="toggleClientExpand(\''+clientKey+'\')">';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">';
  html += '<div style="flex:1;min-width:180px;">';
  html += '<div style="font-weight:700;font-size:16px;color:var(--sw-dark);">'+(client.contact_name||'Unknown')+' <span style="font-size:12px;color:var(--sw-text-sec);font-weight:400;">'+(isExpanded?'\u25B2':'\u25BC')+'</span></div>';
  if (client.phone) html += '<div style="font-size:12px;color:var(--sw-text-sec);">'+_fmtPhone(client.phone)+'</div>';
  html += '</div>';
  html += '<div style="text-align:right;">';
  html += '<div style="font-size:22px;font-weight:700;color:'+agingColor+';font-family:var(--sw-font-num);">'+fmt$(client.total_owed)+'</div>';
  var _cs = _completenessScore(client);
  html += '<div style="font-size:11px;color:var(--sw-text-sec);">'+client.invoices.length+' inv \u00B7 '+oldest+'d oldest'+(_cs.score<_cs.total?' \u00B7 <span style="font-size:10px;padding:1px 5px;border-radius:8px;background:'+(_cs.score>=5?'#27ae6018':'#f39c1218')+';color:'+(_cs.score>=5?'#27ae60':'#f39c12')+';font-weight:600;">'+_cs.score+'/'+_cs.total+'</span>':'')+'</div>';
  // Days since completion badge
  if (completedJob && completedJob.days_since_completion) {
    html += '<div style="font-size:10px;margin-top:2px;padding:1px 6px;border-radius:8px;background:#e74c3c12;color:#e74c3c;font-weight:600;display:inline-block;">Job done '+completedJob.days_since_completion+'d ago</div>';
  }
  html += '</div></div>';

  // Scope + red flags on one line
  var _redFlags = _computeRedFlags(client);
  var fuInv = client.invoices.find(function(inv){return inv.next_follow_up&&inv.next_follow_up<=today;});
  html += '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap;">';
  html += '<span style="font-size:11px;color:var(--sw-text-sec);">'+_buildScopeSnapshot(client)+'</span>';
  if (_redFlags.length > 0) {
    var showFlags = isExpanded ? _redFlags : _redFlags.slice(0,3);
    showFlags.forEach(function(f){ html += '<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:#fff3cd;color:#856404;font-weight:500;">'+f.label+'</span>'; });
  }
  if (fuInv) html += '<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:#fef3f2;color:#e74c3c;font-weight:600;">\u23F0 Follow-up '+_fmtDateShort(fuInv.next_follow_up)+'</span>';
  html += '</div>';

  // Invoice summary pills (collapsed)
  if (!isExpanded) {
    html += '<div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;">';
    client.invoices.forEach(function(inv) {
      var c=_debtClassLabels[inv.classification]||_debtClassLabels.unclassified;
      html += '<span style="font-size:10px;padding:2px 6px;border-radius:6px;background:'+c.color+'12;color:'+c.color+';border:1px solid '+c.color+'30;">'+(inv.invoice_number||'-')+' '+fmt$(inv.amount_due)+' '+c.icon+'</span>';
    });
    html += '</div>';
  }
  html += '</div>'; // end header

  // ── Expanded accordion ──
  if (isExpanded) {
    html += '<div style="border-top:1px solid var(--sw-border);background:#fafafa;">';

    // ── Consolidated context block: narrative + timeline + personality note ──
    var narrative = _buildChaseNarrative(client);
    var urgColors = {high:'#e74c3c',medium:'#f39c12',low:'var(--sw-text-sec)'};
    var timeline = _buildTimeline(client.invoices);
    var pnBtnArgs = '\''+_esc(client.invoices[0]?.xero_invoice_id||'')+'\',\''+(client.invoices.find(function(i){return i.job_id;})?.job_id||'')+'\',\''+(client.ghl_contact_id||'')+'\',\''+_esc(client.contact_name)+'\'';

    html += '<div style="padding:10px 16px;border-bottom:1px solid var(--sw-border);border-left:3px solid '+(urgColors[narrative.urgency]||'var(--sw-text-sec)')+';background:#fafafa;font-size:12px;">';
    // Suggested action (the most important line)
    html += '<div style="color:'+(urgColors[narrative.urgency]||'var(--sw-text-sec)')+';font-weight:600;margin-bottom:4px;">\u2192 '+narrative.suggestion+'</div>';
    // Chase summary (muted, one line)
    html += '<div style="color:var(--sw-text-sec);font-size:11px;">'+narrative.summary+'</div>';
    // Timeline (muted, compact)
    if (timeline) html += '<div style="color:var(--sw-text-sec);font-size:10px;margin-top:4px;overflow-x:auto;white-space:nowrap;">'+timeline+'</div>';
    // Personality note inline (if exists) or subtle add link
    if (client.personality_note) {
      var pn = client.personality_note;
      html += '<div style="font-size:10px;color:var(--sw-text-sec);font-style:italic;margin-top:4px;">"\u200B'+pn.notes+'" <span style="font-size:9px;color:#999;">\u2014 '+(pn.chased_by?pn.chased_by.split('@')[0]:'')+', '+_fmtDateShort(pn.created_at)+'</span> <button onclick="event.stopPropagation();clearDebtPersonalityNote('+pnBtnArgs+')" style="font-size:9px;background:none;border:none;color:var(--sw-mid);cursor:pointer;text-decoration:underline;">edit</button></div>';
    } else {
      html += '<div style="margin-top:4px;"><button onclick="event.stopPropagation();clearDebtPersonalityNote('+pnBtnArgs+')" style="font-size:9px;background:none;border:none;color:#bbb;cursor:pointer;">+ personality note</button></div>';
    }
    html += '</div>';

    // Tabs
    html += '<div style="display:flex;border-bottom:1px solid var(--sw-border);background:#fff;">';
    ['invoices','quotes','comms'].forEach(function(tab) {
      var labels = {invoices:'Invoices ('+client.invoices.length+')',quotes:'Quotes & Scope',comms:'Comms'};
      var active = _expandedTab===tab;
      html += '<button style="flex:1;padding:10px;font-size:12px;font-weight:'+(active?'700':'500')+';border:none;border-bottom:2px solid '+(active?'var(--sw-orange)':'transparent')+';background:transparent;cursor:pointer;color:'+(active?'var(--sw-orange)':'var(--sw-text-sec)')+'" onclick="event.stopPropagation();switchDebtTab(\''+tab+'\',\''+clientKey+'\')">'+labels[tab]+'</button>';
    });
    html += '</div>';

    // Tab content
    html += '<div style="padding:12px;">';
    if (_expandedTab==='invoices') html += _renderInvoicesTab(client);
    else if (_expandedTab==='quotes') html += _renderQuotesTab(client);
    else if (_expandedTab==='comms') html += _renderCommsTab(client);
    html += '</div>';

    // Client-level action buttons
    var ghlId=client.ghl_contact_id||'';
    var firstInvId=client.invoices[0]?.xero_invoice_id||'';
    var firstJobId=client.invoices.find(function(i){return i.job_id;})?.job_id||'';
    html += '<div style="display:flex;gap:6px;padding:12px;border-top:1px solid var(--sw-border);flex-wrap:wrap;align-items:center;background:#fff;">';
    if (hasGHL) {
      html += '<button class="btn btn-sm" style="font-size:11px;" onclick="event.stopPropagation();clearDebtCall(\''+ghlId+'\',\''+_esc(client.contact_name)+'\',\''+_esc(firstInvId)+'\',\''+firstJobId+'\')">\uD83D\uDCDE Call</button>';
      html += '<button class="btn btn-sm" style="font-size:11px;" onclick="event.stopPropagation();clearDebtSMS(\''+ghlId+'\',\''+_esc(client.contact_name)+'\',\''+_esc(firstInvId)+'\',\''+firstJobId+'\',\''+ _esc(client.invoices[0]?.invoice_number||'')+'\',\''+client.total_owed+'\')">\uD83D\uDCAC SMS</button>';
    }
    if (firstJobId) html += '<button class="btn btn-sm" style="font-size:11px;" onclick="event.stopPropagation();clearDebtPayLink(\''+firstJobId+'\')">\uD83D\uDCB3 Pay Link</button>';
    html += '<span style="margin-left:auto;display:flex;gap:4px;">';
    html += '<button class="btn btn-sm" style="font-size:10px;color:var(--sw-text-sec);" onclick="event.stopPropagation();clearDebtLogChase(\''+_esc(firstInvId)+'\',\''+firstJobId+'\',\''+ghlId+'\',\''+_esc(client.contact_name)+'\')">\uD83D\uDCCB Log</button>';
    html += '<button class="btn btn-sm" style="font-size:10px;color:var(--sw-text-sec);" onclick="event.stopPropagation();clearDebtNote(\''+_esc(firstInvId)+'\',\''+firstJobId+'\',\''+ghlId+'\',\''+_esc(client.contact_name)+'\')">\uD83D\uDCDD Note</button>';
    html += '</span></div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ── Build compact timeline from job dates ──
function _buildTimeline(invoices) {
  // Use the first invoice with job data
  var inv = invoices.find(function(i){return i.job_id;});
  if (!inv) return '';
  var steps = [];
  if (inv.job_created_at) steps.push({label:'Created', date:inv.job_created_at});
  if (inv.job_quoted_at) steps.push({label:'Quoted', date:inv.job_quoted_at});
  if (inv.job_accepted_at) steps.push({label:'Accepted', date:inv.job_accepted_at});
  if (inv.job_scheduled_at) steps.push({label:'Scheduled', date:inv.job_scheduled_at});
  if (inv.job_completed_at) steps.push({label:'Completed', date:inv.job_completed_at});
  if (inv.invoice_date) steps.push({label:'Invoiced', date:inv.invoice_date});
  if (inv.due_date) steps.push({label:'Due', date:inv.due_date, color: '#e74c3c'});
  if (!steps.length) return '';
  var html = '<span style="font-weight:600;color:var(--sw-dark);margin-right:6px;">TIMELINE:</span>';
  html += steps.map(function(s,i) {
    var col = s.color || 'var(--sw-text-sec)';
    return '<span style="color:'+col+';">'+s.label+' '+_fmtDateShort(s.date)+'</span>';
  }).join(' <span style="color:#ccc;">\u2192</span> ');
  if (inv.days_overdue) html += ' <span style="color:#e74c3c;font-weight:600;"> \u2192 '+inv.days_overdue+'d overdue</span>';
  return html;
}

function toggleClientExpand(clientKey) {
  if (_expandedClient===clientKey) { _expandedClient=null; } else { _expandedClient=clientKey; _expandedTab='invoices'; _expandedInvoice=null; }
  renderClearDebtCards(_clearDebtData);
}
function switchDebtTab(tab, clientKey) {
  _expandedTab=tab; _expandedInvoice=null;
  if (tab==='comms') {
    var client = (_clearDebtData?.clients||[]).find(function(c){return (c.xero_contact_id||c.contact_name)===clientKey;});
    if (client && client.ghl_contact_id) _loadCommsTab(client);
  }
  renderClearDebtCards(_clearDebtData);
}

// ════════════════════════════════════════════════════════════
// INVOICES TAB
// ════════════════════════════════════════════════════════════

function _renderInvoicesTab(client) {
  // Quote vs invoiced summary
  var totalInvoiced = 0, totalPaid = 0, totalDue = 0;
  var quotedVal = 0;
  client.invoices.forEach(function(inv) {
    totalInvoiced += Number(inv.total) || 0;
    totalPaid += Number(inv.amount_paid) || 0;
    totalDue += Number(inv.amount_due) || 0;
    var p = typeof inv.pricing_json === 'string' ? JSON.parse(inv.pricing_json||'{}') : (inv.pricing_json||{});
    quotedVal = Math.max(quotedVal, p.totalIncGST || p.total || 0);
  });

  var html = '';
  // Enhanced money story bar
  var variationDelta = quotedVal > 0 ? totalInvoiced - quotedVal : 0;
  var hasVariations = quotedVal > 0 && Math.abs(variationDelta) > quotedVal * 0.1;
  var blowoutRatio = quotedVal > 0 ? (totalInvoiced / quotedVal) : 0;
  var paidPct = totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0;

  // Get cost estimate for margin calc
  var costEst = 0;
  client.invoices.forEach(function(inv) {
    var p = typeof inv.pricing_json === 'string' ? JSON.parse(inv.pricing_json||'{}') : (inv.pricing_json||{});
    costEst = Math.max(costEst, p.costEstimate || p.totalCost || p.cost || 0);
  });

  html += '<div style="font-size:12px;color:var(--sw-text-sec);margin-bottom:10px;padding:8px 12px;background:#f0f4f7;border-radius:6px;">';
  if (quotedVal > 0) {
    html += '<div style="display:flex;flex-wrap:wrap;gap:2px 4px;align-items:baseline;">';
    html += '<strong>Quoted:</strong> '+fmt$(quotedVal);
    if (hasVariations) html += ' \u2192 <strong>Variations:</strong> <span style="color:'+(variationDelta>0?'var(--sw-orange)':'var(--sw-green)')+';">'+(variationDelta>0?'+':'')+fmt$(variationDelta)+'</span>';
    html += ' \u2192 <strong>Invoiced:</strong> '+fmt$(totalInvoiced);
    html += ' \u2192 <strong>Paid:</strong> <span style="color:var(--sw-green);">'+fmt$(totalPaid)+'</span>';
    html += ' \u2192 <strong>Outstanding:</strong> <span style="color:#e74c3c;">'+fmt$(totalDue)+'</span>';
    html += '</div>';
  } else {
    html += '<strong>Invoiced:</strong> '+fmt$(totalInvoiced)+' \u00B7 <strong>Paid:</strong> <span style="color:var(--sw-green);">'+fmt$(totalPaid)+'</span> \u00B7 <strong>Outstanding:</strong> <span style="color:#e74c3c;">'+fmt$(totalDue)+'</span>';
  }
  // Progress bar
  html += '<div style="height:5px;background:#e8e8e8;border-radius:3px;margin-top:6px;overflow:hidden;">';
  html += '<div style="height:100%;width:'+paidPct+'%;background:var(--sw-green);border-radius:3px;transition:width 0.3s;"></div></div>';
  // Blowout warning
  if (blowoutRatio > 1.3) html += '<div style="font-size:11px;color:#e67e22;margin-top:4px;">\u26A0\uFE0F Invoice is '+blowoutRatio.toFixed(1)+'x the original quote</div>';
  // Margin line
  if (costEst > 0 && quotedVal > 0) {
    var marginOnQuote = Math.round((quotedVal - costEst) / quotedVal * 100);
    var marginAfterVar = totalInvoiced > 0 ? Math.round((totalInvoiced - costEst) / totalInvoiced * 100) : 0;
    html += '<div style="font-size:10px;color:var(--sw-text-sec);margin-top:3px;">Margin: '+(hasVariations?marginOnQuote+'% on quote \u00B7 '+marginAfterVar+'% after variations':marginOnQuote+'%')+'</div>';
  }
  html += '</div>';

  client.invoices.forEach(function(inv) {
    var c=_debtClassLabels[inv.classification]||_debtClassLabels.unclassified;
    var ag=inv.days_overdue<=30?'#27ae60':inv.days_overdue<=60?'#f39c12':'#e74c3c';
    var isOpen = _expandedInvoice===inv.xero_invoice_id;
    var invKey = _esc(inv.xero_invoice_id);

    html += '<div style="border:1px solid var(--sw-border);border-radius:6px;margin-bottom:6px;background:#fff;overflow:hidden;">';
    // Summary row
    html += '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;flex-wrap:wrap;" onclick="event.stopPropagation();toggleInvoiceExpand(\''+invKey+'\')">';
    html += '<span style="font-size:12px;color:var(--sw-text-sec);">'+(isOpen?'\u25BC':'\u25B6')+'</span>';
    html += '<span style="font-weight:600;font-size:13px;color:var(--sw-dark);min-width:70px;">'+(inv.invoice_number||'-')+'</span>';
    if (inv.job_type) html += '<span style="font-size:11px;color:var(--sw-text-sec);">'+inv.job_type+'</span>';
    if (inv.job_number) html += '<span style="font-size:11px;color:var(--sw-text-sec);">'+inv.job_number+'</span>';
    html += '<span style="font-weight:700;color:'+ag+';font-family:var(--sw-font-num);font-size:13px;">'+fmt$(inv.amount_due)+'</span>';
    html += '<span style="font-size:11px;color:'+ag+';">'+inv.days_overdue+'d</span>';
    html += '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:'+c.color+'18;color:'+c.color+';font-weight:600;"'+(inv.classification_reason?' title="'+_esc(inv.classification_reason)+'"':'')+'>'+c.icon+' '+c.short+(inv.auto_classified?' (auto)':'')+'</span>';
    if (inv.classification_reason && !inv.auto_classified) html += '<span style="font-size:9px;color:var(--sw-text-sec);font-style:italic;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:middle;">'+inv.classification_reason.substring(0,60)+'</span>';
    if (inv.flags&&inv.flags.length) inv.flags.forEach(function(f){html+='<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:#fff3cd;color:#856404;">\u26A0 '+f+'</span>';});
    // Per-invoice actions
    html += '<span style="margin-left:auto;display:flex;gap:4px;flex-shrink:0;">';
    html += '<button class="btn btn-sm" style="font-size:10px;padding:2px 6px;" onclick="event.stopPropagation();clearDebtClassify(\''+_esc(inv.xero_invoice_id)+'\',\''+inv.classification+'\',\''+(inv.ghl_contact_id||client.ghl_contact_id||'')+'\',\''+_esc(inv.invoice_number)+'\',\''+_esc(inv.job_number||'')+'\',\''+(inv.amount_due||0)+'\')">Classify</button>';
    if (inv.classification==='blocked_by_us') html+='<button class="btn btn-sm btn-primary" style="font-size:10px;padding:2px 6px;" onclick="event.stopPropagation();clearDebtResolveBlocker(\''+_esc(inv.xero_invoice_id)+'\',\''+(inv.ghl_contact_id||client.ghl_contact_id||'')+'\',\''+_esc(inv.invoice_number)+'\',\''+_esc(inv.job_number||'')+'\',\''+(inv.amount_due||0)+'\')">\u2705 Resolved</button>';
    if (inv.classification==='in_dispute') { html+='<button class="btn btn-sm btn-primary" style="font-size:10px;padding:2px 6px;" onclick="event.stopPropagation();clearDebtResolveDispute(\''+_esc(inv.xero_invoice_id)+'\',\''+(inv.ghl_contact_id||client.ghl_contact_id||'')+'\',\''+_esc(inv.invoice_number)+'\',\''+_esc(inv.job_number||'')+'\',\''+(inv.amount_due||0)+'\')">\u2705 Resolved</button>'; html+='<button class="btn btn-sm" style="font-size:10px;padding:2px 6px;color:var(--sw-red);" onclick="event.stopPropagation();clearDebtClassifyDirect(\''+_esc(inv.xero_invoice_id)+'\',\'bad_debt\',\''+(inv.ghl_contact_id||client.ghl_contact_id||'')+'\')">\u26AB Off</button>'; }
    if (inv.classification==='bad_debt') html+='<button class="btn btn-sm" style="font-size:10px;padding:2px 6px;" onclick="event.stopPropagation();clearDebtClassifyDirect(\''+_esc(inv.xero_invoice_id)+'\',\'unclassified\',\''+(inv.ghl_contact_id||client.ghl_contact_id||'')+'\')">\u21A9 Reopen</button>';
    html += '</span></div>';

    // Expanded detail
    if (isOpen) {
      html += '<div style="padding:10px 12px;border-top:1px solid var(--sw-border);background:#f8f8f8;">';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:12px;margin-bottom:10px;">';
      html += '<div><span style="color:var(--sw-text-sec);">Invoice Date:</span> '+(inv.invoice_date?fmtDate(inv.invoice_date):'-')+'</div>';
      html += '<div><span style="color:var(--sw-text-sec);">Status:</span> <strong>'+(inv.invoice_status||inv.status||'-')+'</strong></div>';
      html += '<div><span style="color:var(--sw-text-sec);">Due Date:</span> '+(inv.due_date?fmtDate(inv.due_date):'-')+'</div>';
      html += '<div><span style="color:var(--sw-text-sec);">Amount Due:</span> <strong style="color:'+ag+';">'+fmt$(inv.amount_due)+'</strong></div>';
      html += '<div><span style="color:var(--sw-text-sec);">Total:</span> '+fmt$(inv.total)+'</div>';
      html += '<div><span style="color:var(--sw-text-sec);">Paid:</span> '+fmt$(inv.amount_paid||0)+'</div>';
      if (inv.reference) html += '<div><span style="color:var(--sw-text-sec);">Reference:</span> '+inv.reference+'</div>';
      if (inv.classification_reason) html += '<div><span style="color:var(--sw-text-sec);">Classification:</span> <em>'+inv.classification_reason+'</em></div>';
      html += '</div>';

      // Line items
      var items = inv.line_items;
      if (items && Array.isArray(items) && items.length > 0) {
        html += '<div style="font-size:11px;font-weight:600;color:var(--sw-text-sec);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Line Items</div>';
        html += '<table style="width:100%;font-size:11px;border-collapse:collapse;"><thead><tr style="border-bottom:1px solid var(--sw-border);text-align:left;"><th style="padding:3px 4px;">Description</th><th style="padding:3px 4px;text-align:center;">Qty</th><th style="padding:3px 4px;text-align:right;">Unit</th><th style="padding:3px 4px;text-align:right;">Amount</th></tr></thead><tbody>';
        items.forEach(function(li) {
          html += '<tr style="border-bottom:1px solid #eee;"><td style="padding:3px 4px;">'+(li.Description||li.description||'-')+'</td><td style="padding:3px 4px;text-align:center;">'+(li.Quantity||li.quantity||1)+'</td><td style="padding:3px 4px;text-align:right;">'+fmt$(li.UnitAmount||li.unit_amount||0)+'</td><td style="padding:3px 4px;text-align:right;font-weight:600;">'+fmt$(li.LineAmount||li.line_amount||li.Amount||0)+'</td></tr>';
        });
        html += '</tbody></table>';
      }

      // View Job link
      if (inv.job_id) {
        html += '<div style="margin-top:8px;"><button class="btn btn-sm" style="font-size:10px;color:var(--sw-mid);" onclick="event.stopPropagation();openJobDetail(\''+inv.job_id+'\')">View Job \u2192</button></div>';
      }

      // Chase history for this invoice
      if (inv.chase_logs && inv.chase_logs.length > 0) {
        html += '<div style="margin-top:8px;font-size:11px;font-weight:600;color:var(--sw-text-sec);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Chase History</div>';
        var icons={call:'\uD83D\uDCDE',sms:'\uD83D\uDCAC',auto_sms:'\uD83E\uDD16',email:'\uD83D\uDCE7',note:'\uD83D\uDCDD',status_change:'\uD83C\uDFF7'};
        inv.chase_logs.forEach(function(log) {
          if (log.method==='note') {
            // Notes get distinct styling — prominent background, full text
            html += '<div style="font-size:11px;padding:4px 8px;margin:3px 0;background:#f8f6f0;border-left:2px solid var(--sw-orange);border-radius:0 4px 4px 0;">';
            html += '\uD83D\uDCDD <span style="color:var(--sw-text-sec);">'+fmtDate(log.created_at)+(log.chased_by?' \u00B7 '+log.chased_by:'')+'</span>';
            html += '<div style="color:var(--sw-dark);margin-top:2px;font-style:italic;">'+(log.notes||'')+'</div></div>';
          } else if (log.method==='status_change') {
            html += '<div style="font-size:11px;color:var(--sw-text-sec);">\uD83C\uDFF7 '+fmtDate(log.created_at)+' \u2014 '+(log.outcome?'<strong>'+log.outcome+'</strong>':'')+(log.notes?' \u2014 <em>'+log.notes.substring(0,150)+'</em>':'')+'</div>';
          } else {
            html += '<div style="font-size:11px;color:var(--sw-text-sec);">'+(icons[log.method]||'\u2022')+' '+fmtDate(log.created_at)+' \u2014 '+(log.outcome?'<strong>'+log.outcome+'</strong>':'')+(log.notes?' '+log.notes.substring(0,150):'')+'</div>';
          }
        });
      }
      html += '</div>';
    }
    html += '</div>';
  });
  return html;
}

function toggleInvoiceExpand(invId) { _expandedInvoice = _expandedInvoice===invId ? null : invId; renderClearDebtCards(_clearDebtData); }

// ════════════════════════════════════════════════════════════
// QUOTES TAB
// ════════════════════════════════════════════════════════════

function _renderQuotesTab(client) {
  var jobsSeen = {}, jobs = [];
  client.invoices.forEach(function(inv) {
    if (inv.job_id && !jobsSeen[inv.job_id]) {
      jobsSeen[inv.job_id] = true;
      jobs.push({ id: inv.job_id, number: inv.job_number, type: inv.job_type, status: inv.job_status, scope: inv.scope_json, pricing: inv.pricing_json });
    }
  });
  if (!jobs.length) return '<div style="text-align:center;padding:20px;color:var(--sw-text-sec);font-size:13px;">No jobs linked to these invoices.</div>';

  var html = '';
  jobs.forEach(function(job) {
    var typeLabel = (job.type||'Job').charAt(0).toUpperCase() + (job.type||'job').slice(1);
    var statusLabel = (job.status||'draft').replace(/_/g,' ');
    statusLabel = statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1);

    html += '<div style="border:1px solid var(--sw-border);border-radius:6px;padding:12px;margin-bottom:8px;background:#fff;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
    html += '<div style="font-weight:700;font-size:13px;color:var(--sw-dark);">'+typeLabel+' Job \u00B7 '+statusLabel;
    if (job.number) html += ' \u00B7 <span style="color:var(--sw-mid);">'+job.number+'</span>';
    else html += ' <span style="font-size:11px;color:var(--sw-text-sec);font-weight:400;">(no job # yet)</span>';
    html += '</div>';
    html += '<button class="btn btn-sm" style="font-size:10px;color:var(--sw-mid);" onclick="event.stopPropagation();openJobDetail(\''+job.id+'\')">View Job \u2192</button>';
    html += '</div>';

    // Scope
    var scope = typeof job.scope === 'string' ? JSON.parse(job.scope||'{}') : (job.scope||{});
    if (scope && Object.keys(scope).length > 0) {
      html += '<div style="font-size:11px;font-weight:600;color:var(--sw-text-sec);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Scope</div>';
      html += '<div style="font-size:12px;margin-bottom:8px;">';
      if (job.type==='fencing') {
        var fj = scope.job || scope;
        var runs = fj.runs || scope.sections || [];
        var totalM = runs.reduce(function(s,r){return s+(r.length||r.totalLength||r.lengthM||0);},0);
        var gates = fj.gates || [];
        html += '<div>'+Math.round(totalM)+'m total \u00B7 '+runs.length+' run'+(runs.length!==1?'s':'');
        if (gates.length) html += ' \u00B7 '+gates.length+' gate'+(gates.length!==1?'s':'');
        html += '</div>';
        if (fj.sheetColour||fj.colour) html += '<div style="color:var(--sw-text-sec);">Colour: '+(fj.sheetColour||fj.colour)+'</div>';
        if (fj.profile) html += '<div style="color:var(--sw-text-sec);">Profile: '+fj.profile+'</div>';
      } else {
        var cfg = scope.config || {};
        if (cfg.length && cfg.projection) html += '<div>'+cfg.length+'m \u00D7 '+cfg.projection+'m ('+Math.round(cfg.length*cfg.projection)+'m\u00B2)</div>';
        if (cfg.roofStyle) html += '<div>'+cfg.roofStyle.charAt(0).toUpperCase()+cfg.roofStyle.slice(1)+(cfg.roofing?' \u00B7 '+cfg.roofing:'')+'</div>';
        if (cfg.connection) html += '<div style="color:var(--sw-text-sec);">Connection: '+cfg.connection+'</div>';
        var colours = [];
        if (cfg.sheetColor) colours.push('Sheets: '+(typeof cfg.sheetColor==='object'?cfg.sheetColor.name:cfg.sheetColor));
        if (cfg.steelColor) colours.push('Steel: '+(typeof cfg.steelColor==='object'?cfg.steelColor.name:cfg.steelColor));
        if (cfg.ceilingFinish) colours.push('Ceiling: '+cfg.ceilingFinish);
        if (colours.length) html += '<div style="color:var(--sw-text-sec);">'+colours.join(' \u00B7 ')+'</div>';
        if (cfg.posts || cfg.post_count) html += '<div style="color:var(--sw-text-sec);">Posts: '+(cfg.post_count||cfg.posts)+(cfg.post_size?' \u00D7 '+cfg.post_size:'')+'</div>';
      }
      html += '</div>';
    } else { html += '<div style="font-size:12px;color:var(--sw-text-sec);font-style:italic;margin-bottom:8px;">No scope data available</div>'; }

    // Pricing
    var pricing = typeof job.pricing === 'string' ? JSON.parse(job.pricing||'{}') : (job.pricing||{});
    if (pricing && Object.keys(pricing).length > 0) {
      html += '<div style="font-size:11px;font-weight:600;color:var(--sw-text-sec);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Pricing</div>';
      var qv = pricing.totalIncGST || pricing.total || 0;
      var ce = pricing.costEstimate || pricing.totalCost || pricing.cost || 0;
      var margin = qv > 0 ? Math.round((qv - ce) / qv * 100) : 0;
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;font-size:12px;">';
      html += '<div><span style="color:var(--sw-text-sec);">Quote:</span> <strong>'+fmt$(qv)+'</strong> inc GST</div>';
      if (ce > 0) html += '<div><span style="color:var(--sw-text-sec);">Cost Est:</span> '+fmt$(ce)+'</div>';
      if (ce > 0) html += '<div><span style="color:var(--sw-text-sec);">Margin:</span> <strong style="color:'+(margin>=25?'var(--sw-green)':margin>=15?'var(--sw-orange)':'var(--sw-red)')+'">'+margin+'%</strong></div>';
      html += '</div>';
    }
    html += '</div>';
  });
  return html;
}

// ════════════════════════════════════════════════════════════
// COMMS TAB
// ════════════════════════════════════════════════════════════

function _renderCommsTab(client) {
  if (!client.ghl_contact_id) return '<div style="text-align:center;padding:20px;color:var(--sw-text-sec);font-size:13px;">No GHL contact linked \u2014 cannot load conversation.</div>';
  var cached = _commsCache[client.ghl_contact_id];
  if (cached) return _renderCommsTimeline(cached);
  return '<div id="commsLoading_'+client.ghl_contact_id+'" style="text-align:center;padding:20px;color:var(--sw-text-sec);font-size:13px;">Loading conversation...</div>';
}
async function _loadCommsTab(client) {
  if (!client.ghl_contact_id || _commsCache[client.ghl_contact_id]) return;
  try {
    var resp = await fetch(window.SUPABASE_URL+'/functions/v1/ghl-proxy?action=get_conversation&contactId='+client.ghl_contact_id, {headers:{'x-api-key':'097a1160f9a8b2f517f4770ebbe88dca105a36f816ef728cc8724da25b2667dc'}});
    var data = await resp.json();
    _commsCache[client.ghl_contact_id] = data.messages || [];
    renderClearDebtCards(_clearDebtData);
  } catch(e) { var el=document.getElementById('commsLoading_'+client.ghl_contact_id); if(el) el.innerHTML='<span style="color:var(--sw-red);">Failed: '+e.message+'</span>'; }
}
function _renderCommsTimeline(messages) {
  if (!messages||!messages.length) return '<div style="text-align:center;padding:20px;color:var(--sw-text-sec);font-size:13px;">No conversation history.</div>';
  var sorted = messages.slice().sort(function(a,b){return new Date(a.timestamp)-new Date(b.timestamp);});
  var html = '<div style="max-height:400px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:4px 0;">';
  sorted.forEach(function(msg) {
    var isOut = msg.direction==='outbound';
    var isCall = (msg.type||'').toLowerCase().indexOf('call')>=0;
    var time = msg.timestamp ? new Date(msg.timestamp).toLocaleString('en-AU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
    if (isCall) {
      var dur = msg.duration ? Math.round(msg.duration/60)+'min' : '';
      html += '<div style="text-align:center;font-size:11px;color:var(--sw-text-sec);padding:4px 0;">\uD83D\uDCDE Call \u00B7 '+time+(dur?' \u00B7 '+dur:'')+(msg.body?' \u2014 '+msg.body:'')+'</div>';
    } else {
      var align = isOut?'margin-left:auto;':'margin-right:auto;';
      var bg = isOut?'background:var(--sw-dark);color:#fff;':'background:#e8e8e8;color:var(--sw-dark);';
      html += '<div style="max-width:75%;'+align+'padding:8px 12px;border-radius:12px;'+bg+'font-size:13px;word-wrap:break-word;">';
      if (msg.subject) html += '<div style="font-size:11px;font-weight:600;margin-bottom:4px;opacity:0.8;">'+msg.subject+'</div>';
      html += '<div>'+(msg.body||'').replace(/\n/g,'<br>')+'</div>';
      html += '<div style="font-size:10px;opacity:0.6;margin-top:4px;text-align:right;">'+time+'</div></div>';
    }
  });
  html += '</div>';
  return html;
}

// ════════════════════════════════════════════════════════════
// LIST VIEW
// ════════════════════════════════════════════════════════════

function renderClearDebtList(data) {
  var container = document.getElementById('clearDebtCards');
  var clients = _sortClients(_filterClients(data));
  if (!clients.length) { container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sw-text-sec);">No clients matching filter.</div>'; return; }
  var arrow=function(c){return _clearDebtSort.col===c?(_clearDebtSort.asc?' \u25B2':' \u25BC'):'';};
  var html = '<div class="data-table-wrap" style="overflow-x:auto;"><table class="data-table" style="width:100%;border-collapse:collapse;font-size:12px;">';
  html += '<thead><tr style="border-bottom:2px solid var(--sw-border);text-align:left;">';
  html += '<th style="cursor:pointer;padding:8px 6px;" onclick="sortClearDebt(\'name\')">Client'+arrow('name')+'</th>';
  html += '<th style="padding:8px 6px;">Phone</th><th style="padding:8px 6px;">Suburb</th>';
  html += '<th style="cursor:pointer;padding:8px 6px;text-align:center;" onclick="sortClearDebt(\'invoices\')">Inv'+arrow('invoices')+'</th>';
  html += '<th style="cursor:pointer;padding:8px 6px;text-align:right;" onclick="sortClearDebt(\'total\')">Total Owed'+arrow('total')+'</th>';
  html += '<th style="cursor:pointer;padding:8px 6px;text-align:center;" onclick="sortClearDebt(\'oldest\')">Oldest'+arrow('oldest')+'</th>';
  html += '<th style="padding:8px 6px;">Status</th><th style="padding:8px 6px;">Last Chase</th></tr></thead><tbody>';
  clients.forEach(function(c) {
    var worst=_worstClassification(c.invoices), wc=_debtClassLabels[worst];
    var oldest=_oldestDays(c.invoices), ag=oldest<=30?'#27ae60':oldest<=60?'#f39c12':'#e74c3c';
    var suburbs = []; c.invoices.forEach(function(inv){if(inv.site_suburb&&suburbs.indexOf(inv.site_suburb)<0)suburbs.push(inv.site_suburb);});
    html += '<tr style="cursor:pointer;border-bottom:1px solid var(--sw-border);" onclick="setClearDebtView(\'cards\');_expandedClient=\''+_esc(c.xero_contact_id||c.contact_name)+'\';_expandedTab=\'invoices\';renderClearDebtCards(_clearDebtData)" onmouseover="this.style.background=\'#f8f8f8\'" onmouseout="this.style.background=\'\'">';
    html += '<td style="padding:8px 6px;font-weight:600;color:var(--sw-dark);">'+(c.contact_name||'Unknown')+'</td>';
    html += '<td style="padding:8px 6px;color:var(--sw-text-sec);white-space:nowrap;">'+_fmtPhone(c.phone)+'</td>';
    html += '<td style="padding:8px 6px;color:var(--sw-text-sec);font-size:11px;">'+suburbs.join(', ')+'</td>';
    html += '<td style="padding:8px 6px;text-align:center;">'+c.invoices.length+'</td>';
    html += '<td style="padding:8px 6px;text-align:right;font-weight:700;color:'+ag+';font-family:var(--sw-font-num);">'+fmt$(c.total_owed)+'</td>';
    html += '<td style="padding:8px 6px;text-align:center;color:'+ag+';font-weight:600;">'+oldest+'d</td>';
    html += '<td style="padding:8px 6px;"><span style="font-size:11px;padding:2px 8px;border-radius:10px;background:'+wc.color+'18;color:'+wc.color+';font-weight:600;">'+wc.icon+' '+wc.short+'</span></td>';
    html += '<td style="padding:8px 6px;font-size:11px;color:var(--sw-text-sec);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+_lastChaseDesc(c.invoices)+'</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// ════════════════════════════════════════════════════════════
// CLASSIFICATION GUIDE
// ════════════════════════════════════════════════════════════

function showClassificationGuide() {
  var overlay=document.createElement('div'); overlay.className='modal-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  overlay.onclick=function(e){if(e.target===overlay)overlay.remove();};
  overlay.innerHTML=
    '<div style="background:#fff;border-radius:12px;padding:24px;max-width:560px;width:94%;max-height:85vh;overflow-y:auto;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h3 style="margin:0;color:var(--sw-dark);font-size:16px;">Classification Guide</h3><button onclick="this.closest(\'.modal-overlay\').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:#999;">&times;</button></div>'+
    _guideSection('\uD83D\uDD34','GENUINE DEBT (Chase)','#e74c3c','Job is complete. Invoice is correct. Client owes us money. They\'ve either forgotten, are delaying, or are avoiding payment.','Call them, send pay link, follow up.')+
    _guideSection('\uD83D\uDFE1','BLOCKED BY US','#f39c12','Something on OUR side is preventing us from chasing payment. Examples: job isn\'t finished yet, invoice was sent with wrong amount, scope change hasn\'t been agreed.','Fix the blocker first. Don\'t contact the client about money until our side is sorted.')+
    _guideSection('\uD83D\uDFE0','IN DISPUTE','#e67e22','The client has raised an issue \u2014 quality complaint, scope disagreement, damage claim.','Resolve the dispute. This is a relationship conversation, not a payment conversation.')+
    _guideSection('\u2B1C','UNCLASSIFIED (Triage)','#999','Nobody has looked at this yet. Could be genuine debt, could be an accounting error, could be a job we haven\'t finished.','Review and classify. Check if the job is done, if the invoice is correct, if there\'s a dispute.')+
    _guideSection('\u26AB','BAD DEBT (Written Off)','#2c3e50','We\'ve tried everything. Client is uncontactable, refusing to pay, or the business has closed.','None. Logged for records. Can be reopened if circumstances change.')+
    '<div style="margin-top:16px;padding:12px;background:var(--sw-bg);border-radius:8px;font-size:12px;color:var(--sw-text-sec);">'+
    '<div style="font-weight:600;margin-bottom:6px;color:var(--sw-dark);">How Auto-Classification Works</div>'+
    '<div>\u2022 Job not complete (quoted, scheduled, in progress) \u2192 auto \uD83D\uDFE1 Blocked by Us</div>'+
    '<div>\u2022 Job complete with no disputes \u2192 auto \uD83D\uDD34 Genuine Debt</div>'+
    '<div>\u2022 No job linked to invoice \u2192 stays \u2B1C Unclassified with warning flag</div>'+
    '<div style="margin-top:4px;font-style:italic;">You can override any auto-classification with one tap.</div></div></div>';
  document.body.appendChild(overlay);
}
function _guideSection(icon,title,color,desc,action) {
  return '<div style="padding:10px 0;border-bottom:1px solid var(--sw-border);"><div style="font-weight:700;font-size:13px;color:'+color+';margin-bottom:4px;">'+icon+' '+title+'</div><div style="font-size:12px;color:var(--sw-dark);margin-bottom:4px;">'+desc+'</div><div style="font-size:11px;color:var(--sw-text-sec);"><strong>Action:</strong> '+action+'</div></div>';
}

// ════════════════════════════════════════════════════════════
// ACTIONS
// ════════════════════════════════════════════════════════════

function clearDebtCall(ghlContactId,contactName,xeroInvoiceId,jobId) {
  window.open('https://app.maxlead.com.au/v2/location/'+GHL_LOCATION_ID+'/contacts/'+ghlContactId,'_blank');
  setTimeout(function(){if(confirm('Log the call outcome for '+contactName+'?')){clearDebtLogChase(xeroInvoiceId,jobId,ghlContactId,contactName,'call');}},1000);
}
function clearDebtSMS(ghlContactId,contactName,xeroInvoiceId,jobId,invoiceNumber,amount) {
  var firstName=(contactName||'').split(' ')[0]||'there';
  var template='Hi '+firstName+', just a friendly reminder that invoice '+(invoiceNumber||'')+' for $'+Math.round(Number(amount)).toLocaleString()+' is now overdue. You can pay online or please get in touch if you have any questions.\n\nThanks,\nSecureWorks WA';
  var overlay=document.createElement('div'); overlay.className='modal-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML='<div style="background:#fff;border-radius:12px;padding:24px;max-width:480px;width:92%;"><h3 style="margin:0 0 12px;color:var(--sw-dark);">SMS to '+contactName+'</h3><textarea id="chaseSmsText" style="width:100%;height:120px;border:1px solid var(--sw-border);border-radius:6px;padding:10px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:inherit;">'+template+'</textarea><div style="font-size:11px;color:var(--sw-text-sec);margin-top:4px;">Edit the message above before sending.</div><div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;"><button class="btn btn-sm" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button><button class="btn btn-sm btn-primary" onclick="clearDebtSendSMS(\''+ghlContactId+'\',\''+_esc(xeroInvoiceId)+'\',\''+(jobId||'')+'\')">Send SMS</button></div></div>';
  document.body.appendChild(overlay); overlay.querySelector('textarea').focus();
}
async function clearDebtSendSMS(ghlContactId,xeroInvoiceId,jobId) {
  var text=document.getElementById('chaseSmsText'); if(!text||!text.value.trim()){showToast('Message is empty','warning');return;}
  try{await opsPost('send_chase_sms',{ghl_contact_id:ghlContactId,xero_invoice_id:xeroInvoiceId||null,job_id:jobId||null,message:text.value.trim()});showToast('SMS sent','success');text.closest('.modal-overlay').remove();loadClearDebt();}catch(e){showToast('SMS failed: '+e.message,'warning');}
}
async function clearDebtPayLink(jobId) {
  try{showToast('Sending payment link...','info');var r=await opsPost('send_payment_link',{job_id:jobId});showToast('Payment link sent: '+(r.invoice_number||''),'success');loadClearDebt();}catch(e){showToast('Failed: '+e.message,'warning');}
}
function clearDebtLogChase(xeroInvoiceId,jobId,ghlContactId,contactName,defaultMethod) {
  var overlay=document.createElement('div'); overlay.className='modal-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML='<div style="background:#fff;border-radius:12px;padding:24px;max-width:480px;width:92%;"><h3 style="margin:0 0 16px;color:var(--sw-dark);">Log Chase \u2014 '+contactName+'</h3><label style="font-size:12px;font-weight:600;color:var(--sw-text-sec);display:block;margin-bottom:4px;">Method</label><select id="chaseMethod" class="form-input" style="width:100%;margin-bottom:12px;"><option value="call"'+(defaultMethod==='call'?' selected':'')+'>\uD83D\uDCDE Call</option><option value="sms">\uD83D\uDCAC SMS</option><option value="email">\uD83D\uDCE7 Email</option></select><label style="font-size:12px;font-weight:600;color:var(--sw-text-sec);display:block;margin-bottom:4px;">Outcome</label><select id="chaseOutcome" class="form-input" style="width:100%;margin-bottom:12px;"><option value="Promised to pay">Promised to pay</option><option value="No answer">No answer</option><option value="Voicemail">Voicemail</option><option value="Disputing">Disputing</option><option value="Financial difficulty">Financial difficulty</option><option value="Wrong number">Wrong number</option><option value="Payment plan arranged">Payment plan arranged</option><option value="Payment received">Payment received</option></select><label style="font-size:12px;font-weight:600;color:var(--sw-text-sec);display:block;margin-bottom:4px;">Follow up in</label><select id="chaseFollowUp" class="form-input" style="width:100%;margin-bottom:12px;"><option value="">No follow-up</option><option value="1" selected>Tomorrow</option><option value="3">3 days</option><option value="7">1 week</option><option value="14">2 weeks</option><option value="30">1 month</option></select><label style="font-size:12px;font-weight:600;color:var(--sw-text-sec);display:block;margin-bottom:4px;">Notes</label><textarea id="chaseNotes" class="form-input" style="width:100%;height:60px;resize:vertical;box-sizing:border-box;" placeholder="Any extra details..."></textarea><div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;"><button class="btn btn-sm" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button><button class="btn btn-sm btn-primary" onclick="clearDebtSubmitChase(\''+_esc(xeroInvoiceId)+'\',\''+(jobId||'')+'\',\''+(ghlContactId||'')+'\',\''+_esc(contactName)+'\')">Save</button></div></div>';
  document.body.appendChild(overlay);
}
async function clearDebtSubmitChase(xeroInvoiceId,jobId,ghlContactId,contactName) {
  var method=document.getElementById('chaseMethod').value,outcome=document.getElementById('chaseOutcome').value,followUpDays=document.getElementById('chaseFollowUp').value,notes=document.getElementById('chaseNotes').value.trim();
  var followUpDate=null; if(followUpDays){var d=new Date();d.setDate(d.getDate()+parseInt(followUpDays));followUpDate=d.toISOString().slice(0,10);}
  try{await opsPost('log_chase',{xero_invoice_id:xeroInvoiceId,job_id:jobId||null,ghl_contact_id:ghlContactId||null,contact_name:contactName,method:method,outcome:outcome,notes:notes||null,follow_up_date:followUpDate});showToast('Chase logged','success');document.querySelector('.modal-overlay').remove();loadClearDebt();}catch(e){showToast('Failed: '+e.message,'warning');}
}
function clearDebtClassify(xeroInvoiceId,currentClassification,ghlContactId,invoiceNumber,jobNumber,amount) {
  var overlay=document.createElement('div'); overlay.className='modal-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  var buttons=[{key:'genuine_debt',label:'\uD83D\uDD34 Client Owes',color:'#e74c3c'},{key:'blocked_by_us',label:'\uD83D\uDFE1 On Us',color:'#f39c12'},{key:'in_dispute',label:'\uD83D\uDFE0 Dispute',color:'#e67e22'},{key:'bad_debt',label:'\u26AB Bad Debt',color:'#2c3e50'}];
  var btnHtml=buttons.map(function(b){var a=currentClassification===b.key?'border:2px solid '+b.color+';':'';return '<button class="btn btn-sm" style="flex:1;font-size:12px;'+a+'" onclick="clearDebtSetClassification(\''+_esc(xeroInvoiceId)+'\',\''+b.key+'\',\''+(ghlContactId||'')+'\',\''+_esc(invoiceNumber)+'\',\''+_esc(jobNumber)+'\',\''+amount+'\')">'+b.label+'</button>';}).join('');
  overlay.innerHTML='<div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:92%;"><h3 style="margin:0 0 16px;color:var(--sw-dark);">Classify Invoice</h3><div style="display:flex;gap:6px;flex-wrap:wrap;">'+btnHtml+'</div><div style="margin-top:12px;"><input type="text" id="classifyReason" class="form-input" style="width:100%;box-sizing:border-box;" placeholder="Reason (optional)"></div><div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;"><button class="btn btn-sm" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button></div></div>';
  document.body.appendChild(overlay);
}
async function clearDebtSetClassification(xeroInvoiceId,classification,ghlContactId,invoiceNumber,jobNumber,amount) {
  var reason=document.getElementById('classifyReason')?.value?.trim()||'';
  try{await opsPost('classify_invoice',{xero_invoice_id:xeroInvoiceId,classification:classification,reason:reason||null});
  if(ghlContactId){if(classification==='genuine_debt'){await opsPost('trigger_chase_workflow',{ghl_contact_id:ghlContactId,overdue_amount:amount,invoice_number:invoiceNumber,job_number:jobNumber});}else{await opsPost('stop_chase_workflow',{ghl_contact_id:ghlContactId});}}
  showToast('Classified as '+_debtClassLabels[classification].label,'success');var o=document.querySelector('.modal-overlay');if(o)o.remove();loadClearDebt();}catch(e){showToast('Failed: '+e.message,'warning');}
}
async function clearDebtClassifyDirect(xeroInvoiceId,classification,ghlContactId) {
  try{await opsPost('classify_invoice',{xero_invoice_id:xeroInvoiceId,classification:classification,reason:classification==='bad_debt'?'Written off':classification==='unclassified'?'Reopened':null});
  if(ghlContactId&&classification!=='genuine_debt'){await opsPost('stop_chase_workflow',{ghl_contact_id:ghlContactId});}showToast('Updated','success');loadClearDebt();}catch(e){showToast('Failed: '+e.message,'warning');}
}
async function clearDebtResolveBlocker(xeroInvoiceId,ghlContactId,invoiceNumber,jobNumber,amount){await clearDebtSetClassification(xeroInvoiceId,'genuine_debt',ghlContactId,invoiceNumber,jobNumber,amount);}
async function clearDebtResolveDispute(xeroInvoiceId,ghlContactId,invoiceNumber,jobNumber,amount){await clearDebtSetClassification(xeroInvoiceId,'genuine_debt',ghlContactId,invoiceNumber,jobNumber,amount);}
function clearDebtNote(xeroInvoiceId,jobId,ghlContactId,contactName) {
  var overlay=document.createElement('div'); overlay.className='modal-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML='<div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:92%;"><h3 style="margin:0 0 12px;color:var(--sw-dark);">Ops Note \u2014 '+contactName+'</h3><textarea id="chaseNoteText" class="form-input" style="width:100%;height:80px;resize:vertical;box-sizing:border-box;" placeholder="Internal note about this debt..."></textarea><div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;"><button class="btn btn-sm" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button><button class="btn btn-sm btn-primary" onclick="clearDebtSaveNote(\''+_esc(xeroInvoiceId)+'\',\''+(jobId||'')+'\',\''+(ghlContactId||'')+'\',\''+_esc(contactName)+'\')">Save</button></div></div>';
  document.body.appendChild(overlay); overlay.querySelector('textarea').focus();
}
async function clearDebtSaveNote(xeroInvoiceId,jobId,ghlContactId,contactName) {
  var notes=document.getElementById('chaseNoteText')?.value?.trim(); if(!notes){showToast('Note is empty','warning');return;}
  try{await opsPost('log_chase',{xero_invoice_id:xeroInvoiceId,job_id:jobId||null,ghl_contact_id:ghlContactId||null,contact_name:contactName,method:'note',notes:notes});showToast('Note saved','success');document.querySelector('.modal-overlay').remove();loadClearDebt();}catch(e){showToast('Failed: '+e.message,'warning');}
}

// ── Personality Note ──
function clearDebtPersonalityNote(xeroInvoiceId,jobId,ghlContactId,contactName) {
  var existing = '';
  // Try to find existing note from client data
  var client = (_clearDebtData?.clients||[]).find(function(c){return c.invoices.some(function(i){return i.xero_invoice_id===xeroInvoiceId;});});
  if (client && client.personality_note) existing = client.personality_note.notes || '';
  var overlay=document.createElement('div'); overlay.className='modal-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML='<div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:92%;"><h3 style="margin:0 0 4px;color:var(--sw-dark);">Personality Note</h3><div style="font-size:12px;color:var(--sw-text-sec);margin-bottom:12px;">What\'s '+((contactName||'').split(' ')[0]||'this person')+' like? This helps the next caller.</div><textarea id="personalityNoteText" class="form-input" style="width:100%;height:60px;resize:vertical;box-sizing:border-box;" placeholder="e.g. Friendly but non-committal on dates...">'+(existing||'')+'</textarea><div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;"><button class="btn btn-sm" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button><button class="btn btn-sm btn-primary" onclick="clearDebtSavePersonalityNote(\''+_esc(xeroInvoiceId)+'\',\''+(jobId||'')+'\',\''+(ghlContactId||'')+'\',\''+_esc(contactName)+'\')">Save</button></div></div>';
  document.body.appendChild(overlay); overlay.querySelector('textarea').focus();
}
async function clearDebtSavePersonalityNote(xeroInvoiceId,jobId,ghlContactId,contactName) {
  var notes=document.getElementById('personalityNoteText')?.value?.trim();
  if(!notes){showToast('Note is empty','warning');return;}
  try{
    await opsPost('log_chase',{xero_invoice_id:xeroInvoiceId,job_id:jobId||null,ghl_contact_id:ghlContactId||null,contact_name:contactName,method:'personality_note',notes:notes});
    showToast('Personality note saved','success');
    document.querySelector('.modal-overlay').remove();
    loadClearDebt();
  }catch(e){showToast('Failed: '+e.message,'warning');}
}

// ── Xero Sync Refresh ──
async function refreshXeroSync() {
  showToast('Syncing with Xero...','info');
  try {
    await opsPost('trigger_xero_sync',{});
    // Wait briefly for sync to process
    await new Promise(function(r){setTimeout(r,3000);});
    showToast('Xero data refreshed','success');
    loadClearDebt();
  } catch(e) { showToast('Sync failed: '+e.message,'warning'); }
}
