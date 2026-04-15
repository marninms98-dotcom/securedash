# Pipeline Redesign — SecureWorks Ops Dashboard
## Fencing Pipeline (Phase 1)

---

## Context

SecureWorks previously used GHL (GoHighLevel) as its pipeline management tool. The team has since migrated to the custom ops dashboard. The goal of this project is to replicate and improve on the GHL pipeline stages within the ops dashboard — making it the single source of truth for job progression, automations, and team coordination.

The ops dashboard currently has one generic pipeline (Jobs tab) with basic stages shared across all job types. This is being replaced with **3 separate pipelines**:
- **Fencing** (Phase 1 — this document)
- **Patio** (Phase 2 — TBD)
- **Decking** (Phase 3 — TBD)

Each pipeline has its own tab in the UI, its own stage columns, its own automations, and its own card design. Job types are already stored on the `jobs` table (`type: 'fencing' | 'patio' | 'decking'`), so the data foundation is there.

---

## UI Structure

### Separate Top-Level Tabs
Replace the current single "Jobs" tab with 3 dedicated pipeline tabs:
- **Fencing**
- **Patio**
- **Decking**

Each tab renders its own kanban board with its own stage column order. The existing filter chips (All / Fencing / Patio / Decking) are removed in favour of this tab structure.

### Stage Storage
Each job's current stage is stored as a `status` value in the `jobs` table (text field). New status values will be added to support the granular stages below. All stage transitions are recorded as `job_events` for audit trail.

---

## Fencing Pipeline — 12 Stages + Archive

---

### Stage 1 — Quoted

**What it means:** The scope has been completed by Khairo in the fence designer tool. A quote PDF has been generated and the job has been assigned a job number (SWF-XXXXX). The job is now waiting for the client to accept.

**How a job gets here:**
- Khairo completes the scope in the fence designer tool
- Quote PDF is generated → scoping tool calls the backend → job status automatically set to `quoted` + job number assigned
- This is already automated — no change needed here

**What happens in this stage:**
- Quote is sent to the client via email with a link to view and accept it (client-facing quote viewer — currently being fixed by Marnin)
- The quote viewer will have an **"Accept Quote"** button for the client

