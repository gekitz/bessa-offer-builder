# Plan: Auto-post a CRM Aktion (link) for tickets & repair orders

## Goal
Mirror the offer→CRM feature for tickets and repair orders (Reparaturscheine):
post a WinLine CRM Aktion (WebCRM, workflow 10241) containing an **internal
staff deep-link**, **once per ticket** and **once per repair order**, best-effort
(never block the UI). Reuse the offer CRM primitives.

## Decisions (locked)
- **Link = internal staff deep-link**: `https://bessa.kitz.co.at/#/tickets/<ticketId>`.
  Repair orders have no standalone URL → their note links to the parent ticket
  (the Kurzbeschreibung names the Schein).
- **Ticket with no Mesonic Kd.-Nr. → show the resolve dialog** (reuse
  `CustomerResolveDialog`), then post. Repair orders inherit the ticket's Kd.-Nr.;
  if the ticket has none, **skip** the RO note (no separate dialog — the ticket
  flow handles resolution).
- **Timing:** ticket note posts **when the ticket detail is first opened** (covers
  both manually-created and offer-accepted/DB-trigger tickets, which have no create
  UI). Repair-order note posts **on create** (always UI-driven).
- **Once per entity** via new `mesonic_crm_key` columns; **best-effort** (a Mesonic
  hang/outage is caught + logged, never blocks); per-session dismissal so a
  cancelled dialog doesn't nag on every open.

## Confirmed facts (code scan)
- Ticket creation: (A) DB trigger `create_ticket_for_accepted_offer()` (server-side,
  copies `mesonic_customer_id` from the offer, no UI); (B) manual `createTicket()`
  (`ticketApi.ts` ~L427) via `TicketForm.tsx` which has a CustomerPicker that sets
  `mesonicCustomerId`. Returns the Ticket.
- Repair order creation: `createRepairOrder()` (`ticketApi.ts` ~L762) from
  `RepairOrdersTab.tsx` (`handleCreate` ~L87, `handleCreateFromAppointment` ~L109).
  Returns the RepairOrder. ROs have NO customer columns — inherit via parent ticket.
- Internal route: `#/tickets/<id>` (`TicketsPage.tsx` `parseDetailId` ~L60).
- `tickets` has `mesonic_customer_id`, `ticket_number`, `title`; NO `mesonic_crm_key`.
  `repair_orders` has `mesonic_beleg_key` (different!) + `seq_number`; NO `mesonic_crm_key`.
- Reusable: `buildCrmNoteXml` (`src/features/offers/lib/crmNoteImport.ts`),
  `mesonicImport(TYPES.CRM /*34*/, TEMPLATES.CRM /*'WebCRM'*/, xml, {actionCode:1})`,
  and (in `offerCrmNote.ts`) generic `parseCrmKey` + `decideCrmAction`, plus
  `CustomerResolveDialog.tsx`.

## Steps

### 1. Migration
`supabase/migrations/<ts>_ticket_repairorder_crm_key.sql` (ts after newest):
- `ALTER TABLE tickets ADD COLUMN mesonic_crm_key TEXT;`
  + `CREATE INDEX idx_tickets_mesonic_crm_key ON tickets(mesonic_crm_key) WHERE mesonic_crm_key IS NOT NULL;`
- `ALTER TABLE repair_orders ADD COLUMN mesonic_crm_key TEXT;`
  + matching partial index.

### 2. Promote the generic CRM helpers into the shared CRM module
Move `parseCrmKey` and `decideCrmAction` (both entity-agnostic) from
`offerCrmNote.ts` into `src/features/offers/lib/crmNoteImport.ts` (the CRM home).
Keep `offerCrmNote.ts` working by **re-exporting** them (`export { parseCrmKey,
decideCrmAction } from './crmNoteImport'`) so existing imports (OfferBuilderPage,
offer tests) are untouched. Run offer tests to confirm no regression.
- `decideCrmAction(entity: { id?, mesonic_crm_key?, mesonic_customer_id? }, dismissedIds)`
  → `'skip' | 'post' | 'resolve'` (already generic).

### 3. Ticket/RO CRM module — `src/features/tickets/lib/ticketCrmNote.ts` (+ test)
- `TICKET_LINK_BASE = 'https://bessa.kitz.co.at'`; `ticketDeepLink(id)` →
  `${BASE}/#/tickets/${id}`.
- `buildTicketCrmFields(ticket)` → `CrmNoteFields | null` (null if no
  `mesonicCustomerId`): `{ workflowNummer: 10241, zeilennummer: 1,
  kundenkonto: ticket.mesonicCustomerId, kurzbeschreibung: 'Ticket ' +
  ticket.ticketNumber, langbeschreibungIntern: (ticket.title + '\n' +
  ticketDeepLink(ticket.id)) }`.
