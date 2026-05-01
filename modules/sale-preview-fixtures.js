// ════════════════════════════════════════════════════════════
// SecureWorks — Secure Sale (Preview) — Fixture Data (Slice 2)
//
// Hand-crafted, clearly-fake mock data. Every row carries _fixture: true.
// No real customers, reps, phone numbers, or addresses.
//
// Slice 2 structure:
//   • engineNow                  — baseline "now" for deterministic
//                                  reducer output. Renderer passes this
//                                  to SALE_REDUCER.reduce().
//   • jobs[]                     — raw job rows (the reducer's truth).
//   • events[]                   — business_events shape per job.
//   • jobContext { [jobId]: [] } — facts per job (T5 will write live).
//   • proposedActions[]          — drafted actions awaiting decision.
//
//   • calendar / pipeline / performance / disabled / leadSource90d /
//     streamMismatch — legacy keys for the secondary tabs (Calendar,
//     Pipeline, Performance) and the disabled-tile / stream-mismatch
//     UI surfaces. These stay until Slice 4 wires real adapters.
//
// Slice 1 amendments still hold:
//   • Sender identity is unconditional and type-based:
//       patio / combo → Nithin
//       fencing       → Khairo
//   • archive_stale renders as a *proposed* card; never moves state.
//   • availability_window facts are fixture-only here; T5 adds the
//     classifier later.
// ════════════════════════════════════════════════════════════

