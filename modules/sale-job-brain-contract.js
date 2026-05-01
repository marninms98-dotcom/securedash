// ════════════════════════════════════════════════════════════
// SecureWorks — Secure Sale (Slice 4A.1) — Job Brain contract validator
//
// The Secure Sale cockpit consumes a Job Brain payload (index +
// per-job) shape that T5's shared JARVIS memory reader will
// eventually return. Today the fixture loader satisfies the
// contract; Slice 4B swaps the fixture path for T5's live reader.
// Before that swap is safe, we need a programmatic check that
// T5's live output matches what the cockpit expects.
//
// This module is that check. It is:
//   • Pure. No fetch, no XHR, no sendBeacon, no localStorage.
//   • Read-only. Never mutates the payload it inspects.
//   • Honest. Returns structured errors instead of throwing.
//   • Reusable. Same shape T5 can run against their reader output
//     post-swap, with zero code changes here.
//
// Public API:
//   SALE_JOB_BRAIN_CONTRACT.validateIndex(payload) → Verdict
//   SALE_JOB_BRAIN_CONTRACT.validateJobBrain(payload) → Verdict
//
// where Verdict =
//   {
//     ok: boolean,                 // false iff any errors[].severity === 'error'
//     errors: [
//       {
//         field:    string,        // dotted path: 'jobs[3].client_phone'
//         expected: string,        // 'string' | 'array' | 'iso-timestamp' | …
//         actual:   string,        // what we found, stringified
//         severity: 'error' | 'warn' | 'info',
//         hint?:    string,        // human-readable nudge
//       }, …
//     ]
//   }
//
// Slice 1 amendments still in force (validator does not police):
//   • Sender identity is type-based — that's the policy module.
//   • do_not_chase blocks — that's the policy module.
//   • Stop-words pause + alert — that's the policy module.
//
// T5 production note (2026-05-01): `ai_proposed_actions` rows may
// expose either `id` OR `proposal_id` as the canonical proposal
// identifier. The validator accepts either; uses `proposal_id`
// when both are present (matches T5's reader after PR #14). If a
// row has neither, we surface a `warn` and recommend normalisation
// upstream rather than failing.
// ════════════════════════════════════════════════════════════

