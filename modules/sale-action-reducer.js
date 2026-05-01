// ════════════════════════════════════════════════════════════
// SecureWorks — Secure Sale Slice 2 — Action Reducer
//
// Pure module. No DOM, no fetch, no localStorage, no Supabase.
// Takes raw fixture data + `now` and derives:
//   • performance strip — basic system-wide numbers (no pretend per-rep)
//   • Book / Send / Call lane buckets — derived, ranked by urgency
//   • calendar slots passthrough (display surface only)
//
// The reducer is the single source of truth for what shows on the
// Today cockpit. The UI renders whatever the reducer outputs. Future
// Slice 4 swaps the fixture inputs for real read adapters; the
// reducer signature does not change.
//
// Contract:
//   reduce({
//     jobs:           Job[],
//     events:         Event[],          // business_events shape
//     jobContext:     { [jobId]: Fact[] },
//     proposedActions: ProposedAction[],
//     now:            Date | ISO string,    // REQUIRED for deterministic tests
//     config?:        ReducerConfig,
//   }) → {
//     performance: { week_quoted_value, week_won_value, accepted_count,
//                    queue_count, fixture: true },
//     lanes: {
//       book: LaneBucket[],   // [{ title, items: LaneCard[] }]
//       send: LaneBucket[],
//       call: LaneBucket[],
//     },
//     calendar:   raw calendar fixture, untouched,
//     diagnostics: { jobsConsidered, lanesPopulated },
//   }
//
// LaneCard shape:
//   {
//     job:                   Job (full),
//     state:                 string (ENQUIRED/QUALIFIED/SENT/VIEWED/...),
//     reason:                string,
//     urgency:               number (higher = more urgent),
//     proposed_action:       ProposedAction | null,
//     bucket_id:             string (e.g. 'no_first_contact'),
//   }
// ════════════════════════════════════════════════════════════

