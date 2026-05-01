// ════════════════════════════════════════════════════════════
// SecureWorks — Secure Sale (Preview) — Job Brain reader (Slice 4A)
//
// Shape T5 will eventually serve from a shared JARVIS Job Brain
// reader. We model that contract here in fixture form so every
// consumer (Today tab, conversation peek, calendar, performance)
// reads from the same surface — no separate sales brain.
//
// When T5 ships the real reader, this module's two _load*
// functions become the only thing that changes. Reducer, policy,
// renderer, peek, calendar — none of them change.
//
// Hard rules (enforced inline):
//   • No fetch(), no XMLHttpRequest, no navigator.sendBeacon.
//   • No localStorage writes.
//   • Slice 4A is fixture-only. forceFixtures defaults to true.
//   • The v9 safety lock that wraps the page already blocks any
//     network call; this module additionally must not attempt one.
//
// Public API:
//   SALE_JOB_BRAIN.loadIndex({forceFixtures = true, signal} = {})
//     → Promise<JobBrainIndex>
//   SALE_JOB_BRAIN.loadJobBrain(jobId, {forceFixtures = true, signal} = {})
//     → Promise<JobBrain>
//
// Slice 4A amendments (Marnin 2026-04-30 review):
//   • Sender identity is type-based, unconditional — pulled from
//     window.SALE_POLICY.senderForJob if available.
//   • Secure Sale CONSUMES this contract; it does not own a
//     separate brain. T5 owns the writer + future real reader.
//   • job_context already exists in production (Slice 1 amendment
//     §1) — T5 owns the extractor / fact-writing logic. T4 only
//     reads, and only via this module.
//   • extracted_context_candidates is parked — do not model.
// ════════════════════════════════════════════════════════════