(function (root, factory) {
  'use strict';
  var exports = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  } else {
    root.SALE_JOB_BRAIN_CONTRACT = exports;
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // ── Helpers ────────────────────────────────────────────────

  function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function isArray(v)  { return Array.isArray(v); }
  function isString(v) { return typeof v === 'string'; }
  function isNumber(v) { return typeof v === 'number' && !isNaN(v); }
  function isISO(v) {
    if (!isString(v)) return false;
    var t = +new Date(v);
    return !isNaN(t);
  }

  function pushError(errors, field, expected, actual, severity, hint) {
    errors.push({
      field: field,
      expected: expected,
      actual: actual === undefined ? 'undefined'
              : actual === null ? 'null'
              : Array.isArray(actual) ? 'array(' + actual.length + ')'
              : isObject(actual) ? 'object(keys=' + Object.keys(actual).length + ')'
              : isString(actual) ? 'string(' + JSON.stringify(actual.slice(0, 60) + (actual.length > 60 ? '…' : '')) + ')'
              : String(actual),
      severity: severity || 'error',
      hint: hint || undefined,
    });
  }

  // Resolves a proposal-id-compatible identifier from a row.
  // T5's production reader exposes `proposal_id`; the cockpit's
  // fixture used `id`. Both are accepted; we surface a warn if a
  // row has neither.
  function resolveProposalId(row) {
    if (!row) return null;
    if (isString(row.proposal_id) && row.proposal_id) return row.proposal_id;
    if (isString(row.id) && row.id) return row.id;
    return null;
  }

  // ── Job validators ─────────────────────────────────────────

  function checkJob(job, path, errors) {
    if (!isObject(job)) {
      pushError(errors, path, 'object', job);
      return;
    }
    if (!isString(job.id) || !job.id) {
      pushError(errors, path + '.id', 'non-empty string (uuid)', job.id);
    }
    if (!isString(job.job_number) || !job.job_number) {
      pushError(errors, path + '.job_number', 'non-empty string', job.job_number);
    }
    if (!isString(job.type)) {
      pushError(errors, path + '.type', 'string (patio | combo | fencing | decking | general)', job.type);
    } else if (!/^(patio|combo|fencing|decking|general)$/i.test(job.type)) {
      pushError(errors, path + '.type', 'patio | combo | fencing | decking | general', job.type, 'warn',
        'Unknown type — sender resolution will block. Confirm with type-based sender rules.');
    }
    // Optional but commonly present
    if (job.client_phone !== null && job.client_phone !== undefined && !isString(job.client_phone)) {
      pushError(errors, path + '.client_phone', 'string | null', job.client_phone, 'warn');
    }
    if (job.client_email !== undefined && job.client_email !== null && !isString(job.client_email)) {
      pushError(errors, path + '.client_email', 'string | null', job.client_email, 'warn');
    }
    if (job.created_at !== undefined && !isISO(job.created_at)) {
      pushError(errors, path + '.created_at', 'iso-timestamp', job.created_at, 'warn');
    }
  }

  function checkEvent(event, path, errors) {
    if (!isObject(event)) {
      pushError(errors, path, 'object', event);
      return;
    }
    if (!isString(event.event_type) || !event.event_type) {
      pushError(errors, path + '.event_type', 'non-empty string', event.event_type);
    }
    if (event.job_id !== null && event.job_id !== undefined && !isString(event.job_id)) {
      pushError(errors, path + '.job_id', 'string (uuid) | null | undefined', event.job_id, 'warn',
        'business_events.job_id is now uuid in production (migration 20260424120000); fixture rows should also be uuid-shaped strings.');
    }
    if (!isISO(event.occurred_at)) {
      pushError(errors, path + '.occurred_at', 'iso-timestamp', event.occurred_at);
    }
    if (event.payload !== undefined && !isObject(event.payload) && !isArray(event.payload)) {
      pushError(errors, path + '.payload', 'object | array', event.payload, 'warn');
    }
  }

  function checkFact(fact, path, errors) {
    if (!isObject(fact)) {
      pushError(errors, path, 'object', fact);
      return;
    }
    if (!isString(fact.kind) || !fact.kind) {
      pushError(errors, path + '.kind', 'non-empty string', fact.kind);
    }
    if (fact.value === undefined) {
      pushError(errors, path + '.value', 'any (defined)', fact.value, 'warn');
    }
    if (fact.provenance !== undefined && !isObject(fact.provenance)) {
      pushError(errors, path + '.provenance', 'object | undefined', fact.provenance, 'warn',
        'Provenance is documented as { source, promoted_at, writer_role, untrusted? }. Reader output should preserve.');
    }
  }

  function checkProposedAction(pa, path, errors) {
    if (!isObject(pa)) {
      pushError(errors, path, 'object', pa);
      return;
    }
    var pid = resolveProposalId(pa);
    if (!pid) {
      pushError(errors, path + '.{id|proposal_id}', 'non-empty string', { id: pa.id, proposal_id: pa.proposal_id }, 'warn',
        'Production schema exposes proposal_id; fixture used id. Validator accepts either, but reader output should resolve to one.');
    }
    if (!isString(pa.job_id)) {
      pushError(errors, path + '.job_id', 'string', pa.job_id);
    }
    if (!isString(pa.action_type) || !pa.action_type) {
      pushError(errors, path + '.action_type', 'non-empty string', pa.action_type);
    }
    if (!isString(pa.status)) {
      pushError(errors, path + '.status', 'string (proposed | approved | sent | dismissed | snoozed | cancelled | …)', pa.status);
    }
    // status='proposed' is the typical lane-card path; warn if unexpected status
    if (isString(pa.status) && !/^(proposed|approved|sent|edited|dismissed|snoozed|cancelled|expired|auto_sent|auto_sent_dry|completed)$/.test(pa.status)) {
      pushError(errors, path + '.status', 'one of the documented lifecycle statuses', pa.status, 'warn',
        'Slice 4A.1 documents proposed | approved | sent | edited | dismissed | snoozed | cancelled | expired | auto_sent | auto_sent_dry | completed. Unknown status will not break the cockpit but will surface as INTERNAL chip.');
    }
    if (pa.action_payload !== undefined && !isObject(pa.action_payload)) {
      pushError(errors, path + '.action_payload', 'object | undefined', pa.action_payload, 'warn');
    }
  }

  // Message validator. Defensive posture: T5's live
  // get_job_conversation merges 5 sources and may return channels
  // beyond the original fixture set (e.g. 'crew' per the SWP-26090
  // sample documented in the cio evidence index). Unknown channels
  // and unknown directions surface as `warn`, never `error`, so the
  // validator doesn't reject T5's actual output. The cockpit
  // renderer degrades gracefully — channel chip just shows the
  // literal label. Required structural fields (occurred_at) are
  // still `error` if missing.
  var KNOWN_CHANNELS_FAMILIAR = ['sms', 'email', 'note', 'call_summary'];
  var KNOWN_CHANNELS_T5       = ['crew', 'inbox', 'spine'];
  var KNOWN_DIRECTIONS        = ['inbound', 'outbound', 'system'];

  function checkMessage(msg, path, errors) {
    if (!isObject(msg)) {
      pushError(errors, path, 'object', msg);
      return;
    }
    if (msg.job_id !== undefined && !isString(msg.job_id)) {
      pushError(errors, path + '.job_id', 'string | undefined (per-job context omits job_id)', msg.job_id, 'warn');
    }
    if (!isString(msg.channel)) {
      pushError(errors, path + '.channel', 'string', msg.channel);
    } else if (KNOWN_CHANNELS_FAMILIAR.indexOf(msg.channel) === -1
               && KNOWN_CHANNELS_T5.indexOf(msg.channel) === -1) {
      pushError(errors, path + '.channel', 'familiar (sms|email|note|call_summary) or T5 (crew|inbox|spine)', msg.channel, 'warn',
        'Unknown channel — cockpit will render the literal label. Consider adding to KNOWN_CHANNELS_T5 once confirmed by T5.');
    }
    if (!isString(msg.direction)) {
      pushError(errors, path + '.direction', 'string', msg.direction);
    } else if (KNOWN_DIRECTIONS.indexOf(msg.direction) === -1) {
      pushError(errors, path + '.direction', 'inbound | outbound | system', msg.direction, 'warn',
        'Unknown direction — cockpit defaults to system bubble. Confirm with T5 if a new direction is intended.');
    }
    if (!isISO(msg.occurred_at)) {
      pushError(errors, path + '.occurred_at', 'iso-timestamp', msg.occurred_at);
    }
    // Body / preview / subject — at least one must be present.
    // T5's live output exposes both `body` and `preview` per
    // SWP-26090 sample (preview ≤500c, body fuller). Accept any.
    var hasContent = isString(msg.body) || isString(msg.subject) || isString(msg.preview);
    if (!hasContent) {
      pushError(errors, path + '.body|.subject|.preview', 'at least one string', msg.body, 'warn',
        'Email-only messages may carry only subject; subject + body + preview all empty is suspicious.');
    }
    // Identifier compatibility: `id` OR `source_ref` is acceptable.
    // T5's reader returns source_ref pointing back to the underlying
    // row; the fixture used `id`. The cockpit doesn't currently
    // index messages by id (they're rendered chronologically),
    // so this is a `info`-level signal.
    var hasIdent = isString(msg.id) || isString(msg.source_ref);
    if (!hasIdent) {
      pushError(errors, path + '.id|.source_ref', 'at least one identifier', undefined, 'info',
        'Messages without id/source_ref render fine but cannot be deep-linked. Acceptable for v1.');
    }
  }

  function checkCoachingHint(hint, path, errors) {
    if (!isObject(hint)) {
      pushError(errors, path, 'object', hint);
      return;
    }
    if (!isString(hint.scope) || !/^(lane|action|job)$/.test(hint.scope)) {
      pushError(errors, path + '.scope', 'lane | action | job', hint.scope);
    }
    if (!isString(hint.text) || !hint.text) {
      pushError(errors, path + '.text', 'non-empty string', hint.text);
    }
    if (hint.confidence !== undefined && !isNumber(hint.confidence)) {
      pushError(errors, path + '.confidence', 'number in [0,1]', hint.confidence, 'warn');
    }
    if (isNumber(hint.confidence) && (hint.confidence < 0 || hint.confidence > 1)) {
      pushError(errors, path + '.confidence', 'number in [0,1]', hint.confidence, 'warn');
    }
    if (hint.scope === 'lane' && hint.related_lane && !/^(book|send|call)$/.test(hint.related_lane)) {
      pushError(errors, path + '.related_lane', 'book | send | call', hint.related_lane, 'warn');
    }
  }

  function checkCalendarEntry(slot, path, errors) {
    if (!isObject(slot)) {
      pushError(errors, path, 'object', slot);
      return;
    }
    if (!isString(slot.day)) {
      pushError(errors, path + '.day', 'string (ISO date or label)', slot.day);
    }
    if (!isString(slot.rep) || !/^(Nithin|Khairo)$/.test(slot.rep)) {
      pushError(errors, path + '.rep', 'Nithin | Khairo', slot.rep);
    }
    if (!isString(slot.start) || !isString(slot.end)) {
      pushError(errors, path + '.start/.end', 'HH:MM strings', { start: slot.start, end: slot.end });
    }
    if (!isString(slot.kind) || !/^(booked|proposed)$/.test(slot.kind)) {
      pushError(errors, path + '.kind', 'booked | proposed', slot.kind);
    }
  }

  // ── Public: validateIndex ──────────────────────────────────

  function validateIndex(payload) {
    var errors = [];
    if (!isObject(payload)) {
      pushError(errors, '', 'JobBrainIndex object', payload);
      return summarise(errors);
    }

    // jobs
    if (!isArray(payload.jobs)) {
      pushError(errors, 'jobs', 'array of Job', payload.jobs);
    } else {
      payload.jobs.forEach(function (j, i) { checkJob(j, 'jobs[' + i + ']', errors); });
      if (payload.jobs.length === 0) {
        pushError(errors, 'jobs', 'non-empty array', payload.jobs, 'info',
          'Empty jobs array is valid (cockpit renders empty lanes) but unusual for the reader output.');
      }
    }

    // events
    if (!isArray(payload.events)) {
      pushError(errors, 'events', 'array of Event', payload.events);
    } else {
      payload.events.forEach(function (e, i) { checkEvent(e, 'events[' + i + ']', errors); });
    }

    // jobContext: { [jobId]: Fact[] }
    if (!isObject(payload.jobContext)) {
      pushError(errors, 'jobContext', '{ [jobId]: Fact[] }', payload.jobContext);
    } else {
      var jobIds = Object.keys(payload.jobContext);
      jobIds.forEach(function (jobId) {
        var facts = payload.jobContext[jobId];
        if (!isArray(facts)) {
          pushError(errors, 'jobContext[' + jobId + ']', 'array of Fact', facts);
        } else {
          facts.forEach(function (f, i) { checkFact(f, 'jobContext[' + jobId + '][' + i + ']', errors); });
        }
      });
      // Sparseness signal: T5's reader will return job_context but facts are
      // sparse in production today. Surface as info, not error.
      if (isArray(payload.jobs) && payload.jobs.length > 0) {
        var jobsWithFacts = payload.jobs.filter(function (j) {
          var f = payload.jobContext[j.id];
          return isArray(f) && f.length > 0;
        }).length;
        var ratio = jobsWithFacts / payload.jobs.length;
        if (ratio < 0.4) {
          pushError(errors, 'jobContext', 'facts on ≥ 40% of jobs', 'facts on ' + Math.round(ratio * 100) + '% of jobs', 'info',
            'Sparse job_context facts mean the cockpit will look quieter than the fixture but won\'t break. Track extractor population separately.');
        }
      }
    }

    // proposedActions
    if (!isArray(payload.proposedActions)) {
      pushError(errors, 'proposedActions', 'array of ProposedAction', payload.proposedActions);
    } else {
      payload.proposedActions.forEach(function (pa, i) { checkProposedAction(pa, 'proposedActions[' + i + ']', errors); });
    }

    // coaching (optional but expected)
    if (payload.coaching !== undefined) {
      if (!isArray(payload.coaching)) {
        pushError(errors, 'coaching', 'array of CoachingHint', payload.coaching, 'warn');
      } else {
        payload.coaching.forEach(function (c, i) { checkCoachingHint(c, 'coaching[' + i + ']', errors); });
      }
    } else {
      pushError(errors, 'coaching', 'array of CoachingHint', undefined, 'info',
        'Optional in 4A.1 but expected once Slice 5 lands. Cockpit renders empty coaching strip when missing.');
    }

    // calendar (optional, fixture passthrough)
    if (payload.calendar !== undefined && payload.calendar !== null) {
      if (!isObject(payload.calendar)) {
        pushError(errors, 'calendar', 'object | null', payload.calendar);
      } else {
        if (!isArray(payload.calendar.windowDays)) {
          pushError(errors, 'calendar.windowDays', 'array', payload.calendar.windowDays, 'warn');
        }
        if (!isArray(payload.calendar.slots)) {
          pushError(errors, 'calendar.slots', 'array of CalendarEntry', payload.calendar.slots, 'warn');
        } else {
          payload.calendar.slots.forEach(function (s, i) { checkCalendarEntry(s, 'calendar.slots[' + i + ']', errors); });
        }
      }
    }

    // generatedAt
    if (payload.generatedAt !== undefined && !isISO(payload.generatedAt)) {
      pushError(errors, 'generatedAt', 'iso-timestamp', payload.generatedAt, 'warn');
    }

    return summarise(errors);
  }

  // ── Public: validateJobBrain ───────────────────────────────

  function validateJobBrain(payload) {
    var errors = [];
    if (!isObject(payload)) {
      pushError(errors, '', 'JobBrain object', payload);
      return summarise(errors);
    }

    // job
    if (!isObject(payload.job)) {
      pushError(errors, 'job', 'Job object', payload.job);
    } else {
      checkJob(payload.job, 'job', errors);
    }

    // events
    if (!isArray(payload.events)) {
      pushError(errors, 'events', 'array of Event', payload.events);
    } else {
      payload.events.forEach(function (e, i) { checkEvent(e, 'events[' + i + ']', errors); });
    }

    // facts
    if (!isArray(payload.facts)) {
      pushError(errors, 'facts', 'array of Fact', payload.facts);
    } else {
      payload.facts.forEach(function (f, i) { checkFact(f, 'facts[' + i + ']', errors); });
    }

    // proposedActions
    if (!isArray(payload.proposedActions)) {
      pushError(errors, 'proposedActions', 'array of ProposedAction', payload.proposedActions);
    } else {
      payload.proposedActions.forEach(function (pa, i) { checkProposedAction(pa, 'proposedActions[' + i + ']', errors); });
    }

    // conversation
    if (payload.conversation !== undefined) {
      if (!isArray(payload.conversation)) {
        pushError(errors, 'conversation', 'array of Message', payload.conversation, 'warn');
      } else {
        payload.conversation.forEach(function (m, i) { checkMessage(m, 'conversation[' + i + ']', errors); });
        // Conversation should be sorted oldest → newest for the peek.
        for (var i = 1; i < payload.conversation.length; i++) {
          var prev = +new Date(payload.conversation[i - 1].occurred_at);
          var curr = +new Date(payload.conversation[i].occurred_at);
          if (!isNaN(prev) && !isNaN(curr) && prev > curr) {
            pushError(errors, 'conversation', 'sorted oldest→newest', 'unsorted at index ' + i, 'warn',
              'Cockpit peek expects chronological order; reader output should sort or the cockpit will sort defensively.');
            break;
          }
        }
      }
    } else {
      pushError(errors, 'conversation', 'array of Message', undefined, 'info',
        'Optional. Conversation read path is gated on Slice 4.5 (ghl-proxy carve-out or PostgREST mirror). Reader output may omit until then.');
    }

    // coaching (optional)
    if (payload.coaching !== undefined) {
      if (!isArray(payload.coaching)) {
        pushError(errors, 'coaching', 'array of CoachingHint', payload.coaching, 'warn');
      } else {
        payload.coaching.forEach(function (c, i) { checkCoachingHint(c, 'coaching[' + i + ']', errors); });
      }
    }

    // calendar (per-job slots — array, not object)
    if (payload.calendar !== undefined) {
      if (!isArray(payload.calendar)) {
        pushError(errors, 'calendar', 'array of CalendarEntry (per-job slots)', payload.calendar, 'warn');
      } else {
        payload.calendar.forEach(function (s, i) { checkCalendarEntry(s, 'calendar[' + i + ']', errors); });
      }
    }

    return summarise(errors);
  }

  function summarise(errors) {
    var hasError = errors.some(function (e) { return e.severity === 'error'; });
    return {
      ok: !hasError,
      errors: errors,
    };
  }

  // ── Diagnostics helper for terminal-friendly reporting ─────

  function formatVerdict(verdict) {
    if (!verdict) return '(no verdict)';
    var ok = verdict.ok ? 'PASS' : 'FAIL';
    var counts = { error: 0, warn: 0, info: 0 };
    (verdict.errors || []).forEach(function (e) {
      if (counts[e.severity] !== undefined) counts[e.severity]++;
    });
    return ok + ' · errors=' + counts.error + ' warn=' + counts.warn + ' info=' + counts.info;
  }

  return {
    validateIndex:    validateIndex,
    validateJobBrain: validateJobBrain,
    formatVerdict:    formatVerdict,
    // Internals exposed for tests:
    _resolveProposalId: resolveProposalId,
  };
});