(function (root, factory) {
  'use strict';
  var exports = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  } else {
    root.SALE_REDUCER = exports;
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var DEFAULT_CONFIG = Object.freeze({
    firstContactMaxHours: 24,
    qualifyMaxDays: 2,
    bookingMaxDays: 5,
    siteVisitToScopeMaxDays: 7,
    sentNotViewedDays: 1,
    viewedNoReplyDays: 3,
    questionUnansweredDays: 2,
    staleQuoteDays: 14,
  });

  function toDate(v) {
    if (v instanceof Date) return v;
    if (typeof v === 'string' || typeof v === 'number') {
      var d = new Date(v);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  function hoursBetween(later, earlier) {
    var a = toDate(later); var b = toDate(earlier);
    if (!a || !b) return null;
    return (a.getTime() - b.getTime()) / (60 * 60 * 1000);
  }

  function daysBetween(later, earlier) {
    var h = hoursBetween(later, earlier);
    return h === null ? null : h / 24;
  }

  function eventsFor(events, jobId) {
    if (!Array.isArray(events)) return [];
    return events.filter(function (e) { return e && e.job_id === jobId; });
  }

  function lastEvent(events, type) {
    if (!Array.isArray(events)) return null;
    var matches = events.filter(function (e) { return e && e.event_type === type; });
    if (!matches.length) return null;
    matches.sort(function (a, b) {
      var ta = +new Date(a.occurred_at || a.created_at || 0);
      var tb = +new Date(b.occurred_at || b.created_at || 0);
      return tb - ta;
    });
    return matches[0];
  }

  function hasEvent(events, type) { return !!lastEvent(events, type); }

  function factsFor(jobContext, jobId) {
    if (!jobContext || typeof jobContext !== 'object') return [];
    return jobContext[jobId] || [];
  }

  function hasFact(facts, kind) {
    if (!Array.isArray(facts)) return false;
    return facts.some(function (f) { return f && f.kind === kind; });
  }

  function proposalsFor(proposedActions, jobId) {
    if (!Array.isArray(proposedActions)) return [];
    return proposedActions.filter(function (p) { return p && p.job_id === jobId && p.status === 'proposed'; });
  }

  // ── Job state derivation (Loop A + Loop B) ─────────────────

  function deriveJobState(job, events, facts, now, config) {
    var status = (job.status || '').toLowerCase();
    var lastSmsOut   = lastEvent(events, 'client.sms_out');
    var lastEmailOut = lastEvent(events, 'client.email_out');
    var lastCallComplete = lastEvent(events, 'client.call_complete');
    var firstContactEv = lastSmsOut || lastEmailOut || lastCallComplete;
    var qualifiedFact = hasFact(facts, 'qualified');
    var bookingEv = lastEvent(events, 'client.appointment');
    var siteVisitDoneEv = lastEvent(events, 'site_visit.completed');
    var sentEv = lastEvent(events, 'quote.sent');
    var viewedEv = lastEvent(events, 'quote.viewed');
    var lastClientQuestionEv = lastEvent(events, 'client.question');

    // Loop B states first (more specific).
    if (status === 'accepted') return { name: 'ACCEPTED', loop: 'B' };
    if (sentEv) {
      var sentAt = sentEv.occurred_at || sentEv.created_at || job.sent_at;
      var sentAtMs = +new Date(sentAt);
      var ageDays = daysBetween(now, sentAt);
      // CLARIFYING fires only for questions that arrived AFTER the
      // quote was sent. A pre-quote question is part of qualification
      // dialog; sending the quote IS the implicit answer, even if the
      // rep never logged an outbound. Without this gate, stale
      // pre-quote questions would keep driving the Send lane forever.
      if (lastClientQuestionEv && +new Date(lastClientQuestionEv.occurred_at) > sentAtMs) {
        // Once we know the question is post-quote, it counts as
        // unanswered unless the rep has sent a real outbound
        // (sms_out / email_out / call_complete) AFTER the question.
        // Comparing to client.reply (inbound) would be wrong — that's
        // the client speaking, not the rep.
        var qAt = +new Date(lastClientQuestionEv.occurred_at);
        var repAnsweredAfter = false;
        [lastSmsOut, lastEmailOut, lastCallComplete].forEach(function (ev) {
          if (!ev) return;
          var oa = +new Date(ev.occurred_at || ev.created_at || 0);
          if (oa > qAt) repAnsweredAfter = true;
        });
        if (!repAnsweredAfter) {
          return { name: 'CLARIFYING', loop: 'B', sentAt: sentAt, ageDays: ageDays };
        }
      }
      if (viewedEv) {
        return { name: 'VIEWED', loop: 'B', sentAt: sentAt, ageDays: ageDays, viewedAt: viewedEv.occurred_at };
      }
      if (ageDays !== null && ageDays >= config.staleQuoteDays) {
        return { name: 'STALE', loop: 'B', sentAt: sentAt, ageDays: ageDays };
      }
      return { name: 'SENT', loop: 'B', sentAt: sentAt, ageDays: ageDays };
    }

    // Loop A states.
    if (siteVisitDoneEv && status !== 'quoted') {
      return { name: 'SITE_VISIT_DONE', loop: 'A', siteVisitAt: siteVisitDoneEv.occurred_at };
    }
    if (bookingEv && !siteVisitDoneEv) {
      return { name: 'BOOKED', loop: 'A', bookedAt: bookingEv.occurred_at };
    }
    if (qualifiedFact && !bookingEv) {
      return { name: 'QUALIFIED', loop: 'A' };
    }
    if (firstContactEv && !qualifiedFact) {
      return { name: 'ACKNOWLEDGED', loop: 'A' };
    }
    return { name: 'ENQUIRED', loop: 'A', createdAt: job.created_at };
  }

  // ── Bucket assignment ─────────────────────────────────────

  function classifyJob(job, events, facts, proposals, now, config) {
    var state = deriveJobState(job, events, facts, now, config);

    // do_not_chase facts mean the job appears in Call lane only as a
    // human-attention card (rep should know automation is paused).
    var dnc = hasFact(facts, 'do_not_chase');

    var card = {
      job: job,
      state: state.name,
      loop: state.loop,
      reason: '',
      urgency: 0,
      proposed_action: proposals[0] || null,
      bucket_id: null,
      lane: null,
      do_not_chase: dnc,
    };

    var ageHours, ageDays;

    // ── Loop A buckets ──
    if (state.loop === 'A') {
      if (state.name === 'ENQUIRED') {
        ageHours = hoursBetween(now, job.created_at) || 0;
        if (ageHours >= config.firstContactMaxHours) {
          card.bucket_id = 'no_first_contact';
          card.lane = 'call';
          card.reason = 'Lead arrived ' + Math.round(ageHours) + 'h ago, no outbound recorded.';
          card.urgency = 80 + Math.min(40, ageHours - config.firstContactMaxHours);
        }
      } else if (state.name === 'QUALIFIED') {
        card.bucket_id = 'qualified_no_booking';
        card.lane = 'book';
        card.reason = 'Qualified, no site visit booked.';
        card.urgency = 50 + (job.value_inc_gst ? Math.min(30, job.value_inc_gst / 1000) : 0);
      } else if (state.name === 'SITE_VISIT_DONE') {
        ageDays = daysBetween(now, state.siteVisitAt) || 0;
        if (ageDays >= config.siteVisitToScopeMaxDays) {
          card.bucket_id = 'site_visit_no_scope';
          card.lane = 'call';
          card.reason = 'Site visit completed ' + Math.round(ageDays) + 'd ago, scoping tool not opened.';
          card.urgency = 60 + ageDays;
        }
      }
    }

    // ── Loop B buckets ──
    if (state.loop === 'B') {
      if (state.name === 'SENT') {
        ageDays = state.ageDays || 0;
        if (ageDays >= config.sentNotViewedDays) {
          card.bucket_id = 'sent_not_viewed';
          card.lane = 'send';
          card.reason = 'Sent ' + Math.round(ageDays) + 'd ago, quote not opened.';
          card.urgency = 40 + ageDays;
        }
      } else if (state.name === 'VIEWED') {
        var viewedAgo = daysBetween(now, state.viewedAt) || 0;
        if (viewedAgo >= config.viewedNoReplyDays) {
          card.bucket_id = 'viewed_no_reply';
          card.lane = 'call';
          card.reason = 'Opened ' + Math.round(viewedAgo) + 'd ago, no questions, no decision.';
          card.urgency = 65 + viewedAgo + (job.value_inc_gst ? job.value_inc_gst / 1000 : 0);
        }
      } else if (state.name === 'CLARIFYING') {
        card.bucket_id = 'question_unanswered';
        card.lane = 'send';
        card.reason = 'Client asked a question, no rep reply yet.';
        card.urgency = 90;
      } else if (state.name === 'STALE') {
        ageDays = state.ageDays || 0;
        card.bucket_id = 'stale_quote';
        card.lane = 'send';
        card.reason = 'Quoted ' + Math.round(ageDays) + 'd ago, no decision.';
        card.urgency = 25;
      }
    }

    // do_not_chase reroutes any classified card to a single Call-lane
    // bucket so the rep knows automation is paused. Overriding the
    // bucket_id (rather than just .lane) keeps `buildLane` honest:
    // each card lands in exactly one lane.
    if (dnc && card.bucket_id) {
      card.bucket_id = 'do_not_chase';
      card.lane = 'call';
      card.reason = '[DO NOT CHASE] ' + card.reason;
      card.urgency = Math.max(card.urgency - 30, 5);
    }

    return card;
  }

  function rankByUrgency(items) {
    return items.slice().sort(function (a, b) { return (b.urgency || 0) - (a.urgency || 0); });
  }

  function buildLane(items, bucketsConfig) {
    // bucketsConfig: [{ id, title }] in display order.
    return bucketsConfig.map(function (b) {
      var cards = rankByUrgency(items.filter(function (i) { return i.bucket_id === b.id; }));
      return { title: b.title, bucket_id: b.id, items: cards };
    });
  }

  // ── Performance strip ──────────────────────────────────────

  function calcPerformance(jobs, events, now, config) {
    var nowD = toDate(now) || new Date();
    var weekStart = nowD.getTime() - 7 * 24 * 60 * 60 * 1000;
    var quotedThisWeek = 0;
    var wonThisWeek = 0;
    var acceptedCount = 0;
    var queueCount = 0;

    jobs.forEach(function (j) {
      var status = (j.status || '').toLowerCase();
      var sentAt = j.sent_at && +new Date(j.sent_at);
      var acceptedAt = j.accepted_at && +new Date(j.accepted_at);
      var v = +(j.value_inc_gst || 0);
      if (sentAt && sentAt >= weekStart) quotedThisWeek += v;
      if (acceptedAt && acceptedAt >= weekStart) {
        wonThisWeek += v;
        acceptedCount++;
      }
      if (status === 'draft' || status === 'quoted' || status === 'accepted') queueCount++;
    });

    return {
      week_quoted_value: quotedThisWeek,
      week_won_value: wonThisWeek,
      accepted_count: acceptedCount,
      queue_count: queueCount,
      fixture: true,
    };
  }

  // ── Public API ─────────────────────────────────────────────

  function reduce(input) {
    var config = Object.assign({}, DEFAULT_CONFIG, (input && input.config) || {});
    var jobs = (input && input.jobs) || [];
    var events = (input && input.events) || [];
    var jobContext = (input && input.jobContext) || {};
    var proposedActions = (input && input.proposedActions) || [];
    var now = (input && input.now) || new Date();
    var calendar = (input && input.calendar) || null;

    var classified = jobs.map(function (job) {
      var jobEvents = eventsFor(events, job.id);
      var facts = factsFor(jobContext, job.id);
      var proposals = proposalsFor(proposedActions, job.id);
      return classifyJob(job, jobEvents, facts, proposals, now, config);
    }).filter(function (c) { return c.bucket_id; });

    // Each bucket_id appears in exactly one lane so a card is never
    // duplicated across lanes. site_visit_no_scope sits in Call because
    // the right move is a coaching call once the scope has slipped > 7d.
    var bookBuckets = buildLane(classified, [
      { id: 'qualified_no_booking', title: 'Qualified, no booking' },
    ]);
    var sendBuckets = buildLane(classified, [
      { id: 'question_unanswered',  title: 'Question unanswered' },
      { id: 'sent_not_viewed',      title: 'Sent, not viewed' },
      { id: 'stale_quote',          title: 'Stale > 14d' },
    ]);
    var callBuckets = buildLane(classified, [
      { id: 'no_first_contact',     title: 'No first contact > 24h' },
      { id: 'viewed_no_reply',      title: 'Viewed, no reply > 3d' },
      { id: 'site_visit_no_scope',  title: 'Site visit done, no scope (call to coach)' },
      { id: 'do_not_chase',         title: 'Do not chase — paused' },
    ]);

    var perf = calcPerformance(jobs, events, now, config);

    return {
      performance: perf,
      lanes: {
        book: bookBuckets,
        send: sendBuckets,
        call: callBuckets,
      },
      calendar: calendar,
      diagnostics: {
        jobsConsidered: jobs.length,
        cardsProduced: classified.length,
        lanesPopulated: {
          book: bookBuckets.reduce(function (s, b) { return s + b.items.length; }, 0),
          send: sendBuckets.reduce(function (s, b) { return s + b.items.length; }, 0),
          call: callBuckets.reduce(function (s, b) { return s + b.items.length; }, 0),
        },
      },
    };
  }

  return {
    reduce: reduce,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    // internals exposed for tests:
    _classifyJob: classifyJob,
    _deriveJobState: deriveJobState,
    _calcPerformance: calcPerformance,
    _rankByUrgency: rankByUrgency,
  };
});