(function (root, factory) {
  'use strict';
  var exports = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  } else {
    root.SALE_JOB_BRAIN = exports;
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // ── Internal: fixture-mode index loader ────────────────────
  //
  // Materialises a JobBrainIndex payload out of
  // window.SALE_PREVIEW_FIXTURES. Identical shape to what T5's
  // shared reader will return via PostgREST / RPC in Slice 4B.

  function fixturesAvailable() {
    return typeof window !== 'undefined'
      && window.SALE_PREVIEW_FIXTURES
      && Array.isArray(window.SALE_PREVIEW_FIXTURES.jobs);
  }

  function _loadIndexFixture() {
    if (!fixturesAvailable()) {
      throw new Error('SALE_JOB_BRAIN: window.SALE_PREVIEW_FIXTURES missing — load the fixtures script first.');
    }
    var F = window.SALE_PREVIEW_FIXTURES;
    return {
      jobs:            (F.jobs            || []).slice(),
      events:          (F.events          || []).slice(),
      jobContext:      _shallowCopyContext(F.jobContext || {}),
      proposedActions: (F.proposedActions || []).slice(),
      coaching:        (F.coaching        || []).slice(),
      calendar:        F.calendar         || null,
      generatedAt:     F.engineNow        || new Date().toISOString(),
      _brand:          F._brand           || 'fixture',
    };
  }

  function _shallowCopyContext(ctx) {
    var out = {};
    var keys = Object.keys(ctx || {});
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = (ctx[keys[i]] || []).slice();
    }
    return out;
  }

  // ── Internal: fixture-mode per-job loader ──────────────────
  //
  // Returns a JobBrain payload — operational truth + all the
  // surrounding context (events, facts, proposed actions,
  // conversation, coaching, calendar slots) for one job.

  function _loadJobBrainFixture(jobId) {
    if (!fixturesAvailable()) {
      throw new Error('SALE_JOB_BRAIN: window.SALE_PREVIEW_FIXTURES missing — load the fixtures script first.');
    }
    var F = window.SALE_PREVIEW_FIXTURES;
    var job = (F.jobs || []).find(function (j) { return j && j.id === jobId; });
    if (!job) {
      throw new Error('SALE_JOB_BRAIN: job not found in fixtures: ' + jobId);
    }
    var events = (F.events || []).filter(function (e) { return e && e.job_id === jobId; });
    events.sort(function (a, b) {
      var ta = +new Date(a.occurred_at || a.created_at || 0);
      var tb = +new Date(b.occurred_at || b.created_at || 0);
      return tb - ta;
    });
    var facts = (F.jobContext && F.jobContext[jobId]) || [];
    var proposed = (F.proposedActions || []).filter(function (p) { return p && p.job_id === jobId && p.status === 'proposed'; });
    var conversation = (F.conversation && F.conversation[jobId]) || [];
    // Conversation goes oldest → newest (rendering order is top-down chronological).
    conversation = conversation.slice().sort(function (a, b) {
      var ta = +new Date(a.occurred_at || 0);
      var tb = +new Date(b.occurred_at || 0);
      return ta - tb;
    });
    var coaching = (F.coaching || []).filter(function (c) {
      if (!c) return false;
      if (c.scope === 'job' && c.related_job_id === jobId) return true;
      if (c.scope === 'action' && c.related_job_id === jobId) return true;
      return false;
    });
    var calendarSlots = ((F.calendar && F.calendar.slots) || []).filter(function (s) {
      return s && (s.job_id === jobId || (job.job_number && s.job_number === job.job_number));
    });
    return {
      job:             job,
      events:          events,
      facts:           facts,
      proposedActions: proposed,
      conversation:    conversation,
      coaching:        coaching,
      calendar:        calendarSlots,
    };
  }

  // ── Internal: optional contract drift warning ──────────────
  //
  // Slice 4A.1 — observational only. If
  // window.SALE_JOB_BRAIN_CONTRACT is loaded, run validateIndex /
  // validateJobBrain on the loader output and console.warn on
  // drift. Never throws; never alters the payload. Surfaces
  // contract violations early once T5's real reader plugs in.

  function _maybeValidateIndex(payload) {
    try {
      var contract = (typeof window !== 'undefined') && window.SALE_JOB_BRAIN_CONTRACT;
      if (!contract || typeof contract.validateIndex !== 'function') return;
      var v = contract.validateIndex(payload);
      var realIssues = (v.errors || []).filter(function (e) { return e.severity === 'error' || e.severity === 'warn'; });
      if (realIssues.length) {
        console.warn('[sale-job-brain] contract drift on loadIndex',
          { ok: v.ok, errors: realIssues, summary: typeof contract.formatVerdict === 'function' ? contract.formatVerdict(v) : null });
      }
    } catch (e) { /* observational; never block the loader */ }
  }

  function _maybeValidateJobBrain(payload, jobId) {
    try {
      var contract = (typeof window !== 'undefined') && window.SALE_JOB_BRAIN_CONTRACT;
      if (!contract || typeof contract.validateJobBrain !== 'function') return;
      var v = contract.validateJobBrain(payload);
      var realIssues = (v.errors || []).filter(function (e) { return e.severity === 'error' || e.severity === 'warn'; });
      if (realIssues.length) {
        console.warn('[sale-job-brain] contract drift on loadJobBrain',
          { jobId: jobId, ok: v.ok, errors: realIssues, summary: typeof contract.formatVerdict === 'function' ? contract.formatVerdict(v) : null });
      }
    } catch (e) { /* observational; never block the loader */ }
  }

  // ── Slice 4B Path A — real reader (PostgREST authenticated) ─
  //
  // Marnin chose Path A (2026-05-01). T5 exposes the cockpit's
  // Job Brain data via PostgREST authenticated SELECT. The v9
  // safety lock allows GET on /rest/v1/* — these reads pass the
  // lock without any carve-out. See:
  //   secureworks-docs/cio/evidence/secure-sale-cockpit-2026-04-30/
  //     slice-4b-path-a-acceptance.md
  //
  // Default is still forceFixtures: true. The real path only
  // activates when the caller explicitly passes {forceFixtures:
  // false}. Per-source try/catch falls back to the fixture for
  // any source that errors out, so partial T5 exposure (e.g.
  // jobs live + job_context still gated) gracefully degrades
  // rather than breaking the cockpit.

  var REAL_READER_CONFIG = {
    jobsLimit:      500,
    jobsStatuses:   ['draft', 'quoted', 'accepted'],
    eventsLimit:    2000,
    eventsWindowDays: 90,
    eventsKinds: [
      'quote.sent', 'quote.viewed', 'quote.accepted', 'quote.declined',
      'client.reply', 'client.sms_out', 'client.email_out',
      'client.call_complete', 'client.appointment', 'client.question',
      'site_visit.completed', 'ghl.note_added', 'ghl.stage_changed',
    ],
    factsKinds: [
      'client_preference', 'access_note', 'availability_window',
      'do_not_chase', 'payment_agreement', 'unusual_scope',
      'council_hold', 'readiness_blocker', 'readiness_override',
      'supplier_delay', 'qualified',
    ],
    proposedActionsLimit: 500,
  };

  function _supabaseClient() {
    if (typeof window === 'undefined') return null;
    // The cockpit's shared/cloud.js creates the client and exposes
    // it as window.SECUREWORKS_CLOUD.supabase (line ~1485). That's
    // the canonical reference. Also accept window.sb for tests
    // and window.supabase if it happens to be a fully-formed
    // client (unusual, since the lib usually exports the factory).
    var candidates = [
      typeof window.SECUREWORKS_CLOUD === 'object' && window.SECUREWORKS_CLOUD ? window.SECUREWORKS_CLOUD.supabase : null,
      window.sb,
      window.supabase,
    ];
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (c && typeof c.from === 'function') return c;
    }
    return null;
  }

  // Mirrors auth-gate.js's _waitForCloud — cold-start race where
  // window.SECUREWORKS_CLOUD takes a tick to assemble. Polls every
  // 50ms up to 2s, then resolves whatever's available (null if
  // nothing). Caller decides whether to fall back to fixture.
  function _waitForSupabaseClient(maxMs) {
    return new Promise(function (resolve) {
      var sb = _supabaseClient();
      if (sb) { resolve(sb); return; }
      var deadline = Date.now() + (maxMs || 2000);
      var iv = setInterval(function () {
        var c = _supabaseClient();
        if (c) { clearInterval(iv); resolve(c); return; }
        if (Date.now() >= deadline) { clearInterval(iv); resolve(null); }
      }, 50);
    });
  }

  function _isoCutoff(daysAgo) {
    return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  }

  function _readJobsReal(sb, signal) {
    return sb
      .from('jobs')
      .select('id,job_number,type,client_name,client_phone,client_email,site_address,site_suburb,status,value_inc_gst,created_at,sent_at,accepted_at')
      .in('status', REAL_READER_CONFIG.jobsStatuses)
      .order('created_at', { ascending: false })
      .limit(REAL_READER_CONFIG.jobsLimit)
      .abortSignal && (sb.from('jobs').abortSignal(signal))
      || sb
        .from('jobs')
        .select('id,job_number,type,client_name,client_phone,client_email,site_address,site_suburb,status,value_inc_gst,created_at,sent_at,accepted_at')
        .in('status', REAL_READER_CONFIG.jobsStatuses)
        .order('created_at', { ascending: false })
        .limit(REAL_READER_CONFIG.jobsLimit);
  }

  // Helper: thin wrapper that returns {data, error} from a query
  // and never throws, so per-source fallback stays clean.
  function _safeQuery(promise) {
    return Promise.resolve(promise)
      .then(function (r) { return r && r.error ? { data: null, error: r.error } : { data: (r && r.data) || [], error: null }; })
      .catch(function (e) { return { data: null, error: e }; });
  }

  function _loadIndexReal(signal) {
    return _waitForSupabaseClient().then(function (sb) {
      if (!sb) {
        return Promise.reject(new Error('SALE_JOB_BRAIN: window.SECUREWORKS_CLOUD.supabase not available after 2s; falling back to fixture'));
      }
      return _loadIndexRealWithClient(sb, signal);
    });
  }

  function _loadIndexRealWithClient(sb, signal) {
    var cutoff = _isoCutoff(REAL_READER_CONFIG.eventsWindowDays);
    // Production schema confirmed via headless probe 2026-05-01:
    //   • jobs: column list varies; use `*` for tolerance — value
    //     columns may be named value_inc_gst, value_excl_gst,
    //     total_inc_gst, etc. Reducer uses optional chaining; if
    //     a column is absent, urgency just gets a 0 boost.
    //   • ai_proposed_actions: production has `proposal_id` (NOT
    //     `id`). Columns: proposal_id, trace_id, action_type,
    //     action_payload, confidence_score, status, auto_threshold,
    //     job_id, contact_id, contact_name, contact_phone,
    //     drafted_message, metadata, sent_at, dismissed_at,
    //     expires_at, org_id, plus a few more. Use `*`.
    //   • business_events: id, sequence_number, event_type, source,
    //     occurred_at, recorded_at, entity_type, entity_id,
    //     correlation_id, causation_id, job_id, payload, metadata,
    //     schema_version. Specific list works.
    //   • job_context: still permissive. Use `*` for safety.
    var queries = {
      jobs: _safeQuery(sb.from('jobs')
        .select('*')
        .in('status', REAL_READER_CONFIG.jobsStatuses)
        .order('created_at', { ascending: false })
        .limit(REAL_READER_CONFIG.jobsLimit)),
      events: _safeQuery(sb.from('business_events')
        .select('id,job_id,event_type,occurred_at,payload,metadata')
        .in('event_type', REAL_READER_CONFIG.eventsKinds)
        .gte('occurred_at', cutoff)
        .order('occurred_at', { ascending: false })
        .limit(REAL_READER_CONFIG.eventsLimit)),
      facts: _safeQuery(sb.from('job_context')
        .select('*')
        .in('kind', REAL_READER_CONFIG.factsKinds)
        .order('updated_at', { ascending: false })),
      proposed: _safeQuery(sb.from('ai_proposed_actions')
        .select('*')
        .eq('status', 'proposed')
        .limit(REAL_READER_CONFIG.proposedActionsLimit)),
    };
    return Promise.all([queries.jobs, queries.events, queries.facts, queries.proposed])
      .then(function (results) {
        var fxIndex = _loadIndexFixture();
        var sources = { jobs: 'real', events: 'real', jobContext: 'real', proposedActions: 'real' };
        var errors = [];

        var jobs = results[0].data;
        if (results[0].error) { jobs = fxIndex.jobs; sources.jobs = 'fallback'; errors.push({ source: 'jobs', message: String(results[0].error.message || results[0].error) }); }
        else if (!jobs || !jobs.length) { jobs = fxIndex.jobs; sources.jobs = 'fallback'; errors.push({ source: 'jobs', message: 'empty result — falling back to fixture' }); }

        var events = results[1].data;
        if (results[1].error) { events = fxIndex.events; sources.events = 'fallback'; errors.push({ source: 'events', message: String(results[1].error.message || results[1].error) }); }

        var facts = results[2].data;
        var jobContext;
        if (results[2].error) { jobContext = fxIndex.jobContext; sources.jobContext = 'fallback'; errors.push({ source: 'jobContext', message: String(results[2].error.message || results[2].error) }); }
        else { jobContext = _groupBy(facts || [], 'job_id'); }

        var proposed = results[3].data;
        if (results[3].error) { proposed = fxIndex.proposedActions; sources.proposedActions = 'fallback'; errors.push({ source: 'proposedActions', message: String(results[3].error.message || results[3].error) }); }

        return {
          jobs:            jobs || [],
          events:          events || [],
          jobContext:      jobContext || {},
          proposedActions: proposed || [],
          coaching:        fxIndex.coaching,           // fixture passthrough until Slice 5
          calendar:        fxIndex.calendar,            // fixture passthrough until Slice 10
          generatedAt:     new Date().toISOString(),
          _brand:          'real',
          sources:         sources,
          diagnostics:     { errors: errors },
        };
      });
  }

  function _groupBy(rows, key) {
    var out = {};
    for (var i = 0; i < rows.length; i++) {
      var k = rows[i] && rows[i][key];
      if (!k) continue;
      if (!out[k]) out[k] = [];
      out[k].push(rows[i]);
    }
    return out;
  }

  function _loadJobBrainReal(jobId, signal) {
    return _waitForSupabaseClient().then(function (sb) {
      if (!sb) {
        return Promise.reject(new Error('SALE_JOB_BRAIN: window.SECUREWORKS_CLOUD.supabase not available after 2s'));
      }
      return _loadJobBrainRealWithClient(sb, jobId, signal);
    });
  }

  function _loadJobBrainRealWithClient(sb, jobId, signal) {
    // Same schema-tolerance as _loadIndexReal — `*` for jobs /
    // job_context / ai_proposed_actions; specific column list for
    // business_events.
    var queries = {
      job: _safeQuery(sb.from('jobs')
        .select('*')
        .eq('id', jobId)
        .limit(1)),
      events: _safeQuery(sb.from('business_events')
        .select('id,job_id,event_type,occurred_at,payload,metadata')
        .eq('job_id', jobId)
        .order('occurred_at', { ascending: false })
        .limit(50)),
      facts: _safeQuery(sb.from('job_context')
        .select('*')
        .eq('job_id', jobId)),
      proposed: _safeQuery(sb.from('ai_proposed_actions')
        .select('*')
        .eq('job_id', jobId)
        .eq('status', 'proposed')),
    };
    return Promise.all([queries.job, queries.events, queries.facts, queries.proposed])
      .then(function (results) {
        var fxBrain = (function () {
          try { return _loadJobBrainFixture(jobId); } catch (e) { return null; }
        })();
        var jobRow = (results[0].data || [])[0] || (fxBrain && fxBrain.job) || null;
        if (!jobRow) {
          throw new Error('SALE_JOB_BRAIN: job ' + jobId + ' not found in real reader or fixture');
        }
        return {
          job:             jobRow,
          events:          results[1].data || (fxBrain ? fxBrain.events : []),
          facts:           results[2].data || (fxBrain ? fxBrain.facts : []),
          proposedActions: results[3].data || (fxBrain ? fxBrain.proposedActions : []),
          conversation:    fxBrain ? fxBrain.conversation : [],   // Slice 4.5 will swap
          coaching:        fxBrain ? fxBrain.coaching : [],        // Slice 5 will swap
          calendar:        fxBrain ? fxBrain.calendar : [],
          _brand:          'real',
        };
      });
  }

  // ── Public: loadIndex ──────────────────────────────────────

  function loadIndex(opts) {
    opts = opts || {};
    // Default forceFixtures = true. Real reader only fires when
    // caller explicitly passes {forceFixtures: false}. Slice 4B
    // Path A scaffold — defaults intentionally safe.
    var forceFixtures = opts.forceFixtures !== false;
    var signal = opts.signal || null;

    return new Promise(function (resolve, reject) {
      try {
        if (signal && signal.aborted) {
          reject(new Error('SALE_JOB_BRAIN.loadIndex aborted'));
          return;
        }
        if (forceFixtures) {
          var payload = _loadIndexFixture();
          _maybeValidateIndex(payload);
          resolve(payload);
          return;
        }
        // Real-reader path (Slice 4B Path A). Per-source fallback;
        // never throws due to one source failing.
        _loadIndexReal(signal).then(function (payload) {
          _maybeValidateIndex(payload);
          resolve(payload);
        }).catch(function (err) {
          // Hard failure (e.g. supabase client unavailable) — fall
          // back to full fixture and surface the cause.
          console.warn('[sale-job-brain] real-reader path failed; falling back to full fixture', err && err.message);
          var fxIndex = _loadIndexFixture();
          fxIndex._brand = 'fallback';
          fxIndex.sources = { jobs: 'fixture', events: 'fixture', jobContext: 'fixture', proposedActions: 'fixture' };
          fxIndex.diagnostics = { errors: [{ source: 'all', message: String(err && err.message || err) }] };
          _maybeValidateIndex(fxIndex);
          resolve(fxIndex);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // ── Public: loadJobBrain ───────────────────────────────────

  function loadJobBrain(jobId, opts) {
    opts = opts || {};
    var forceFixtures = opts.forceFixtures !== false;
    var signal = opts.signal || null;

    return new Promise(function (resolve, reject) {
      try {
        if (!jobId) {
          reject(new Error('SALE_JOB_BRAIN.loadJobBrain: jobId required'));
          return;
        }
        if (signal && signal.aborted) {
          reject(new Error('SALE_JOB_BRAIN.loadJobBrain aborted'));
          return;
        }
        if (forceFixtures) {
          var payload = _loadJobBrainFixture(jobId);
          _maybeValidateJobBrain(payload, jobId);
          resolve(payload);
          return;
        }
        // Slice 4B Path A real-reader path. Falls back to fixture
        // if the supabase client is unavailable. Conversation +
        // coaching + calendar arrays still come from fixtures —
        // those land separately in Slice 4.5 / Slice 5 / Slice 10.
        _loadJobBrainReal(jobId, signal).then(function (payload) {
          _maybeValidateJobBrain(payload, jobId);
          resolve(payload);
        }).catch(function (err) {
          console.warn('[sale-job-brain] real-reader job-brain path failed; falling back to fixture', err && err.message);
          try {
            var fb = _loadJobBrainFixture(jobId);
            fb._brand = 'fallback';
            _maybeValidateJobBrain(fb, jobId);
            resolve(fb);
          } catch (e2) {
            reject(e2);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // ── Public: helper — find the JobBrain for a given job_number ──
  //
  // The cockpit identifies cards by job_number (human-readable),
  // not job_id (uuid). This helper bridges so callers can write
  // `loadJobBrainByNumber('SWP-FIX-001')` without re-finding the
  // job manually each time.

  function loadJobBrainByNumber(jobNumber, opts) {
    return new Promise(function (resolve, reject) {
      try {
        if (!fixturesAvailable()) {
          reject(new Error('SALE_JOB_BRAIN: fixtures unavailable'));
          return;
        }
        var F = window.SALE_PREVIEW_FIXTURES;
        var job = (F.jobs || []).find(function (j) { return j && j.job_number === jobNumber; });
        if (!job) {
          // Pipeline-only fixtures don't carry an id; resolve a
          // synthetic stub so the renderer can degrade gracefully.
          var pipelineHit = null;
          var pipelineCols = ['draft', 'quoted', 'accepted', 'scheduled', 'done'];
          var pipeline = F.pipeline || {};
          for (var i = 0; i < pipelineCols.length; i++) {
            var col = pipeline[pipelineCols[i]] || [];
            pipelineHit = col.find(function (j) { return j && j.job_number === jobNumber; });
            if (pipelineHit) break;
          }
          if (pipelineHit) {
            resolve({
              job:             pipelineHit,
              events:          [],
              facts:           [],
              proposedActions: [],
              conversation:    [],
              coaching:        [],
              calendar:        [],
            });
            return;
          }
          reject(new Error('SALE_JOB_BRAIN: job_number not found: ' + jobNumber));
          return;
        }
        loadJobBrain(job.id, opts).then(resolve, reject);
      } catch (e) { reject(e); }
    });
  }

  // ── Diagnostics ─────────────────────────────────────────────

  function diagnostics() {
    if (!fixturesAvailable()) {
      return { fixturesLoaded: false };
    }
    var F = window.SALE_PREVIEW_FIXTURES;
    return {
      fixturesLoaded:  true,
      brand:           F._brand || 'unknown',
      engineNow:       F.engineNow || null,
      jobsCount:       (F.jobs || []).length,
      eventsCount:     (F.events || []).length,
      contextCount:    Object.keys(F.jobContext || {}).length,
      proposedCount:   (F.proposedActions || []).length,
      conversationCount: Object.keys(F.conversation || {}).length,
      coachingCount:   (F.coaching || []).length,
      calendarSlotCount: ((F.calendar && F.calendar.slots) || []).length,
    };
  }

  // ── Public API ──────────────────────────────────────────────

  return {
    loadIndex:           loadIndex,
    loadJobBrain:        loadJobBrain,
    loadJobBrainByNumber: loadJobBrainByNumber,
    diagnostics:         diagnostics,
    // Exposed for tests; also useful for the renderer's lane
    // card → peek bridge.
    _loadIndexFixture:    _loadIndexFixture,
    _loadJobBrainFixture: _loadJobBrainFixture,
  };
});
