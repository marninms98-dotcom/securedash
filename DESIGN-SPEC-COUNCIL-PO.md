# SecureWorks Ops — Council Approvals + PO Email UX Redesign

## Design Council Synthesis
6 design agents (3 perspectives x 2 systems) debated the UX. This spec captures the consensus.

---

## COUNCIL APPROVALS — Complete Redesign

### Current: 1/10 (unusable kanban, 4 empty columns, accordion-in-accordion)
### Target: 9/10

### Architecture: 3-Layer Navigation (like iOS)

**Layer 1: Approval List** (replaces kanban)
- Vertical list of cards, sorted by urgency (blocked → unread → stalled → on track)
- Each card shows: progress ring (SVG circle), job number + client name, current step name, days in step, unread badge
- Filter chips at top: All | Needs Action (orange dot) | In Progress | Complete
- "Needs Action" is default filter on mobile — shows what needs you first
- "+ New" button top-right for starting new submissions
- No kanban columns. No drag-and-drop. No horizontal scroll.

**Layer 2: Approval Detail** (slides in from right, full-screen mobile)
- Hero section: horizontal segmented progress bar (green = complete, orange pulse = active, grey = pending)
- Large current step name (20px bold) — the single most important piece of info
- Vertical timeline of all steps with circle indicators (green check, orange active, grey pending, red blocked)
- Connecting line between steps (green up to current, grey after)
- "Complete & Advance" button on active step → existing modal flow
- Desktop: split pane (list left 360px, detail right)

**Layer 3: Step Conversation** (slides in over detail, z-index 210)
- Messages-style bubbles: outbound = orange right-aligned, inbound = warm grey left-aligned
- Sticky compose bar at bottom (rounded input + orange send button, like iMessage)
- Attachment chips inside bubbles (tap to open in new tab)
- AI classification pill above inbound bubbles
- "Full Compose" via overflow menu → opens existing poEmailComposeModal with council context

### Urgency Surfacing
- Today tab: add council items needing action to `renderActionableItems()`
- Approvals nav badge: count of items needing action (unread + blocked + stalled >7d)
- Card urgency tiers: 0-7d green, 8-14d amber, 15-21d red, 21d+ pulsing red

### Step Completion Animation
- Orange segment fills to green (0.4s ease)
- Indicator cross-fades from orange to green checkmark
- Next segment pulses orange
- Progress ring on list card updates
- Emotional payoff — feels like progress

### Files to Modify
- `ops.html` — replace approvalsKanban with approvalsList + add detail/thread view containers + CSS (~150 lines)
- `modules/ops-council.js` — complete rewrite of rendering (~462 lines → ~300 lines, simpler)
- `modules/ops-today.js` — add council attention items to renderActionableItems()

### What to Delete
- renderCouncilKanban() → replace with renderApprovalsList()
- renderCouncilCardDetail() → replace with openCouncilDetail()
- toggleCouncilCard(), toggleCouncilStepExpand() → replace with slide navigation
- onCouncilDrop() → no more drag-and-drop

---

## PO EMAIL — Targeted Improvements (not full rewrite)

### Current: 5/10 (functional but buried, no urgency surfacing)
### Target: 8/10

### Key Changes (in priority order)

**1. Surface PO urgency on Today tab** (highest impact, smallest change)
- Add "Supplier hasn't replied" items to `renderActionableItems()` in ops-today.js
- Items show: PO number, supplier name, days waiting, "Chase" button
- Chase button: one-tap send of pre-composed follow-up (no modal needed)
- Threshold: 3+ days = amber, 7+ days = red

**2. Reply status dot on Materials kanban cards**
- Green dot: supplier replied (last email is inbound)
- Orange dot: sent, awaiting reply <3 days
- Red dot: sent, no reply ≥3 days
- One visual element. No text. Just color.

**3. One-tap chase function**
- New `oneTapChase(poId)` function in ops-po-comms.js
- Pre-fills "order_query" template with all variables resolved
- Sends immediately via send-po-email edge function
- 3-second toast with "Undo" link
- Falls back to compose modal if no supplier email on file

**4. Messages-style email bubbles** (in thread view)
- Outbound right-aligned with subtle orange tint
- Inbound left-aligned with warm grey background
- Max-width 82% on mobile
- Date separators between days
- Attachment cards inside bubbles (PDF icon + filename, tap to open)
- Show last 3 messages by default (not 2)

**5. Quick Look overlay for attachments**
- Tap attachment → full-screen overlay with blurred backdrop
- PDF renders in iframe inside overlay
- Close button + tap-outside to dismiss
- Replaces current "open in new tab" pattern

**6. Compose preview** (already built, just needs wiring)
- Add Preview button to compose modal
- poComposeFormView / poComposePreviewView wrapper divs
- Existing previewPOEmail() function already does the rendering

**7. Contextual action button on kanban cards**
- If no emails sent: "Send PO" (existing)
- If sent, no reply 3+ days: "Chase" (calls oneTapChase)
- If unread inbound: "Reply" (highlighted, opens thread)

### Files to Modify
- `modules/ops-today.js` — add PO chase items (~30 lines)
- `modules/ops-po-comms.js` — oneTapChase(), rewrite renderPOEmailThread() for bubbles, add Quick Look
- `modules/ops-materials.js` — reply status dot on cards, contextual action button
- `ops.html` — Quick Look overlay HTML + CSS, compose preview wrappers

### What NOT to Build
- No new PO email tab (7 tabs is enough)
- No cross-job email inbox (surface urgency on Today instead)
- No real-time websocket polling (suppliers reply in hours, not seconds)
- No read receipt UI beyond delivery dots (creates anxiety)
- No bulk actions (5-30 POs is manageable individually)

---

## SHARED DESIGN PATTERNS

### Brand Compliance
- Dark Blue #293C46 for text/headings
- Orange #F15A29 for CTAs, active states, outbound bubbles
- Mid Blue #4C6A7C for secondary text
- Warm grey #F8F6F3 for backgrounds, inbound bubbles
- Sharp edges on cards (no border-radius except pills and bubbles)
- Helvetica/Arial font stack

### Mobile-First Layout
- All interactions designed for 375px width first
- Touch targets minimum 44px
- Bottom sheets for detail panels on mobile
- Side panels on desktop (≥769px)
- Sticky compose bars with safe-area-inset padding for iOS

### Slide Transitions
- 300ms cubic-bezier(0.25, 0.1, 0.25, 1) for page slides
- 150ms ease for hover/press states
- 400ms ease for progress bar fills
- No bouncing, no elastic — clean iOS-style slides

---

## IMPLEMENTATION ORDER

### Phase 1: Council Approvals (full rewrite)
1. CSS classes in ops.html
2. HTML containers (list + detail view + thread view)
3. Rewrite ops-council.js rendering
4. Step completion animations
5. Filter logic + badge counts

### Phase 2: PO Urgency on Today (highest ROI, smallest change)
6. Add PO chase items to ops-today.js renderActionableItems()
7. oneTapChase() function in ops-po-comms.js
8. Reply status dot on Materials cards

### Phase 3: PO Email Polish
9. Messages-style bubbles in renderPOEmailThread()
10. Quick Look overlay for attachments
11. Compose preview wiring
12. Contextual action buttons on cards