(function () {
  'use strict';

  function fx(over) { return Object.assign({ _fixture: true }, over); }

  // Baseline "now" for deterministic reducer output. Friday 1 May
  // 2026 14:00 Perth (UTC+8). Every fixture timestamp is anchored
  // relative to this so the cockpit renders the same buckets every
  // time, regardless of when Marnin opens the page.
  // (Codex stop-time fix #3: 2026-05-02 is a Saturday on the real
  // calendar, so every weekday label in the 7-day window was off
  // by one day. Shifting to 2026-05-01 = real Friday aligns the
  // window with the brand's weekday/Sat/Sun cadence framing.)
  var BASELINE_NOW = '2026-05-01T14:00:00+08:00';

  // Helper: ISO offset from baseline ('hours' or 'days').
  function ago(amount, unit) {
    var ms = (unit === 'days' ? amount * 24 : amount) * 60 * 60 * 1000;
    return new Date(new Date(BASELINE_NOW).getTime() - ms).toISOString();
  }

  // ── 12 synthetic jobs covering the state matrix ──────────

  var jobs = [
    // 1. Fresh enquiry, no first contact → Call lane (no_first_contact)
    fx({ id: 'job-001', job_number: 'SWP-FIX-001', type: 'patio',
         client_name: 'Demo Customer Alpha', client_phone: '+61400000001',
         client_email: 'demo.alpha@example.test', site_address: '1 Fixture St',
         site_suburb: 'Stirling', status: 'draft',
         created_at: ago(32, 'hours') }),

    // 2. Fresh fencing enquiry, no first contact → Call lane
    fx({ id: 'job-002', job_number: 'SWF-FIX-002', type: 'fencing',
         client_name: 'Demo Customer Bravo', client_phone: '+61400000002',
         client_email: 'demo.bravo@example.test', site_address: '2 Fixture Ave',
         site_suburb: 'Joondalup', status: 'draft',
         created_at: ago(27, 'hours') }),

    // 3. Too-fresh enquiry (6h) — should NOT appear in any bucket
    fx({ id: 'job-003', job_number: 'SWP-FIX-003', type: 'patio',
         client_name: 'Demo Customer Charlie', client_phone: '+61400000003',
         client_email: 'demo.charlie@example.test', site_address: '3 Fixture Rd',
         site_suburb: 'Hillarys', status: 'draft',
         created_at: ago(6, 'hours') }),

    // 4. Qualified, no booking → Book lane
    fx({ id: 'job-004', job_number: 'SWF-FIX-004', type: 'fencing',
         client_name: 'Demo Customer Delta', client_phone: '+61400000004',
         client_email: 'demo.delta@example.test', site_address: '4 Fixture Pl',
         site_suburb: 'Wanneroo', status: 'draft', value_inc_gst: 8500,
         created_at: ago(5, 'days') }),

    // 5. Qualified, no booking, high value → Book lane (top urgency)
    fx({ id: 'job-005', job_number: 'SWP-FIX-005', type: 'patio',
         client_name: 'Demo Customer Echo', client_phone: '+61400000005',
         client_email: 'demo.echo@example.test', site_address: '5 Fixture Cir',
         site_suburb: 'Mindarie', status: 'draft', value_inc_gst: 32000,
         created_at: ago(3, 'days') }),

    // 6. Site visit done 9d ago, no scope → Call lane
    fx({ id: 'job-006', job_number: 'SWP-FIX-006', type: 'patio',
         client_name: 'Demo Customer Foxtrot', client_phone: '+61400000006',
         client_email: 'demo.foxtrot@example.test', site_address: '6 Fixture Way',
         site_suburb: 'Currambine', status: 'draft',
         created_at: ago(14, 'days') }),

    // 7. Quote sent 2d ago, not viewed → Send lane
    fx({ id: 'job-101', job_number: 'SWP-FIX-101', type: 'patio',
         client_name: 'Demo Customer Hotel', client_phone: '+61400000101',
         client_email: 'demo.hotel@example.test', site_address: '101 Fixture Crk',
         site_suburb: 'Joondalup', status: 'quoted', value_inc_gst: 14250,
         created_at: ago(10, 'days'), sent_at: ago(2, 'days') }),

    // 8. Quote sent 4d ago, not viewed → Send lane
    fx({ id: 'job-102', job_number: 'SWF-FIX-102', type: 'fencing',
         client_name: 'Demo Customer India', client_phone: '+61400000102',
         client_email: 'demo.india@example.test', site_address: '102 Fixture Vw',
         site_suburb: 'Hillarys', status: 'quoted', value_inc_gst: 6890,
         created_at: ago(12, 'days'), sent_at: ago(4, 'days') }),

    // 9. Viewed 4d ago, no reply, high value → Call lane
    fx({ id: 'job-103', job_number: 'SWP-FIX-103', type: 'patio',
         client_name: 'Demo Customer Juliet', client_phone: '+61400000103',
         client_email: 'demo.juliet@example.test', site_address: '103 Fixture Ln',
         site_suburb: 'Wanneroo', status: 'quoted', value_inc_gst: 22500,
         created_at: ago(11, 'days'), sent_at: ago(5, 'days') }),

    // 10. Quote with unanswered client question → Send lane (high urgency)
    fx({ id: 'job-105', job_number: 'SWP-FIX-105', type: 'patio',
         client_name: 'Demo Customer Lima', client_phone: '+61400000105',
         client_email: 'demo.lima@example.test', site_address: '105 Fixture Pl',
         site_suburb: 'Currambine', status: 'quoted', value_inc_gst: 18750,
         created_at: ago(8, 'days'), sent_at: ago(4, 'days') }),

    // 11. Stale quote 18d → Send lane (low urgency)
    fx({ id: 'job-106', job_number: 'SWP-FIX-106', type: 'patio',
         client_name: 'Demo Customer Mike', client_phone: '+61400000106',
         client_email: 'demo.mike@example.test', site_address: '106 Fixture Ave',
         site_suburb: 'Stirling', status: 'quoted', value_inc_gst: 31200,
         created_at: ago(25, 'days'), sent_at: ago(18, 'days') }),

    // 12. do_not_chase + sent 5d ago → reroutes to Call lane (DNC banner)
    fx({ id: 'job-107', job_number: 'SWF-FIX-107', type: 'fencing',
         client_name: 'Demo Customer November', client_phone: '+61400000107',
         client_email: 'demo.november@example.test', site_address: '107 Fixture Tce',
         site_suburb: 'Joondalup', status: 'quoted', value_inc_gst: 7450,
         created_at: ago(15, 'days'), sent_at: ago(5, 'days') }),

    // 13. Patio enquiry 30h ago, MISSING client_phone (policy will block SMS)
    fx({ id: 'job-108', job_number: 'SWP-FIX-108', type: 'patio',
         client_name: 'Demo Customer Oscar', client_phone: null,
         client_email: 'demo.oscar@example.test', site_address: '108 Fixture St',
         site_suburb: 'Hillarys', status: 'draft',
         created_at: ago(30, 'hours') }),
  ];

  // ── Per-job business_events ──────────────────────────────

  var events = [
    // Job 6 — site visit done 9d ago
    fx({ job_id: 'job-006', event_type: 'site_visit.completed',
         occurred_at: ago(9, 'days'), payload: {} }),

    // Job 101 — quote.sent
    fx({ job_id: 'job-101', event_type: 'quote.sent',
         occurred_at: ago(2, 'days'), payload: {} }),

    // Job 102 — quote.sent
    fx({ job_id: 'job-102', event_type: 'quote.sent',
         occurred_at: ago(4, 'days'), payload: {} }),

    // Job 103 — quote.sent + quote.viewed (4d ago) + no reply since
    fx({ job_id: 'job-103', event_type: 'quote.sent',
         occurred_at: ago(5, 'days'), payload: {} }),
    fx({ job_id: 'job-103', event_type: 'quote.viewed',
         occurred_at: ago(4, 'days'), payload: {} }),

    // Job 105 — quote.sent + quote.viewed + client.question (no rep reply)
    fx({ job_id: 'job-105', event_type: 'quote.sent',
         occurred_at: ago(4, 'days'), payload: {} }),
    fx({ job_id: 'job-105', event_type: 'quote.viewed',
         occurred_at: ago(3, 'days'), payload: {} }),
    fx({ job_id: 'job-105', event_type: 'client.question',
         occurred_at: ago(3, 'days'),
         payload: { message_text: 'Can we add a ceiling fan, and what would the upgrade cost?' } }),

    // Job 106 — quote.sent (stale)
    fx({ job_id: 'job-106', event_type: 'quote.sent',
         occurred_at: ago(18, 'days'), payload: {} }),

    // Job 107 — quote.sent (do_not_chase route)
    fx({ job_id: 'job-107', event_type: 'quote.sent',
         occurred_at: ago(5, 'days'), payload: {} }),

    // Job 5 — qualified fact-promotion event (informational only;
    // qualification is read from job_context, not events)
  ];

  // ── Per-job context facts ────────────────────────────────

  var jobContext = {
    'job-001': [
      fx({ kind: 'client_preference', value: { channel: 'sms', timing: 'evenings' },
           provenance: { source: 'ghl-sms-history', promoted_at: ago(2, 'days'), writer_role: 'agent', untrusted: false } }),
      fx({ kind: 'access_note', value: { text: 'Side gate, dog in yard.' },
           provenance: { source: 'scoper-note', promoted_at: ago(2, 'days'), writer_role: 'marnin', untrusted: false } }),
      fx({ kind: 'availability_window', value: { window: 'Thu morning' },
           provenance: { source: 'sms-classifier', promoted_at: ago(1, 'days'), writer_role: 'agent', untrusted: false } }),
    ],
    'job-004': [
      fx({ kind: 'qualified', value: { source: 'first-contact-call' },
           provenance: { source: 'rep-note', promoted_at: ago(4, 'days'), writer_role: 'agent', untrusted: false } }),
    ],
    'job-005': [
      fx({ kind: 'qualified', value: { source: 'first-contact-sms' },
           provenance: { source: 'rep-note', promoted_at: ago(2, 'days'), writer_role: 'agent', untrusted: false } }),
      fx({ kind: 'client_preference', value: { channel: 'sms', timing: 'business_hours' },
           provenance: { source: 'ghl-sms-history', promoted_at: ago(2, 'days'), writer_role: 'agent', untrusted: false } }),
    ],
    'job-105': [
      fx({ kind: 'unusual_scope', value: { flags: ['ceiling fan upgrade requested'] },
           provenance: { source: 'transcript', promoted_at: ago(3, 'days'), writer_role: 'agent', untrusted: false } }),
    ],
    'job-107': [
      fx({ kind: 'do_not_chase', value: { reason: 'client asked for time, will follow up' },
           provenance: { source: 'rep-note', promoted_at: ago(2, 'days'), writer_role: 'marnin', untrusted: false } }),
    ],
  };

  // ── Existing proposed actions ────────────────────────────

  function senderForType(t) {
    if (t === 'fencing') return { user_id: 'fix-khairo', name: 'Khairo', channel: 'sms', label: 'Khairo (fencing)' };
    return { user_id: 'fix-nithin', name: 'Nithin', channel: 'sms', label: 'Nithin (' + (t || 'patio') + ')' };
  }

  var proposedActions = [
    fx({ id: 'pa-001', job_id: 'job-001', status: 'proposed',
         action_type: 'first_contact_sms', channel: 'sms', confidence_score: 80,
         drafted_message: 'Hi Alpha, Nithin from SecureWorks here re your patio enquiry. Quick chat to lock in scope details and a site visit?',
         action_payload: { loop: 'A', angle: 'helpful_service', template_id: 'tpl_first_contact_sms_v1', sender: senderForType('patio'), why: 'No outbound recorded in 32h.' } }),
    fx({ id: 'pa-002', job_id: 'job-002', status: 'proposed',
         action_type: 'first_contact_sms', channel: 'sms', confidence_score: 80,
         drafted_message: 'Hi Bravo, Khairo from SecureWorks. Got your fencing enquiry — keen to lock in a site visit. What suits this week?',
         action_payload: { loop: 'A', angle: 'helpful_service', template_id: 'tpl_first_contact_sms_v1', sender: senderForType('fencing'), why: 'No outbound recorded in 27h.' } }),
    fx({ id: 'pa-004', job_id: 'job-004', status: 'proposed',
         action_type: 'propose_booking_window', channel: 'sms', confidence_score: 70,
         drafted_message: 'Hi Delta, Khairo here — got two windows for your site visit: Tue 10:30am or Wed 9am. Which suits?',
         action_payload: { loop: 'A', angle: 'helpful_service', template_id: 'tpl_propose_booking_v1', sender: senderForType('fencing'), why: 'Qualified 5 days ago.' } }),
    fx({ id: 'pa-005', job_id: 'job-005', status: 'proposed',
         action_type: 'propose_booking_window', channel: 'sms', confidence_score: 75,
         drafted_message: 'Hi Echo, Nithin here — got two morning slots open this week. Tue 9am or Thu 10am?',
         action_payload: { loop: 'A', angle: 'helpful_service', template_id: 'tpl_propose_booking_v1', sender: senderForType('patio'), why: 'High-value patio, qualified 3d ago.' } }),
    fx({ id: 'pa-101', job_id: 'job-101', status: 'proposed',
         action_type: 'followup_sms_t1', channel: 'sms', confidence_score: 80,
         drafted_message: "Hey Hotel, Nithin here. Just checking your quote landed OK — any questions on what we sent through?",
         action_payload: { loop: 'B', angle: 'helpful_service', template_id: 'tpl_followup_sms_t1_v1', sender: senderForType('patio'), why: 'Quote sent 2 days ago, viewed_at still null.' } }),
    fx({ id: 'pa-103', job_id: 'job-103', status: 'proposed',
         action_type: 'call_now_prompt', channel: 'internal', confidence_score: 78,
         drafted_message: '',
         action_payload: { loop: 'B', angle: 'decision_led', template_id: 'internal_call_prompt_v1', sender: senderForType('patio'),
                           why: 'Viewed 4 days ago, no reply. High-value job; a call now is the right move.',
                           talk_track: ['Reference the quote total and what they were excited about on site.', 'Ask: "Does anything in the quote not sit right?"', "Don't push; offer to walk them through panel choice in person."] } }),
    fx({ id: 'pa-105', job_id: 'job-105', status: 'proposed',
         action_type: 'objection_response', channel: 'sms', confidence_score: 72,
         drafted_message: 'Hey Lima — yes we can add a ceiling fan. Two paths: (1) prewire only (~$280) so an electrician can finish later, or (2) supply+install (~$650). Want me to update the quote with one of those?',
         action_payload: { loop: 'B', angle: 'objection_response', template_id: 'tpl_addon_pricing_response_v1', sender: senderForType('patio'), why: 'Client asked an addon-pricing question 3 days ago.' } }),
    fx({ id: 'pa-106', job_id: 'job-106', status: 'proposed',
         action_type: 'archive_stale', channel: 'internal', confidence_score: 60,
         drafted_message: '',
         action_payload: { loop: 'B', angle: 'nurture', template_id: 'internal_archive_stale_v1', sender: senderForType('patio'),
                           why: 'Quoted 18 days ago, no decision. PROPOSED only — does NOT auto-move job/pipeline state.',
                           note: 'In Slice 1, archive_stale never auto-changes job state; rep approves and the system creates a nurture follow-up only.' } }),
  ];

  // ── Pipeline kanban (system-wide totals) ─────────────────
  var pipeline = {
    draft: [
      fx({ job_number: 'SWP-FIX-200', client_name: 'Demo Customer Papa',   suburb: 'Stirling',  type: 'patio' }),
      fx({ job_number: 'SWF-FIX-201', client_name: 'Demo Customer Quebec', suburb: 'Joondalup', type: 'fencing' }),
      fx({ job_number: 'SWP-FIX-202', client_name: 'Demo Customer Romeo',  suburb: 'Hillarys',  type: 'patio' }),
      fx({ job_number: 'SWF-FIX-203', client_name: 'Demo Customer Sierra', suburb: 'Wanneroo',  type: 'fencing' }),
    ],
    quoted: [
      fx({ job_number: 'SWP-FIX-210', client_name: 'Demo Customer Tango',   suburb: 'Mindarie',   type: 'patio',   value_inc_gst: 19500 }),
      fx({ job_number: 'SWP-FIX-211', client_name: 'Demo Customer Uniform', suburb: 'Currambine', type: 'patio',   value_inc_gst: 12300 }),
      fx({ job_number: 'SWF-FIX-212', client_name: 'Demo Customer Victor',  suburb: 'Stirling',   type: 'fencing', value_inc_gst: 6750 }),
      fx({ job_number: 'SWP-FIX-213', client_name: 'Demo Customer Whiskey', suburb: 'Joondalup',  type: 'patio',   value_inc_gst: 28400 }),
      fx({ job_number: 'SWG-FIX-214', client_name: 'Demo Customer X-ray',   suburb: 'Hillarys',   type: 'general', value_inc_gst: 4900, source_caveat: 'quick_quote' }),
    ],
    accepted: [
      fx({ job_number: 'SWP-FIX-220', client_name: 'Demo Customer Yankee', suburb: 'Wanneroo',   type: 'patio',   value_inc_gst: 16800 }),
      fx({ job_number: 'SWF-FIX-221', client_name: 'Demo Customer Zulu',   suburb: 'Mindarie',   type: 'fencing', value_inc_gst: 8950 }),
      fx({ job_number: 'SWP-FIX-222', client_name: 'Demo Customer Apex',   suburb: 'Currambine', type: 'patio',   value_inc_gst: 21000 }),
    ],
    scheduled: [
      fx({ job_number: 'SWP-FIX-230', client_name: 'Demo Customer Beacon', suburb: 'Stirling',  type: 'patio',   scheduled_in_days: 4 }),
      fx({ job_number: 'SWF-FIX-231', client_name: 'Demo Customer Cipher', suburb: 'Joondalup', type: 'fencing', scheduled_in_days: 9 }),
    ],
    done: [
      fx({ job_number: 'SWP-FIX-240', client_name: 'Demo Customer Dynamo', suburb: 'Hillarys', type: 'patio' }),
      fx({ job_number: 'SWF-FIX-241', client_name: 'Demo Customer Ember',  suburb: 'Wanneroo', type: 'fencing' }),
      fx({ job_number: 'SWP-FIX-242', client_name: 'Demo Customer Falcon', suburb: 'Mindarie', type: 'patio' }),
    ],
  };

  // ── 7-day calendar fixture (Slice 4A) ────────────────────
  // Anchored to engineNow (Fri 2026-05-01). Weekdays carry the
  // working scope blocks; Sat tone-shifted (one residual booked
  // visit only); Sun off entirely. Date IDs match the real Perth
  // calendar — verified weekday labels via `node -e new Date(...)`.
  var calendar = {
    windowDays: [
      { id: '2026-05-01', label: 'Today',  short: 'Fri 1 May' },
      { id: '2026-05-02', label: 'Sat',    short: 'Sat 2 May' },
      { id: '2026-05-03', label: 'Sun',    short: 'Sun 3 May' },
      { id: '2026-05-04', label: 'Mon',    short: 'Mon 4 May' },
      { id: '2026-05-05', label: 'Tue',    short: 'Tue 5 May' },
      { id: '2026-05-06', label: 'Wed',    short: 'Wed 6 May' },
      { id: '2026-05-07', label: 'Thu',    short: 'Thu 7 May' },
    ],
    reps: ['Nithin', 'Khairo'],
    slots: [
      // Today (Fri 1 May)
      fx({ day: '2026-05-01', rep: 'Nithin', start: '09:00', end: '10:00', kind: 'booked',   job_id: null,        job_number: 'SWP-FIX-200', client_name: 'Demo Customer Papa',   suburb: 'Stirling' }),
      fx({ day: '2026-05-01', rep: 'Nithin', start: '10:30', end: '11:30', kind: 'proposed', job_id: 'job-005',   job_number: 'SWP-FIX-005', client_name: 'Demo Customer Echo',   suburb: 'Mindarie',  why: 'Clusters with 9am Stirling visit.' }),
      fx({ day: '2026-05-01', rep: 'Khairo', start: '13:00', end: '14:00', kind: 'booked',   job_id: null,        job_number: 'SWF-FIX-201', client_name: 'Demo Customer Quebec', suburb: 'Joondalup' }),
      fx({ day: '2026-05-01', rep: 'Khairo', start: '15:30', end: '16:30', kind: 'proposed', job_id: 'job-004',   job_number: 'SWF-FIX-004', client_name: 'Demo Customer Delta',  suburb: 'Wanneroo',  why: 'After-3pm window, still north — within 25 min of Joondalup.' }),
      // Sat 2 May (light — only existing booked stays; no proposals)
      fx({ day: '2026-05-02', rep: 'Nithin', start: '10:00', end: '11:00', kind: 'booked',   job_id: null,        job_number: 'SWP-FIX-202', client_name: 'Demo Customer Romeo',  suburb: 'Hillarys' }),
      // Sun 3 May (off — no slots intentionally)
      // Mon 4 May
      fx({ day: '2026-05-04', rep: 'Nithin', start: '09:30', end: '10:30', kind: 'proposed', job_id: 'job-003',   job_number: 'SWP-FIX-003', client_name: 'Demo Customer Charlie', suburb: 'Hillarys', why: 'Lead is now 4d old; morning window keeps drive light.' }),
      fx({ day: '2026-05-04', rep: 'Nithin', start: '14:00', end: '15:00', kind: 'booked',   job_id: null,        job_number: 'SWP-FIX-202', client_name: 'Demo Customer Romeo',  suburb: 'Hillarys' }),
      fx({ day: '2026-05-04', rep: 'Khairo', start: '11:00', end: '12:00', kind: 'booked',   job_id: null,        job_number: 'SWF-FIX-203', client_name: 'Demo Customer Sierra', suburb: 'Wanneroo' }),
      // Tue 5 May
      fx({ day: '2026-05-05', rep: 'Nithin', start: '08:30', end: '09:30', kind: 'proposed', job_id: 'job-001',   job_number: 'SWP-FIX-001', client_name: 'Demo Customer Alpha',  suburb: 'Stirling',  why: 'Morning window, low risk for return south.' }),
      fx({ day: '2026-05-05', rep: 'Khairo', start: '10:00', end: '11:00', kind: 'proposed', job_id: 'job-002',   job_number: 'SWF-FIX-002', client_name: 'Demo Customer Bravo',  suburb: 'Joondalup', why: 'Anchor near Joondalup — base.' }),
      fx({ day: '2026-05-05', rep: 'Nithin', start: '13:00', end: '14:00', kind: 'proposed', job_id: 'job-108',   job_number: 'SWP-FIX-108', client_name: 'Demo Customer Oscar',  suburb: 'Hillarys',  why: 'Backfill missing client_phone via in-person scope.' }),
      // Wed 6 May
      fx({ day: '2026-05-06', rep: 'Nithin', start: '09:00', end: '10:00', kind: 'proposed', job_id: 'job-006',   job_number: 'SWP-FIX-006', client_name: 'Demo Customer Foxtrot', suburb: 'Currambine', why: 'Re-scope visit — original site visit was 9d ago, no quote yet.' }),
      // Thu 7 May (no slots — open block; allows reactive bookings)
    ],
  };

  // ── Conversation threads (Slice 4A — Job Brain shape) ────
  // Per-job message thread modelled on GHL Conversations API:
  // SMS / email / note / call_summary, direction-tagged, ordered
  // chronologically. Read-only; no reply box, no live fetch.
  // Bodies are realistic but obviously synthetic (Demo Customer X).
  var conversation = {
    'job-001': [
      fx({ id: 'msg-001-01', job_id: 'job-001', channel: 'note', direction: 'system', occurred_at: ago(34, 'hours'),
           author: 'system', body: 'Lead created via GHL form — patio enquiry, Stirling 6021. Source: Google Ads.' }),
      fx({ id: 'msg-001-02', job_id: 'job-001', channel: 'sms',  direction: 'inbound', occurred_at: ago(33, 'hours'),
           author: 'Demo Customer Alpha', body: 'Hi, just submitted the form. Looking for a 6x4 insulated patio off the back of the house. When can someone come out?' }),
      fx({ id: 'msg-001-03', job_id: 'job-001', channel: 'note', direction: 'system', occurred_at: ago(32, 'hours'),
           author: 'system', body: 'JARVIS proposes first_contact_sms — see Today / Call lane.' }),
    ],
    'job-005': [
      fx({ id: 'msg-005-01', job_id: 'job-005', channel: 'sms',  direction: 'outbound', occurred_at: ago(3, 'days'),
           author: 'Nithin', body: "Hey Echo, Nithin from SecureWorks. Got your patio enquiry — want to lock in a quick site visit this week to scope it?" }),
      fx({ id: 'msg-005-02', job_id: 'job-005', channel: 'sms',  direction: 'inbound', occurred_at: ago(72, 'hours'),
           author: 'Demo Customer Echo', body: "Yeah keen. We're in Mindarie. Tuesday morning works." }),
      fx({ id: 'msg-005-03', job_id: 'job-005', channel: 'note', direction: 'system', occurred_at: ago(70, 'hours'),
           author: 'system', body: "Classifier promoted job_context.qualified=true (source: first-contact-sms; confidence 0.86)." }),
      fx({ id: 'msg-005-04', job_id: 'job-005', channel: 'sms',  direction: 'outbound', occurred_at: ago(60, 'hours'),
           author: 'Nithin', body: "Tuesday 9am works for me. Will swing by — north side of the house, right? Anything I should know about access?" }),
      fx({ id: 'msg-005-05', job_id: 'job-005', channel: 'sms',  direction: 'inbound', occurred_at: ago(58, 'hours'),
           author: 'Demo Customer Echo', body: "Yep north side. Side gate, dog's friendly but he barks. Timing's perfect, see you then." }),
    ],
    'job-101': [
      fx({ id: 'msg-101-01', job_id: 'job-101', channel: 'note',  direction: 'system', occurred_at: ago(2, 'days'),
           author: 'system', body: 'Quote SWP-FIX-101 sent ($14,250 inc GST). PDF emailed to demo.hotel@example.test.' }),
      fx({ id: 'msg-101-02', job_id: 'job-101', channel: 'email', direction: 'outbound', occurred_at: ago(2, 'days'),
           author: 'Nithin', subject: 'Your insulated patio quote — Joondalup', body: "Hi Hotel, attaching your quote. Open to questions — easiest by SMS or call. Quote valid 14 days." }),
    ],
    'job-103': [
      fx({ id: 'msg-103-01', job_id: 'job-103', channel: 'note',  direction: 'system', occurred_at: ago(5, 'days'),
           author: 'system', body: 'Quote SWP-FIX-103 sent ($22,500 inc GST). High-value patio.' }),
      fx({ id: 'msg-103-02', job_id: 'job-103', channel: 'email', direction: 'outbound', occurred_at: ago(5, 'days'),
           author: 'Nithin', subject: 'Your patio quote — Wanneroo', body: "Hi Juliet, full quote attached. Happy to walk you through panel options if useful." }),
      fx({ id: 'msg-103-03', job_id: 'job-103', channel: 'note',  direction: 'system', occurred_at: ago(4, 'days'),
           author: 'system', body: 'quote.viewed event arrived — client opened the PDF.' }),
      // No reply since.
    ],
    'job-105': [
      fx({ id: 'msg-105-01', job_id: 'job-105', channel: 'note',  direction: 'system', occurred_at: ago(4, 'days'),
           author: 'system', body: 'Quote SWP-FIX-105 sent ($18,750 inc GST).' }),
      fx({ id: 'msg-105-02', job_id: 'job-105', channel: 'email', direction: 'outbound', occurred_at: ago(4, 'days'),
           author: 'Nithin', subject: 'Patio quote — Currambine', body: "Hi Lima, quote attached. Sing out with any Qs." }),
      fx({ id: 'msg-105-03', job_id: 'job-105', channel: 'note',  direction: 'system', occurred_at: ago(3, 'days'),
           author: 'system', body: 'quote.viewed event arrived.' }),
      fx({ id: 'msg-105-04', job_id: 'job-105', channel: 'sms',   direction: 'inbound', occurred_at: ago(72, 'hours'),
           author: 'Demo Customer Lima', body: "Got the quote thanks. Quick Q — can we add a ceiling fan, and what would the upgrade cost?" }),
      // No rep reply yet — drives CLARIFYING.
    ],
    'job-106': [
      fx({ id: 'msg-106-01', job_id: 'job-106', channel: 'email', direction: 'outbound', occurred_at: ago(18, 'days'),
           author: 'Nithin', subject: 'Patio quote — Stirling', body: "Hi Mike, here's the quote we discussed." }),
      // No view, no reply, 18d stale.
    ],
    'job-107': [
      fx({ id: 'msg-107-01', job_id: 'job-107', channel: 'email', direction: 'outbound', occurred_at: ago(5, 'days'),
           author: 'Khairo', subject: 'Fence quote — Joondalup', body: "Hi November, quote attached." }),
      fx({ id: 'msg-107-02', job_id: 'job-107', channel: 'sms',   direction: 'inbound', occurred_at: ago(2, 'days'),
           author: 'Demo Customer November', body: "Thanks Khairo — bit busy this fortnight, will follow up when I'm free." }),
      fx({ id: 'msg-107-03', job_id: 'job-107', channel: 'note',  direction: 'system', occurred_at: ago(2, 'days'),
           author: 'Marnin', body: 'job_context.do_not_chase set — client asked for time. Pause automation; surface in Call lane only as paused.' }),
    ],
  };

  // ── Coaching hints (Slice 4A — Job Brain shape) ──────────
  // Read-only rationale text. lane-scope = above-lane summary;
  // action-scope = under-card "why now" text; job-scope =
  // broader pattern flags surfaced in the peek's Verdict trail.
  // No live LLM calls; Slice 5 swaps the source for ops-ai.
  var coaching = [
    // Lane summaries
    fx({ id: 'coach-lane-book', scope: 'lane', related_lane: 'book', confidence: 0.78,
         text: 'Two qualified jobs need a site-visit window. Echo ($32k patio) outranks Delta on value — propose Echo first.',
         playbook: 'Loop1.qualified.book_window_v1', caveat: 'fixture data — not live' }),
    fx({ id: 'coach-lane-send', scope: 'lane', related_lane: 'send', confidence: 0.82,
         text: 'Lima asked an addon-pricing question 3d ago and is unanswered — answer her before chasing the t1 nudges.',
         playbook: 'Loop2.clarifying.priority_v1', caveat: 'fixture data — not live' }),
    fx({ id: 'coach-lane-call', scope: 'lane', related_lane: 'call', confidence: 0.74,
         text: 'Three uncontacted enquiries over 24h plus Juliet sitting on a $22.5k viewed-no-reply quote. Juliet first; calls warm her up before tomorrow.',
         playbook: 'Loop1.no_first_contact.batch_call_v1', caveat: 'fixture data — not live' }),
    // Action-scope hints (one per pending action, by id)
    fx({ id: 'coach-pa-001', scope: 'action', related_action_id: 'pa-001', related_job_id: 'job-001', confidence: 0.85,
         text: 'Lead arrived 32h ago via Google Ads. First-contact SMS within the next hour clears the stale-lead flag.',
         playbook: 'Loop1.first_contact.t1', caveat: 'fixture data — not live' }),
    fx({ id: 'coach-pa-002', scope: 'action', related_action_id: 'pa-002', related_job_id: 'job-002', confidence: 0.85,
         text: 'Fence enquiry, Joondalup. Khairo sends — type-based routing.',
         playbook: 'Loop1.first_contact.t1', caveat: 'fixture data — not live' }),
    fx({ id: 'coach-pa-004', scope: 'action', related_action_id: 'pa-004', related_job_id: 'job-004', confidence: 0.72,
         text: 'Qualified 5 days ago. Two windows offered — Tue 10:30 and Wed 9. Both north-side, low drive.',
         playbook: 'Loop1.book_window.dual_offer', caveat: 'fixture data — not live' }),
    fx({ id: 'coach-pa-005', scope: 'action', related_action_id: 'pa-005', related_job_id: 'job-005', confidence: 0.78,
         text: 'High-value patio ($32k). Tuesday morning works for the client per SMS thread; lock it in.',
         playbook: 'Loop1.book_window.client_window_known', caveat: 'fixture data — not live' }),
    fx({ id: 'coach-pa-101', scope: 'action', related_action_id: 'pa-101', related_job_id: 'job-101', confidence: 0.80,
         text: '2d since send, no view yet. Light nudge — keep tone helpful, not pushy.',
         playbook: 'Loop2.followup_t1.no_view', caveat: 'fixture data — not live' }),
    fx({ id: 'coach-pa-103', scope: 'action', related_action_id: 'pa-103', related_job_id: 'job-103', confidence: 0.78,
         text: 'Viewed 4d ago, no reply. High-value ($22.5k) — phone beats SMS for a quote this size. Talk-track in the card.',
         playbook: 'Loop2.viewed_no_reply.call_now_v1', caveat: 'fixture data — not live' }),
    fx({ id: 'coach-pa-105', scope: 'action', related_action_id: 'pa-105', related_job_id: 'job-105', confidence: 0.74,
         text: 'Lima asked a specific addon question. Two priced paths in the draft — let her pick rather than negotiate.',
         playbook: 'Loop2.objection.addon_pricing_v1', caveat: 'fixture data — not live' }),
    fx({ id: 'coach-pa-106', scope: 'action', related_action_id: 'pa-106', related_job_id: 'job-106', confidence: 0.60,
         text: '18d stale. Internal-only nurture flag — never auto-moves job state. Approve to drop into the long-cycle nurture queue.',
         playbook: 'Loop2.stale.archive_v1', caveat: 'fixture data — not live' }),
    // Job-scope hints (broader patterns)
    fx({ id: 'coach-job-103', scope: 'job', related_job_id: 'job-103', confidence: 0.81,
         text: 'Juliet matches the silent-but-engaged pattern: opened the quote within a day, no questions, no decline. Past data: 64% of these convert with a phone call inside 7d, 12% if waited longer.',
         playbook: 'Loop2.silent_engaged.call_now', caveat: 'fixture data — not live' }),
    fx({ id: 'coach-job-105', scope: 'job', related_job_id: 'job-105', confidence: 0.77,
         text: 'Ceiling-fan addon questions skew toward a single decisive answer rather than negotiation. Clear pricing → close.',
         playbook: 'Loop2.objection.addon.lima', caveat: 'fixture data — not live' }),
    fx({ id: 'coach-job-107', scope: 'job', related_job_id: 'job-107', confidence: 0.92,
         text: 'do_not_chase set by Marnin 2d ago. Surface as paused — no auto-send. Re-evaluate after client reaches out.',
         playbook: 'overrides.do_not_chase', caveat: 'fixture data — not live' }),
  ];

  // ── Lifecycle-state preview fixtures (Product review pass) ─
  // Display-only. Five non-proposed states the rep will see across
  // a card's lifecycle. Rendered in a dedicated "States preview"
  // section on Today, separate from the reducer-driven lanes (so
  // they don't pollute the lane buckets). All controls remain
  // HTML-disabled. Real lifecycle execution lands in Slice 6/7.
  var lifecycleStates = [
    // 1. EDIT-OPEN — rep tapped Edit; drafted message is now an
    //    inline textarea ready for tweaks. Send button visible
    //    but disabled in the preview.
    fx({ id: 'state-edit-open', _state: 'edit-open', status: 'proposed',
         job_id: 'job-005', job_number: 'SWP-FIX-005',
         client_name: 'Demo Customer Echo', suburb: 'Mindarie', type: 'patio',
         action_type: 'propose_booking_window', channel: 'sms',
         drafted_message: 'Hi Echo, Nithin here — got two morning slots open this week. Tue 9am or Thu 10am?',
         draft_modified_at: ago(45, 'hours'),
         action_payload: { loop: 'A', angle: 'helpful_service', sender: senderForType('patio'),
                           why: 'High-value patio, qualified 3d ago.' } }),

    // 2. APPROVED-PENDING — rep approved; system queued for send.
    //    Shows the verdict chip + "queued" status + countdown
    //    (in real flow this would resolve once the executor fires).
    fx({ id: 'state-approved-pending', _state: 'approved-pending', status: 'approved',
         job_id: 'job-101', job_number: 'SWP-FIX-101',
         client_name: 'Demo Customer Hotel', suburb: 'Joondalup', type: 'patio',
         action_type: 'followup_sms_t1', channel: 'sms',
         drafted_message: "Hey Hotel, Nithin here. Just checking your quote landed OK — any questions on what we sent through?",
         approved_at: ago(38, 'hours'),
         queued_for_send_at: ago(38, 'hours'),
         action_payload: { loop: 'B', angle: 'helpful_service', sender: senderForType('patio'),
                           why: 'Quote sent 2 days ago, viewed_at still null.' } }),

    // 3. REJECTED — rep dismissed with optional reason. Card is
    //    visually muted; reason is the most prominent element after
    //    the dismissed badge.
    fx({ id: 'state-rejected', _state: 'rejected', status: 'dismissed',
         job_id: 'job-106', job_number: 'SWP-FIX-106',
         client_name: 'Demo Customer Mike', suburb: 'Stirling', type: 'patio',
         action_type: 'archive_stale', channel: 'internal',
         drafted_message: '',
         dismissed_at: ago(2, 'hours'),
         dismiss_reason: 'Spoke to Mike at the supplier, deal is back on — keeping active.',
         action_payload: { loop: 'B', angle: 'nurture', sender: senderForType('patio'),
                           why: 'Quoted 18 days ago, no decision.' } }),

    // 4. SNOOZED — rep deferred; snooze_until visible; reappears
    //    automatically. Card shows "Snoozed until <relative time>".
    fx({ id: 'state-snoozed', _state: 'snoozed', status: 'snoozed',
         job_id: 'job-103', job_number: 'SWP-FIX-103',
         client_name: 'Demo Customer Juliet', suburb: 'Wanneroo', type: 'patio', value_inc_gst: 22500,
         action_type: 'call_now_prompt', channel: 'internal',
         drafted_message: '',
         snoozed_at: ago(1, 'hours'),
         snooze_until: new Date(new Date(BASELINE_NOW).getTime() + 22 * 60 * 60 * 1000).toISOString(),
         action_payload: { loop: 'B', angle: 'decision_led', sender: senderForType('patio'),
                           why: 'Viewed 4 days ago, no reply.' } }),

    // 5. BLOCKED — policy refused. Card shows BLOCKED chip + the
    //    exact policy reason; no Approve / Edit controls (only
    //    Reject / Open job). Uses job-108 (null client_phone).
    fx({ id: 'state-blocked', _state: 'blocked', status: 'proposed',
         job_id: 'job-108', job_number: 'SWP-FIX-108',
         client_name: 'Demo Customer Oscar', suburb: 'Hillarys', type: 'patio',
         action_type: 'first_contact_sms', channel: 'sms',
         drafted_message: 'Hi Oscar, Nithin from SecureWorks here re your patio enquiry…',
         action_payload: { loop: 'A', angle: 'helpful_service', sender: senderForType('patio'),
                           why: 'No outbound recorded in 30h.' } }),
  ];

  // ── Pipeline stages (Slice 4A — canonical GHL names) ─────
  // Mirror GHL pipeline labels. Stays read-only fixture; real
  // sync ships in Slice 9.
  var pipelineStages = [
    { id: 'draft',     label: 'New / Draft',     ghl: 'New Lead' },
    { id: 'qualified', label: 'Qualified',       ghl: 'Qualified' },
    { id: 'quoted',    label: 'Quoted',          ghl: 'Quote Sent' },
    { id: 'negotiating', label: 'Negotiating',   ghl: 'In Discussion' },
    { id: 'accepted',  label: 'Accepted',        ghl: 'Won' },
    { id: 'scheduled', label: 'Scheduled',       ghl: 'Scheduled' },
    { id: 'done',      label: 'Done',            ghl: 'Completed' },
    { id: 'lost',      label: 'Lost',            ghl: 'Lost' },
  ];

  // ── Performance fixture (this week, system-wide) ──────────
  var performance = {
    window: 'This week',
    totals: { leads: 18, booked_scopes: 12, quotes_sent: 9, quote_value_sent: 187400, accepted: 4, revenue_won: 78650, conversion_pct: 22.2 },
    perRep: { disabled: true, reason: 'Per-rep metrics disabled — jobs.created_by unreliable on opportunity-picker path. Pending SALES-DATA-1 + SALES-DATA-3.' },
    velocity: [
      { from: 'lead',     to: 'first_contact', median_days: 0.3 },
      { from: 'first_contact', to: 'booked',  median_days: 1.4 },
      { from: 'booked',   to: 'scoped',       median_days: 2.1 },
      { from: 'scoped',   to: 'quoted',       median_days: 1.8 },
      { from: 'quoted',   to: 'accepted',     median_days: 6.5 },
    ],
  };

  // ── Lead source funnel (90d) ─────────────────────────────
  var leadSource90d = [
    { source: 'Google Ads',   count: 42 },
    { source: 'Direct',       count: 18 },
    { source: 'Referral',     count: 11 },
    { source: 'Unattributed', count: 9  },
    { source: 'Facebook',     count: 7  },
  ];

  // ── Stream-mismatch banner ───────────────────────────────
  var streamMismatch = { smart_nudges: 14, ai_proposed_actions: 23 };

  // ── Disabled tiles (Today tab footer) ────────────────────
  var disabled = [
    { title: 'Per-rep leaderboard',       reason: 'Pending SALES-DATA-1 + SALES-DATA-3.',
      detail: 'jobs.created_by is unreliable on the opportunity-picker path. Per-rep volume, win rates, and commission are unsafe until the writer fix and historical backfill ship. Sender identity is unaffected (always type-based: Nithin patio / Khairo fencing).' },
    { title: 'Real Send / Book / Call',   reason: 'Pending outbound-bypass closure + GHL calendar adapter.',
      detail: 'Send/Book/Call buttons are stubbed in this preview. No SMS, email, or appointment writes will fire until the outbound approval gate is closed and the calendar adapter ships.' },
    { title: 'Coaching tile',             reason: 'Pending 30-60 days of clean win/loss data.',
      detail: 'Coaching needs trustworthy outcome history. Once Cap 0 release-truth is green and per-rep attribution is correct, the system will accumulate the series we can coach against.' },
  ];

  window.SALE_PREVIEW_FIXTURES = {
    _brand: '4A',                 // Slice 4A — Job Brain shape
    engineNow: BASELINE_NOW,
    jobs: jobs,
    events: events,
    jobContext: jobContext,
    proposedActions: proposedActions,
    // Slice 4A additions (Job Brain shape):
    conversation: conversation,
    coaching: coaching,
    pipelineStages: pipelineStages,
    // Product review pass — display-only lifecycle states:
    lifecycleStates: lifecycleStates,
    // Legacy keys for the secondary tabs (Calendar / Pipeline / Performance):
    pipeline: pipeline,
    calendar: calendar,
    performance: performance,
    leadSource90d: leadSource90d,
    streamMismatch: streamMismatch,
    disabled: disabled,
  };
})();