**How a job leaves this stage:**
- **Ideal (once Marnin's fix is live):** Client clicks "Accept Quote" on the quote link → system automatically moves job to Stage 2 (Accepted)
- **In the meantime:** Ops staff manually move the card from Quoted → Accepted on the dashboard or via JARVIS

**Automation — 7-day follow-up nudge:**
- If a job sits in `Quoted` for 7 days with no client acceptance → system fires a nudge to Khairo to follow up with the client
- The nudge system already exists (`smart_nudges` table) — just needs this rule added
- Suggested nudge message to Khairo: *"Quote for [Client Name] ([Job Number]) has been sitting open for 7 days. Consider following up."*

**Notes:**
- The `share_token` infrastructure already exists on `job_documents` — this is what powers the client-facing quote link
- `accepted_at` field exists on `job_documents` — this gets set when client accepts
- The 7-day nudge logic mirrors existing stale-quote nudge patterns already in the codebase

---

### Stage 2 — Accepted

**What it means:** Client has accepted the quote. Job is now ready to be invoiced. This is Shaun's handover point — he comes in here to raise the deposit invoice.

**How a job gets here:**
- Client clicks "Accept" on the quote link (automated, once Marnin's fix is live)
- OR ops staff manually move it / tell JARVIS to move it

**What happens in this stage:**
- Job lands here and flags Shaun: **"Ready to Invoice"**
- Shaun reviews the job details and raises the deposit invoice
- The system already knows whether the job is a shared fence (from `scope_json.job.neighboursRequired` and `scope_json.job.neighbours` array)
- Based on that, the deposit invoice is for either 25% or 50%

**How a job leaves this stage:**
- Shaun raises the deposit invoice → job automatically moves to Stage 3 (Awaiting Deposit)

**Suggestion:**
- Add a prominent **"Raise Deposit Invoice"** action button on the card in this stage
- Pre-fill the invoice amount based on shared/non-shared logic from the scope
- For shared fences: auto-generate invoices for both client AND neighbour(s)

---

### Stage 3 — Awaiting Deposit

**What it means:** Deposit invoice has been sent. Waiting for payment to come through.

**How a job gets here:**
- Deposit invoice raised by Shaun → auto-moves here

**Card design — Shared Fence Indicator:**
- All jobs show a badge indicating shared or solo:
  - Solo job: no badge (clean)
  - 2-party shared fence: **N2** badge (orange)
  - 3-party shared fence: **N3** badge (orange)
  - 4-party shared fence: **N4** badge (orange)
- For shared fences, card shows per-party payment status:
  - Example: **N2 — Client ✓ | Neighbour 1 ⏳**
  - This makes it immediately clear who has paid and who hasn't without opening the job

**How a job leaves this stage:**
- **Manual:** Shaun verifies payment with the bank → drags the card or tells JARVIS *"Move [job] to Order Materials"*
- **Future automation (optional):** When Xero marks the deposit invoice as paid → auto-move to Stage 4. Not implemented in Phase 1 — Shaun wants to manually verify with the bank first.

**Notes:**
- For shared fences, Shaun may need to wait for ALL parties to pay before moving forward. The N2/N3/N4 tracker makes this visible at a glance.
- The `invoice.paid` business event already fires when Xero syncs a payment — the auto-trigger can be added later with minimal work.

---

### Stage 4 — Order Materials

**What it means:** Deposit confirmed. Time to place the material order. This is flagged to Shaun to action.

**How a job gets here:**
- Shaun manually moves the job here after confirming deposit payment with the bank

**What happens in this stage:**
- Card immediately shows a **"Order Materials"** action flag — Shaun can see at a glance what needs doing
- The scoping tool already pre-computes a full Draft Material PO (visible in the internal section of the quote — "DRAFT MATERIAL & REMOVAL PURCHASE ORDER") with line items, quantities, rates, and costs
- This data lives in the job's `scope_json` / `pricing_json`

**The "Place Material Order" button:**
When Shaun clicks the action flag, he gets a review screen showing:
- Supplier name (pre-filled from scope — Khairo selects the supplier during scoping, e.g. Metroll, Fencing Warehouse)
- Line items from the Draft Material PO (pre-populated from scope)
- Total cost estimate

Shaun can:
1. **Change the supplier** if needed
2. **Confirm → Raise PO** — creates a formal draft PO in the system directed to the selected supplier, ready to send
3. **Confirm → Draft Email** — pre-fills a supplier email template (template to be provided by Shaun later) with the material list

**How a job leaves this stage:**
- PO raised / email drafted → job auto-moves to Stage 5 (Awaiting Supplier)

**Notes:**
- The supplier is pre-set in the scope (`scope_json.job.supplier`) — default to this, allow override
- The Draft Material PO data in the scope includes: panels, posts, gate kits, concrete, fixings, delivery
- Labour PO and Sales Commission PO are separate and handled independently (not part of the material order flow here)

---

### Stage 5 — Awaiting Supplier

**What it means:** PO or material order email has been sent to the supplier. Waiting for them to confirm stock availability, pricing, and a delivery/pickup date.

**How a job gets here:**
- PO sent or email drafted in Stage 4 → auto-moves here

**What happens in this stage:**
- System monitors the supplier inbox for a reply linked to this PO (existing `po_email_received` event infrastructure)
- The PO status updates to `sent` when emailed

**48-hour chase automation:**
- If no supplier reply is received within **48 hours** of the PO being sent → system flags to Shaun and/or JARVIS to chase
- The existing codebase already has 48h awaiting-reply logic for POs (`last_po_email_at`, `last_po_email_dir` fields + the `awaitingReply` counter in the kanban)
- This just needs to be connected to a notification/nudge

**How a job leaves this stage:**
- Supplier replies with confirmation → job moves to Stage 6 (Order Confirmed)
- This can be auto-detected when a supplier email is received and classified as a quote/confirmation, OR manually confirmed by Shaun/JARVIS

---

### Stage 6 — Order Confirmed

**What it means:** Supplier has confirmed stock, pricing (if applicable), and given a date for delivery or pickup.

**How a job gets here:**
- Supplier confirmation received → moved here (manually or via email classification automation)

**What happens in this stage:**
- Confirmed date is recorded on the PO (`confirmed_delivery_date` field already exists)
- Card shows: **"Pickup — 18 Apr"** or **"Delivery — 20 Apr"** or **"Date TBC"** if not yet confirmed
- Pickup/Delivery tag is shown on the card (single stage, not split into two columns)

**How a job leaves this stage:**
- Once both a **delivery/pickup date** AND an **install date** are set → job moves to Stage 7 (Schedule Install)
- Install date is either confirmed here or carried over from a pre-agreed date in client comms (see Stage 7)

---

### Stage 7 — Schedule Install

**What it means:** Materials are confirmed. Now the install date needs to be locked in. This stage coordinates the delivery/pickup date with the install date and checks for any pre-agreed dates from client communications.

**How a job gets here:**
- Order confirmed + dates being locked in

**Two critical dates required in this stage:**
1. **Delivery / Pickup date** — confirmed from supplier
2. **Install date** — the day crew is on site

**Smart date detection:**
- System scans Khairo's client chat history (GHL conversations, internal notes, emails) for any dates that were pre-discussed with the client
- Surfaces these to Shaun: *"Khairo mentioned [date] in a message on [date] — is this the install date?"*
- Saves Shaun from double-booking or conflicting with a client expectation

**Suggestion:** This scan can use JARVIS / AI to parse messages for date mentions and flag them. The `get_conversation` and `get_chat_logs` MCP tools already exist.

**How a job leaves this stage:**
- Both dates confirmed → job stays here until 2 days before install date
- **2 days before install date → auto-moves to Stage 8 (Scheduled)**

---

### Stage 8 — Scheduled

**What it means:** Install is 2 days away. Job is confirmed and locked in. Client is notified.

**How a job gets here:**
- Automated: 2 days before the install date → job auto-moves from Stage 7 to here

**Auto SMS to client (via GHL):**
- Sent immediately when job moves to this stage
- Sender: **SecureWorks Fencing** (not individual crew member — keeps it general)
- Template (to be refined):
  > *"Hi [Client Name], this is SecureWorks Fencing confirming your installation at [Address] ([Job Number]) scheduled for [Install Date]. Our team will arrive at approximately [Start Time]. If you have any questions or concerns, please don't hesitate to reach out. We look forward to seeing you!"*
- SMS sent via GHL

**What happens in this stage:**
- Job sits here until install day
- On install day → moves to **In Progress** (auto at 7am OR when crew clocks on via trade app)
- Crew assignment already exists — Henry or whoever is assigned

**Rectification path:**
- After install, job is manually marked complete by Shaun or crew
- If there are issues → moves to **Rectification** (Stage 9)
- If all good → moves to **Final Payment** (Stage 10)

---

### Stage 9 — Rectification

**What it means:** Post-install issues have been identified. A return visit is needed to fix or complete work.

**How a job gets here:**
- Job marked complete → Shaun or crew flags rectification needed → manually moved here

**What happens in this stage:**
- Prompts a **new scheduling task** — crew needs to be re-assigned and a new date set
- Follows the same scheduling flow as Stage 7/8 (date set → 2-day SMS → crew on site)
- Can loop multiple times if needed

**How a job leaves this stage:**
- Rectification complete → job moves to Stage 10 (Final Payment)

**Notes:**
- Rectification jobs should be clearly marked on the card (e.g. a **"RECT"** badge) so they stand out in the pipeline
- Important for tracking how often rectifications happen per crew member / job type (future reporting)

---

### Stage 10 — Final Payment

**What it means:** Job is done (or rectification complete). Time to collect the final balance payment.

**How a job gets here:**
- Job marked complete → no rectification needed → auto-moves here
- OR rectification complete → auto-moves here

**What happens in this stage:**
- Card flags Shaun: **"Review & Send Final Invoice"**
- Shaun reviews the final invoice before it goes out — **this is a mandatory manual review step, nothing is auto-sent**
- Invoice is for the remaining balance (total quoted − deposit already paid)
- Invoice sent via Xero (same process as deposit invoice)

**Shared fence handling:**
- N2/N3/N4 badge reappears — final payment may be split across multiple parties
- Card shows per-party payment status (same as Stage 3)
- Shaun may need to send separate invoices to client and neighbour(s)

**How a job leaves this stage:**
- Balance payment confirmed by Shaun (manually, or via JARVIS) → job moves to Stage 11 (Get Review)

---

### Stage 11 — Get Review

**What it means:** Final payment received. Time to request a Google review from the client.

**How a job gets here:**
- Shaun or JARVIS manually confirms balance is paid → job auto-moves here

**Auto SMS to client (via GHL):**
- Sent immediately when job moves to this stage
- Template (to be refined by Shaun):
  > *"Hi [Client Name], thank you so much for choosing SecureWorks! We hope you're loving the result. If you have a moment, we'd really appreciate it if you could leave us a Google review — it means a lot to the team: [Google Review Link]. Thanks again!"*

**How a job leaves this stage:**
- After **2 days** → job automatically moves to Stage 12 (Complete), regardless of whether a review was left
- The 2-day window is intentional — enough time for the client to review without holding the job card up indefinitely

---

### Stage 12 — Complete

**What it means:** Job is fully done. Payment received, review requested. Job is winding down.

**How a job gets here:**
- 2 days after Get Review stage → auto-moves here

**What happens in this stage:**
- Job card remains visible in the Complete column for **7 days**
- No action required — this is a visibility window so recent completions are easy to reference
- After 7 days → job automatically moves to **Archive**

---

### Archive (Not a pipeline stage — a separate section)

**What it means:** Job is fully closed and stored for records.

**How a job gets here:**
- 7 days after moving to Complete → auto-archived

**What it looks like:**
- Not shown in the main pipeline kanban columns
- Accessible via a dedicated **"Archive"** section/subheading below the pipeline (or as a separate view)
- Has a **search function** — search by client name, job number, suburb, date range
- All job data, POs, invoices, documents, photos remain accessible

---

## Shared Fence — N2/N3/N4 System (Cross-Stage)

This applies across multiple stages (Awaiting Deposit, Final Payment) and is a system-wide feature:

**Badge logic:**
- `scope_json.job.neighbours` array length determines N count
- 1 neighbour = N2 (client + 1 neighbour)
- 2 neighbours = N3 (client + 2 neighbours)
- etc.

**Card display:**
- Orange **N2 / N3 / N4** badge on the job card
- In deposit/payment stages: per-party status shown inline
  - ✓ = paid / confirmed
  - ⏳ = pending
  - ⚠️ = overdue

**Future:** This indicator should persist across ALL stages, not just payment stages, so the team always knows at a glance if a job involves multiple parties.

---

## Automation Summary

| Trigger | Action |
|---------|--------|
| Quote generated in scoping tool | Job moves to `Quoted` |
| Client clicks Accept on quote link | Job moves to `Accepted` |
| Quote sits in Quoted for 7 days | Nudge fires to Khairo to follow up |
| Deposit invoice raised | Job moves to `Awaiting Deposit` |
| Shaun confirms deposit paid | Job moves to `Order Materials` (manual) |
| PO sent to supplier | Job moves to `Awaiting Supplier` |
| 48h no supplier reply | Chase nudge fires to Shaun / JARVIS |
| Supplier confirms order | Job moves to `Order Confirmed` |
| Both dates locked in | Job moves to `Schedule Install` |
| 2 days before install date | Job moves to `Scheduled` + auto SMS to client |
| Install day (7am or crew clock-on) | Job moves to `In Progress` |
| Job marked complete — issues | Job moves to `Rectification` |
| Job marked complete — no issues | Job moves to `Final Payment` |
| Rectification complete | Job moves to `Final Payment` |
| Shaun confirms balance paid | Job moves to `Get Review` + auto SMS review request |
| 2 days after Get Review | Job moves to `Complete` |
| 7 days after Complete | Job moves to Archive |

---

## Technical Implementation Notes

### Files to Modify

| File | Change |
|------|--------|
| `modules/ops-shared.js` | Add new STATUS_LABELS and STATUS_COLORS for all new stages |
| `modules/ops-pipeline.js` | Add Fencing tab, new stage column order, new sub-stage logic, new drag-drop rules, N2/N3/N4 badge rendering |
| `ops.html` | Add Fencing / Patio / Decking top-level tabs, wire up tab switching |
| `supabase/functions/ops-api/index.ts` | Add new status values, new automation triggers, 7-day nudge rule, 48h PO chase, 2-day SMS trigger, auto-archive logic |
| `modules/ops-job-detail.js` | Add stage-specific action buttons (Raise Invoice, Place Material Order, Confirm Payment, etc.) |

### New DB Status Values Required
```
quoted (exists)
accepted (exists)
awaiting_deposit (new — replaces generic 'accepted' sub-stage)
order_materials (new)
awaiting_supplier (new)
order_confirmed (new)
schedule_install (new)
scheduled (exists)
in_progress (exists)
rectification (new)
final_payment (new)
get_review (new)
complete (exists)
archived (new)
```

### Dependencies / Blockers
- **Marnin's quote acceptance fix** — Stage 1→2 automation is blocked until the client-facing "Accept Quote" button is live. Manual fallback is fine for now.
- **GHL SMS integration** — Auto-SMS in Stage 8 and Stage 11 uses GHL. The `sw_send_chase_sms` and `sw_send_sms` MCP tools already exist.
- **Supplier email parsing** — Stage 5→6 auto-transition relies on classifying incoming supplier emails. The `supplier_quote_analysed` event already fires — needs to be connected to the stage transition.
- **Date scanning in chats** — Stage 7 smart date detection requires JARVIS to parse conversations. `sw_get_conversation` and `sw_get_chat_logs` tools exist.

### Phase 2 / 3
- Patio pipeline stages — TBD (separate session with Shaun)
- Decking pipeline stages — TBD (separate session with Shaun)
- Both will follow the same architecture as Fencing

---

## Open Questions (To Resolve Before Build)
1. Email template for material order supplier email — Shaun to provide
2. SMS template for 2-day install confirmation — Shaun to refine
3. SMS template for Google review request — Shaun to refine
4. Google review link — Shaun to provide
5. Patio and Decking pipeline stages — separate session
6. Whether auto-Xero payment sync replaces manual bank verification in future (Phase 2 decision)