- `buildRepairOrderCrmFields(ro, ticket)` → null if no ticket Kd.-Nr.:
  `{ …, kurzbeschreibung: 'Reparaturschein ' + ticket.ticketNumber + ' #' +
  ro.seqNumber, langbeschreibungIntern: (perform date/desc + '\n' +
  ticketDeepLink(ticket.id)) }`.
- `postTicketCrmNote(ticket, { importCrm })` and
  `postRepairOrderCrmNote(ro, ticket, { importCrm })` → build fields → if null
  return `{skipped:true}`; else `buildCrmNoteXml` → `importCrm(xml)` →
  `parseCrmKey` → `{ success, key }`. Pure/injected, never throw.

### 4. API — persist keys + expose column
`ticketApi.ts`:
- Add `mesonic_crm_key` to `TICKET_COLS` + map in `rowToTicket`
  (`mesonicCrmKey: r.mesonic_crm_key ?? null`); add `mesonicCrmKey` to the Ticket type.
- Add `mesonic_crm_key` to `REPAIR_ORDER_COLS` + `rowToRepairOrder` +
  RepairOrder type.
- `updateTicketMesonicCrmKey(id, key)` and `updateRepairOrderMesonicCrmKey(id, key)`
  (simple column patches). Reuse existing `updateTicket` for setting
  `mesonicCustomerId` after dialog resolution.

### 5. Wire ticket post — on detail open
In the ticket **detail** component (the one `TicketsPage` renders for
`parseDetailId`), after the ticket loads, run once:
- `const action = decideCrmAction(ticket, dismissedRef.current)`.
- `'post'` → `postTicketCrmNote(ticket, {importCrm})`; on success
  `updateTicketMesonicCrmKey(id,key)` + update local state. Best-effort.
- `'resolve'` → open `CustomerResolveDialog` (prefill from ticket.customerName /
  customer_company). On resolve(kdNr): `updateTicket(id,{mesonicCustomerId:kdNr})`
  → post → persist key. On cancel: add id to `dismissedRef`.
- `'skip'` → nothing. Guard so it runs once per open/ticket (effect keyed on
  ticket id + not already keyed). Never block rendering; run after load.
- `importCrm = (xml) => mesonicImport(TYPES.CRM, TEMPLATES.CRM, xml, {actionCode:1})`.

### 6. Wire repair-order post — on create
In `RepairOrdersTab.tsx` `handleCreate` and `handleCreateFromAppointment`, after
`createRepairOrder(...)` succeeds and BEFORE/after `onChange`:
- If `ticket.mesonicCustomerId` and `!created.mesonicCrmKey`:
  `postRepairOrderCrmNote(created, ticket, {importCrm})` → on success
  `updateRepairOrderMesonicCrmKey(created.id, key)`. Best-effort, non-blocking,
  no dialog (skip if ticket has no Kd.-Nr.).

### 7. Tests (mock Mesonic — no live calls)
- `ticketCrmNote.test.ts`: ticket fields/link/label; RO fields/label; null when no
  Kd.-Nr.; `postTicketCrmNote`/`postRepairOrderCrmNote` happy path + import failure
  (no throw) + parseCrmKey.
- Confirm `decideCrmAction` reused (skip when key set / dismissed; post when Kd.-Nr.;
  resolve when missing).
- Keep offer tests green after the step-2 move (re-export).

## Out of scope / notes
- No edge function — client-side "on open" covers DB-trigger tickets.
- Reuse `CustomerResolveDialog` as-is (already generic: search + pick + create).
- Don't touch the WebCRM contract (done) or the offer flow logic (only the
  helper move with re-export).

## File touch list
- `supabase/migrations/<ts>_ticket_repairorder_crm_key.sql` (new)
- `src/features/offers/lib/crmNoteImport.ts` (add parseCrmKey + decideCrmAction)
- `src/features/offers/lib/offerCrmNote.ts` (re-export the two; drop local copies)
- `src/features/tickets/lib/ticketCrmNote.ts` (new) + test
- `src/features/tickets/api/ticketApi.ts` (cols, rowMappers, update helpers, types)
- `src/features/tickets/types.ts` (Ticket.mesonicCrmKey, RepairOrder.mesonicCrmKey)
- ticket detail component (wire on-open post + resolve dialog + dismissal ref)
- `src/features/tickets/components/RepairOrdersTab.tsx` (wire on-create post)
