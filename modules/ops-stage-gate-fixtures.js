/* ════════════════════════════════════════════════════════════════
   ops-stage-gate-fixtures.js — Cap 1B fixture pack

   ≥18 fixtures covering every canonical stage + governance edge cases.
   Each fixture is { id, label, packet, supplemental, expected }.
   `packet` follows T1 release-packet-contract-v1.md §9 shape.

   Anchor for deterministic install_in_window math:
     2026-05-02T00:00:00.000Z (UTC, equivalent to 08:00 AWST).
   ════════════════════════════════════════════════════════════════ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SW_STAGE_GATE_FIXTURES = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NOW_ISO = '2026-05-02T00:00:00.000Z';

  function inDays(days) {
    var d = new Date(NOW_ISO);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString();
  }

  function makeRevision(jobId, opts) {
    opts = opts || {};
    return {
      id: 'rev-' + jobId,
      job_id: jobId,
      revision_number: opts.revision_number || 1,
      source_tool: opts.source_tool || 'patio',
      sent_at: opts.sent_at !== undefined ? opts.sent_at : inDays(-7),
      recipient_email: opts.recipient_email || 'customer@example.com',
      scope_snapshot: opts.scope_snapshot || { access_notes: null, no_special_access: null, council_required: false },
      pricing_snapshot: opts.pricing_snapshot || { total_inc_gst: opts.total || 12500, total_ex_gst: Math.round((opts.total || 12500) / 1.1), margin_pct: 0.32 },
      scope_hash: 'sha256:scope-' + jobId,
      pricing_hash: 'sha256:pricing-' + jobId,
      margin_pct: 0.32,
      total_inc_gst: opts.total || 12500,
      total_ex_gst: Math.round((opts.total || 12500) / 1.1),
      created_by: 'sales-1',
      created_at: inDays(-8)
    };
  }

  function makeDocument(jobId, opts) {
    opts = opts || {};
    return {
      id: 'doc-' + jobId,
      pdf_url: 'https://example.test/quote/' + jobId + '.pdf',
      share_token: 'tok-' + jobId,
      quote_number: 'Q-' + jobId,
      sent_at: opts.sent_at !== undefined ? opts.sent_at : inDays(-7),
      viewed_at: opts.viewed_at !== undefined ? opts.viewed_at : inDays(-6),
      accepted_at: opts.accepted_at !== undefined ? opts.accepted_at : null,
      declined_at: opts.declined_at !== undefined ? opts.declined_at : null
    };
  }

  function makePO(jobId, idx, opts) {
    opts = opts || {};
    return {
      id: 'po-' + jobId + '-' + idx,
      po_number: 'PO-' + jobId + '-' + idx,
      po_type: opts.po_type || 'material',
      supplier_name: opts.supplier_name || 'Bondor (test)',
      line_items: opts.line_items || [{ desc: 'Insulated panel', qty: 8, unit_price: 320 }],
      subtotal: opts.subtotal || 2560,
      tax: opts.tax || 256,
      total: opts.total || 2816,
      status: opts.status || 'draft',
      delivery_date: opts.delivery_date || null,
      confirmed_delivery_date: opts.confirmed_delivery_date || null,
      quote_revision_id: 'rev-' + jobId
    };
  }

  function makeWO(jobId, opts) {
    opts = opts || {};
    return {
      id: 'wo-' + jobId,
      wo_number: 'WO-' + jobId,
      status: opts.status || 'draft',
      scope_items: opts.scope_items || [],
      special_instructions: opts.special_instructions || '',
      materials_summary_derived: opts.materials_summary_derived || [],
      share_token: 'wotok-' + jobId,
      scheduled_date: opts.scheduled_date || null,
      assigned_user_id: opts.assigned_user_id || null,
      quote_revision_id: 'rev-' + jobId
    };
  }

  function makeCustomer(opts) {
    opts = opts || {};
    return {
      name: opts.name || 'Customer A',
      email: opts.email || 'customer@example.com',
      mobile: opts.mobile !== undefined ? opts.mobile : '+61400000001',
      ghl_contact_id: opts.ghl_contact_id || 'ghl-A'
    };
  }

  function makeSite(opts) {
    opts = opts || {};
    return {
      address: opts.address !== undefined ? opts.address : '12 Test Street',
      suburb: opts.suburb !== undefined ? opts.suburb : 'Bayswater',
      lat: opts.lat !== undefined ? opts.lat : -31.92,
      lng: opts.lng !== undefined ? opts.lng : 115.92
    };
  }

  function makeJob(jobId, opts) {
    opts = opts || {};
    return {
      id: jobId,
      job_number: opts.job_number || ('SWP-' + jobId.replace(/[^0-9]/g, '').padStart(5, '0')).slice(0, 9),
      type: opts.type || 'patio',
      status: opts.status,
      quoted_at: opts.quoted_at !== undefined ? opts.quoted_at : inDays(-7),
      accepted_at: opts.accepted_at !== undefined ? opts.accepted_at : null,
      completed_at: opts.completed_at !== undefined ? opts.completed_at : null
    };
  }

  function makePacket(parts) {
    return {
      revision: parts.revision || null,
      document: parts.document || null,
      purchase_orders: parts.purchase_orders || [],
      work_order: parts.work_order || null,
      media: parts.media || [],
      events: parts.events || [],
      customer: parts.customer || makeCustomer(),
      site: parts.site || makeSite(),
      job: parts.job,
      staged: parts.staged !== undefined ? parts.staged : false
    };
  }

  var fixtures = [];

  // ── Group A: every canonical stage (12 forward + 2 terminal) ──

  // 1. draft
  fixtures.push({
    id: 'patio_draft',
    label: 'Patio in draft (no quote yet)',
    packet: makePacket({ revision: null, document: null, job: makeJob('20001', { status: 'draft', type: 'patio', quoted_at: null }) }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: false } },
    expected: { current_stage: 'draft', frontend_bucket: 'quote', owner: 'sales', confidence: 'high', has_blocker: false }
  });

  // 2. quoted (sent, awaiting client)
  fixtures.push({
    id: 'patio_quoted_awaiting_client',
    label: 'Patio quoted, awaiting client decision',
    packet: makePacket({
      revision: makeRevision('20002', { sent_at: inDays(-3) }),
      document: makeDocument('20002', { accepted_at: null, declined_at: null }),
      job: makeJob('20002', { status: 'quoted', type: 'patio' })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: false } },
    expected: { current_stage: 'quoted', frontend_bucket: 'waiting_client', owner: 'sales' }
  });

  // 3. fencing partially_accepted (multi-neighbour, 1 of 3 accepted)
  fixtures.push({
    id: 'fencing_partially_accepted_pending',
    label: 'Fencing partially_accepted — 1 of 3 neighbours accepted, all-or-nothing pending',
    packet: makePacket({
      revision: makeRevision('20003', {
        sent_at: inDays(-5),
        scope_snapshot: {
          parties: [
            { id: 'p1', name: 'Neighbour A', accepted_at: inDays(-2), declined_at: null },
            { id: 'p2', name: 'Neighbour B', accepted_at: null, declined_at: null },
            { id: 'p3', name: 'Neighbour C', accepted_at: null, declined_at: null }
          ]
        }
      }),
      document: makeDocument('20003', { accepted_at: null }),
      job: makeJob('20003', { status: 'partially_accepted', type: 'fencing' })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: false } },
    expected: { current_stage: 'partially_accepted', frontend_bucket: 'waiting_client', owner: 'sales', has_blocker: true, blocker_includes: ['partial_acceptance_complete'] }
  });

  // 4. fencing partially_accepted with one decline → must revert
  fixtures.push({
    id: 'fencing_partial_accept_one_declined',
    label: 'Fencing partially_accepted with one neighbour declined — engine flags revert-to-quoted',
    packet: makePacket({
      revision: makeRevision('20004', {
        sent_at: inDays(-5),
        scope_snapshot: {
          parties: [
            { id: 'p1', accepted_at: inDays(-2), declined_at: null },
            { id: 'p2', accepted_at: null, declined_at: inDays(-1) },
            { id: 'p3', accepted_at: inDays(-2), declined_at: null }
          ]
        }
      }),
      document: makeDocument('20004', { accepted_at: null }),
      job: makeJob('20004', { status: 'partially_accepted', type: 'fencing' })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: false } },
    expected: { current_stage: 'partially_accepted', has_blocker: true, blocker_includes: ['partial_acceptance_complete'] }
  });

  // 5. accepted (single-party patio, deposit pending)
  fixtures.push({
    id: 'patio_accepted_no_deposit',
    label: 'Patio accepted — awaiting deposit',
    packet: makePacket({
      revision: makeRevision('20005', { sent_at: inDays(-7) }),
      document: makeDocument('20005', { accepted_at: inDays(-2) }),
      job: makeJob('20005', { status: 'accepted', type: 'patio', accepted_at: inDays(-2) })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: false } },
    expected: { current_stage: 'accepted', frontend_bucket: 'packet_prep', owner: 'sales' }
  });

  // 6. awaiting_deposit blocking material order (KEY GOVERNANCE)
  fixtures.push({
    id: 'patio_awaiting_deposit_blocks_materials',
    label: 'Patio awaiting_deposit — deposit gate blocks downstream material ordering',
    packet: makePacket({
      revision: makeRevision('20006', { sent_at: inDays(-9) }),
      document: makeDocument('20006', { accepted_at: inDays(-4) }),
      job: makeJob('20006', { status: 'awaiting_deposit', type: 'patio', accepted_at: inDays(-4) })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: false } },
    expected: { current_stage: 'awaiting_deposit', has_blocker: true, blocker_includes: ['deposit_paid'] }
  });

  // 7. deposit override (Marnin/Shaun bank-confirmed outside Xero) → unblocks
  fixtures.push({
    id: 'patio_deposit_bank_confirmed_override',
    label: 'Marnin override: bank-confirmed deposit outside Xero → deposit_paid overridden',
    packet: makePacket({
      revision: makeRevision('20007', { sent_at: inDays(-9) }),
      document: makeDocument('20007', { accepted_at: inDays(-4) }),
      job: makeJob('20007', { status: 'awaiting_deposit', type: 'patio', accepted_at: inDays(-4) })
    }),
    supplemental: {
      assignments: [],
      job_context: [
        { id: 'jc-7', kind: 'gate_override', value: { gate_id: 'deposit_paid', reason: 'Bank deposit confirmed via screenshot 2026-05-02', by: 'marnin', by_role: 'marnin', reason_category: 'bank_confirmed' } }
      ],
      deposit: { deposit_paid: false }
    },
    expected: { current_stage: 'awaiting_deposit', has_override: true, override_includes: ['deposit_paid'] }
  });

  // 8. patio approvals — required and pending
  fixtures.push({
    id: 'patio_approvals_required_pending',
    label: 'Patio approvals required (council pending)',
    packet: makePacket({
      revision: makeRevision('20008', {
        sent_at: inDays(-12),
        scope_snapshot: { council_required: true, council_status: 'pending' }
      }),
      document: makeDocument('20008', { accepted_at: inDays(-7) }),
      job: makeJob('20008', { status: 'approvals', type: 'patio', accepted_at: inDays(-7) })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: true } },
    expected: { current_stage: 'approvals', frontend_bucket: 'packet_prep', has_blocker: true, blocker_includes: ['council_approval_received'] }
  });

  // 9. patio approvals NOT applicable (governance: not_applicable, not failed)
  fixtures.push({
    id: 'patio_approvals_not_applicable',
    label: 'Patio with council_required=false — approvals gate marks not_applicable',
    packet: makePacket({
      revision: makeRevision('20009', {
        sent_at: inDays(-12),
        scope_snapshot: { council_required: false, council_status: 'not_required' }
      }),
      document: makeDocument('20009', { accepted_at: inDays(-7) }),
      job: makeJob('20009', { status: 'awaiting_deposit', type: 'patio', accepted_at: inDays(-7) })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: true } },
    expected: {
      current_stage: 'awaiting_deposit',
      gate_status_assertion: { gate_id: 'council_approval_received', expected_status: 'not_applicable' }
    }
  });

  // 10. fencing in approvals — illegal type combination
  fixtures.push({
    id: 'fencing_in_approvals_illegal',
    label: 'Fencing job written into approvals — engine flags type-violation downstream',
    packet: makePacket({
      revision: makeRevision('20010', { sent_at: inDays(-7) }),
      document: makeDocument('20010', { accepted_at: inDays(-3) }),
      job: makeJob('20010', { status: 'approvals', type: 'fencing', accepted_at: inDays(-3) })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: true } },
    expected: { current_stage: 'approvals', cantransition_assertion: { from: 'awaiting_deposit', to: 'approvals', type: 'fencing', expect_type_legal: false } }
  });

  // 11. order_materials with sent material PO
  fixtures.push({
    id: 'patio_order_materials_sent',
    label: 'Patio order_materials — material PO sent, awaiting supplier confirm',
    packet: makePacket({
      revision: makeRevision('20011', { sent_at: inDays(-14) }),
      document: makeDocument('20011', { accepted_at: inDays(-10) }),
      purchase_orders: [makePO('20011', 1, { status: 'sent', po_type: 'material', delivery_date: inDays(7) })],
      job: makeJob('20011', { status: 'order_materials', type: 'patio', accepted_at: inDays(-10) })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: true } },
    expected: { current_stage: 'order_materials', frontend_bucket: 'materials' }
  });

  // 12. awaiting_supplier — supplier ack pending (out of window → warning)
  fixtures.push({
    id: 'patio_awaiting_supplier_ack',
    label: 'Patio awaiting_supplier — confirmed_delivery_date pending (out of install window)',
    packet: makePacket({
      revision: makeRevision('20012', { sent_at: inDays(-16) }),
      document: makeDocument('20012', { accepted_at: inDays(-12) }),
      purchase_orders: [makePO('20012', 1, { status: 'sent', po_type: 'material', delivery_date: inDays(14), confirmed_delivery_date: null })],
      job: makeJob('20012', { status: 'awaiting_supplier', type: 'patio', accepted_at: inDays(-12) })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: true } },
    expected: { current_stage: 'awaiting_supplier', has_warning: true, warning_includes: ['supplier_logistics_confirmed'] }
  });

  // 13. order_confirmed in install window — supplier missing = blocker now
  fixtures.push({
    id: 'patio_order_confirmed_supplier_blocker_in_window',
    label: 'Patio order_confirmed — supplier confirmation missing AND install in 4 biz days',
    packet: makePacket({
      revision: makeRevision('20013', { sent_at: inDays(-21) }),
      document: makeDocument('20013', { accepted_at: inDays(-18) }),
      purchase_orders: [makePO('20013', 1, { status: 'sent', po_type: 'material', confirmed_delivery_date: null })],
      work_order: makeWO('20013', { status: 'sent', scheduled_date: inDays(4) }),
      job: makeJob('20013', { status: 'order_confirmed', type: 'patio', accepted_at: inDays(-18) })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: true } },
    expected: { current_stage: 'order_confirmed', install_in_window: true, has_blocker: true, blocker_includes: ['supplier_logistics_confirmed'] }
  });

  // 14. supplier logistics override (verbal Marnin/Shaun confirmation)
  fixtures.push({
    id: 'patio_supplier_logistics_override',
    label: 'Patio order_confirmed with verbal-confirm Logistics override (Marnin/Shaun)',
    packet: makePacket({
      revision: makeRevision('20014', { sent_at: inDays(-21) }),
      document: makeDocument('20014', { accepted_at: inDays(-18) }),
      purchase_orders: [makePO('20014', 1, { status: 'sent', po_type: 'material', confirmed_delivery_date: null })],
      work_order: makeWO('20014', { status: 'sent', scheduled_date: inDays(4) }),
      job: makeJob('20014', { status: 'order_confirmed', type: 'patio', accepted_at: inDays(-18) })
    }),
    supplemental: {
      assignments: [],
      job_context: [
        { id: 'jc-14', kind: 'gate_override', value: { gate_id: 'supplier_logistics_confirmed', signal: 'supplier_logistics', reason: 'Bondor rep confirmed via phone 2026-05-01', by: 'shaun', reason_category: 'verbal_confirmation' } }
      ],
      deposit: { deposit_paid: true }
    },
    expected: { current_stage: 'order_confirmed', has_override: true, override_includes: ['supplier_logistics_confirmed'] }
  });

  // 15. scheduled in window — all clear (READY)
  fixtures.push({
    id: 'patio_scheduled_ready_to_install',
    label: 'Patio scheduled in 3 biz days — all gates pass',
    packet: makePacket({
      revision: makeRevision('20015', { sent_at: inDays(-28) }),
      document: makeDocument('20015', { accepted_at: inDays(-25) }),
      purchase_orders: [makePO('20015', 1, { status: 'sent', po_type: 'material', confirmed_delivery_date: inDays(2) })],
      work_order: makeWO('20015', { status: 'sent', scheduled_date: inDays(3) }),
      job: makeJob('20015', { status: 'scheduled', type: 'patio', accepted_at: inDays(-25) })
    }),
    supplemental: {
      assignments: [{ id: 'a-15', user_id: 'crew-1', confirmation_status: 'confirmed', scheduled_date: inDays(3) }],
      job_context: [
        { id: 'jc-15a', kind: 'client_confirmation', value: { channel: 'sms', confirmed_at: inDays(-1) } },
        { id: 'jc-15b', kind: 'access_note', value: { text: 'side gate, dog in yard' } }
      ],
      deposit: { deposit_paid: true }
    },
    expected: { current_stage: 'scheduled', install_in_window: true, has_blocker: false }
  });

  // 16. scheduled but no crew assigned (KEY GOVERNANCE: scheduling needs crew)
  fixtures.push({
    id: 'patio_scheduled_no_crew',
    label: 'Patio scheduled in 4 biz days but no crew assigned — blocker',
    packet: makePacket({
      revision: makeRevision('20016', { sent_at: inDays(-28) }),
      document: makeDocument('20016', { accepted_at: inDays(-25) }),
      purchase_orders: [makePO('20016', 1, { status: 'sent', po_type: 'material', confirmed_delivery_date: inDays(2) })],
      work_order: makeWO('20016', { status: 'sent', scheduled_date: inDays(4) }),
      job: makeJob('20016', { status: 'scheduled', type: 'patio', accepted_at: inDays(-25) })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: true } },
    expected: { current_stage: 'scheduled', install_in_window: true, has_blocker: true, blocker_includes: ['crew_assigned'] }
  });

  // 17. scheduled with strict-access flag → client_confirmed_install becomes blocker
  fixtures.push({
    id: 'patio_strict_access_client_confirm_blocker',
    label: 'Patio scheduled with requires_strict_access flag — client_confirmed_install promoted to blocker',
    packet: makePacket({
      revision: makeRevision('20017', { sent_at: inDays(-28) }),
      document: makeDocument('20017', { accepted_at: inDays(-25) }),
      purchase_orders: [makePO('20017', 1, { status: 'sent', po_type: 'material', confirmed_delivery_date: inDays(2) })],
      work_order: makeWO('20017', { status: 'sent', scheduled_date: inDays(3) }),
      job: makeJob('20017', { status: 'scheduled', type: 'patio', accepted_at: inDays(-25) })
    }),
    supplemental: {
      assignments: [{ id: 'a-17', user_id: 'crew-1', confirmation_status: 'confirmed', scheduled_date: inDays(3) }],
      job_context: [
        { id: 'jc-17', kind: 'requires_strict_access', value: { reason: 'rooftop access, narrow lane' } }
      ],
      deposit: { deposit_paid: true }
    },
    expected: { current_stage: 'scheduled', install_in_window: true, has_blocker: true, blocker_includes: ['client_confirmed_install'] }
  });

  // 18. in_progress with install.started event
  fixtures.push({
    id: 'patio_in_progress',
    label: 'Patio in_progress with install.started event',
    packet: makePacket({
      revision: makeRevision('20018', { sent_at: inDays(-30) }),
      document: makeDocument('20018', { accepted_at: inDays(-26) }),
      purchase_orders: [makePO('20018', 1, { status: 'sent', po_type: 'material', confirmed_delivery_date: inDays(-1) })],
      work_order: makeWO('20018', { status: 'in_progress', scheduled_date: inDays(0) }),
      events: [{ id: 'ev-18a', event_type: 'install.started', occurred_at: inDays(0), source: 'trade_app', correlation_id: '20018', payload: {} }],
      job: makeJob('20018', { status: 'in_progress', type: 'patio', accepted_at: inDays(-26) })
    }),
    supplemental: {
      assignments: [{ id: 'a-18', user_id: 'crew-1', confirmation_status: 'confirmed', scheduled_date: inDays(0) }],
      job_context: [
        { id: 'jc-18a', kind: 'client_confirmation', value: { channel: 'sms', confirmed_at: inDays(-1) } },
        { id: 'jc-18b', kind: 'access_note', value: { text: 'no special access' } }
      ],
      deposit: { deposit_paid: true }
    },
    expected: { current_stage: 'in_progress', frontend_bucket: 'in_progress' }
  });

  // 19. complete (with install.completed event)
  fixtures.push({
    id: 'patio_complete',
    label: 'Patio complete with install.completed event',
    packet: makePacket({
      revision: makeRevision('20019', { sent_at: inDays(-40) }),
      document: makeDocument('20019', { accepted_at: inDays(-36) }),
      purchase_orders: [makePO('20019', 1, { status: 'sent', po_type: 'material', confirmed_delivery_date: inDays(-10) })],
      work_order: makeWO('20019', { status: 'complete', scheduled_date: inDays(-7) }),
      events: [
        { id: 'ev-19a', event_type: 'install.started', occurred_at: inDays(-7), source: 'trade_app', correlation_id: '20019', payload: {} },
        { id: 'ev-19b', event_type: 'install.completed', occurred_at: inDays(-5), source: 'trade_app', correlation_id: '20019', payload: {} }
      ],
      job: makeJob('20019', { status: 'complete', type: 'patio', accepted_at: inDays(-36), completed_at: inDays(-5) })
    }),
    supplemental: {
      assignments: [{ id: 'a-19', user_id: 'crew-1', confirmation_status: 'confirmed', scheduled_date: inDays(-7) }],
      job_context: [
        { id: 'jc-19a', kind: 'client_confirmation', value: { channel: 'sms' } },
        { id: 'jc-19b', kind: 'access_note', value: { text: 'no special access' } }
      ],
      deposit: { deposit_paid: true }
    },
    expected: { current_stage: 'complete', frontend_bucket: 'done', owner: 'system' }
  });

  // 20. cancelled (terminal)
  fixtures.push({
    id: 'patio_cancelled_terminal',
    label: 'Patio cancelled (terminal)',
    packet: makePacket({
      revision: makeRevision('20020', { sent_at: inDays(-15) }),
      document: makeDocument('20020', { accepted_at: null, declined_at: inDays(-10) }),
      job: makeJob('20020', { status: 'cancelled', type: 'patio' })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: false } },
    expected: { current_stage: 'cancelled', frontend_bucket: 'terminal' }
  });

  // 21. unknown status → status_mapping_gap
  fixtures.push({
    id: 'unknown_future_status',
    label: 'Job with unknown future status — must remain visible in status_mapping_gap',
    packet: makePacket({
      revision: makeRevision('20021', { sent_at: inDays(-5) }),
      document: makeDocument('20021', { accepted_at: inDays(-2) }),
      job: makeJob('20021', { status: 'waiting_on_some_new_stage', type: 'patio', accepted_at: inDays(-2) })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: false } },
    expected: { current_stage: null, frontend_bucket: 'status_mapping_gap', confidence: 'low', has_blocker: true, blocker_includes: ['status_mapped_for_pipeline'] }
  });

  // 22. illegal jump (canTransition test fixture)
  fixtures.push({
    id: 'patio_illegal_jump_complete_to_draft',
    label: 'canTransition: complete → draft is forbidden',
    packet: makePacket({
      revision: makeRevision('20022', { sent_at: inDays(-30) }),
      document: makeDocument('20022', { accepted_at: inDays(-26) }),
      job: makeJob('20022', { status: 'complete', type: 'patio', accepted_at: inDays(-26) })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: true } },
    expected: { current_stage: 'complete', cantransition_assertion: { from: 'complete', to: 'draft', type: 'patio', expect_allowed: false, expect_hard_blocked: true } }
  });

  // 23. backwards legal (scheduled → order_confirmed, install slipped)
  fixtures.push({
    id: 'patio_backwards_legal_install_slipped',
    label: 'canTransition: scheduled → order_confirmed (install slipped) is legal backward',
    packet: makePacket({
      revision: makeRevision('20023', { sent_at: inDays(-20) }),
      document: makeDocument('20023', { accepted_at: inDays(-17) }),
      job: makeJob('20023', { status: 'scheduled', type: 'patio', accepted_at: inDays(-17) })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: true } },
    expected: { current_stage: 'scheduled', cantransition_assertion: { from: 'scheduled', to: 'order_confirmed', type: 'patio', expect_allowed: true, expect_direction: 'backward' } }
  });

  // 24. cancelled → quoted (re-open) requires Marnin/Shaun override + ≥12 chars
  fixtures.push({
    id: 'cancelled_reopen_requires_override',
    label: 'canTransition: cancelled → quoted requires Marnin/Shaun override + reason ≥12 chars',
    packet: makePacket({
      revision: makeRevision('20024', { sent_at: inDays(-30) }),
      document: makeDocument('20024', { accepted_at: null, declined_at: inDays(-20) }),
      job: makeJob('20024', { status: 'cancelled', type: 'patio' })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: false } },
    expected: {
      current_stage: 'cancelled',
      cantransition_assertion_no_override: { from: 'cancelled', to: 'quoted', type: 'patio', expect_allowed: false, expect_requires_override: true },
      cantransition_assertion_with_override: { from: 'cancelled', to: 'quoted', type: 'patio', override: { role: 'marnin', reason: 'Client got new neighbour signed up - lets re-quote' }, expect_allowed: true }
    }
  });

  // 25. quick_quote conversion path
  fixtures.push({
    id: 'quick_quote_accepted',
    label: 'Quick Quote accepted — short-lived; converts to fencing/patio elsewhere',
    packet: makePacket({
      revision: makeRevision('20025', { sent_at: inDays(-2), source_tool: 'quick_quote' }),
      document: makeDocument('20025', { accepted_at: inDays(-1) }),
      job: makeJob('20025', { status: 'accepted', type: 'quick_quote', accepted_at: inDays(-1) })
    }),
    supplemental: { assignments: [], job_context: [], deposit: { deposit_paid: false } },
    expected: { current_stage: 'accepted', cantransition_assertion: { from: 'accepted', to: 'awaiting_deposit', type: 'quick_quote', expect_allowed: false } }
  });

  return {
    NOW_ISO: NOW_ISO,
    fixtures: fixtures,
    byId: fixtures.reduce(function (acc, f) { acc[f.id] = f; return acc; }, {})
  };
}));
