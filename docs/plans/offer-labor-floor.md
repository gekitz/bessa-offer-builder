# Plan: Offer labor-hours floor on fulfillment tickets

## Goal

When an offer is accepted, a fulfillment ticket is created. If the offer quoted
"Arbeitszeit" (labor hours), the finished ticket must **never bill fewer labor
hours than the offer quoted**. When the technician logs fewer labor hours than
the offer, we automatically top the billing up to the quoted floor via a
synthetic, self-correcting billing position — on **both** the on-screen billing
preview and the Mesonic Beleg export, so the two can never diverge.

## Decisions (locked)

- **Enforcement = auto top-up** (not block, not warn-only). Add a synthetic
  "Mindest-Arbeitszeit laut Angebot" labor position for the shortfall.
- **Floor is a frozen snapshot** taken at offer-send time, tied to what the
  customer signed. Later edits to the offer/catalog never move a committed floor.
- **What counts as "labor" in the offer:** every counted cart item with
  `kind === 'h'` (Arbeitszeit + any hourly DIENSTLEISTUNGEN). `qty` = hours.
- **What counts as "labor" on the ticket:** `repair_order_entries.work_minutes`
  on entries whose resolved `service_rate.unit === 'hour'`, across **billable,
  non-cancelled** repair orders. Travel/Wegzeit, pauschale services, and
  materials do **not** count toward the floor.
- **Top-up pricing:** shortfall hours × the frozen quoted rate (weighted avg =
  `laborAmount / laborHours` from the snapshot). When the tech logged zero labor,
  the top-up equals exactly the quoted labor €. Default rate €118 if a legacy
  offer has no snapshot breakdown.
- **Comparison scope is ticket-level** (sum across all repair orders), not
  per-repair-order.

## Current state (verified)

- Offer labor lives in `offer_data.cart` as `kind:'h'` products, `qty` = hours;
  the canonical Arbeitszeit product is `b01429e1-672e-44ae-ae79-1d08c4f7f918`
  at €118/h. Hourly items flow into the `once` bucket in
  `src/lib/totals.ts::computeTotals`.
- `offer_data.acceptSnapshot` is frozen at send time by
  `computeAcceptTotals` (`src/lib/acceptTotals.js`), built in
  `OfferBuilderPage.jsx::buildAcceptSnapshot` (called at 4 save/send sites).
  Currently `{ monthly, once, yearly, periodTotal, maxMonths }`.
- Ticket creation trigger: `create_ticket_for_accepted_offer()` (latest def in
  `supabase/migrations/20260714120000_offer_ticket_trigger_security_definer.sql`,
  `SECURITY DEFINER`). Copies only customer data; no line items.
- Ticket billing math is pure in `src/features/tickets/lib/billing.ts`
  (`calcRepairOrderBilling`, `calcTicketBilling`). Types in
  `src/features/tickets/types.ts` (`BillingPosition`, `RepairOrderBilling`,
  `BillingSummary`).
- Two consumers of the math:
  1. On-screen preview — `ticketApi.ts::calculateTicketBilling` →
     `calcTicketBilling` (ticket-level). Rendered by
     `components/TicketBillingPreview.tsx`.
  2. Mesonic export — `ticketApi.ts::loadTicketBelegExport` calls
     `calcRepairOrderBilling` **per repair order** (no ticket-level pass). This
     is the tricky surface for a ticket-level floor.
- `tickets` table (`20260512120000_create_tickets.sql`): has `offer_id`,
  `billable`. `TICKET_COLS` + `rowToTicket` in `ticketApi.ts` (~line 134/378),
  `Ticket`/`TicketInput` types (types.ts ~line 54/87).

## Implementation steps

### 1. Freeze the labor breakdown into the accept snapshot

`src/lib/acceptTotals.js` — extend `computeAcceptTotals` to also return
`laborMinutes` and `laborAmount`:

- Iterate the same counted cart the totals use (reuse `countedIds` semantics so
  option-group alternatives / uncounted add-ons are excluded — mirror
  `computeTotals`; do **not** hand-roll a second counting rule).
- For each counted item with `t === 'h'`: `hours += qty`, and value it with the
  same `price()`/`discountedPrice()` helpers `computeTotals` uses (respect
  `discountQty`, `priceOverride`), so labor € equals the labor share already in
  `once`.
- Return `laborMinutes = round(hours * 60)` and `laborAmount = round2(€)` in
  addition to the existing fields. Existing callers keep working (additive).
- Extend `src/lib/__tests__/acceptTotals.test.js`: a cart with 10h Arbeitszeit →
  `laborMinutes: 600`, `laborAmount: 1180`; a cart with zero hourly items →
  `laborMinutes: 0, laborAmount: 0`; option-group alternative not counted.

> No change needed at the 4 `buildAcceptSnapshot()` call sites — they already
> persist the whole snapshot object.

### 2. Snapshot columns on `tickets` + trigger copies them

New migration `supabase/migrations/<ts>_ticket_offer_labor_floor.sql`
(`<ts>` after the latest existing migration):

- `ALTER TABLE tickets ADD COLUMN offer_labor_minutes INTEGER NOT NULL DEFAULT 0;`
- `ALTER TABLE tickets ADD COLUMN offer_labor_rate NUMERIC(10,2);` (nullable;
  the frozen weighted rate, `NULL` when no labor).
- `ALTER TABLE tickets ADD COLUMN offer_labor_floor_billed_minutes INTEGER NOT NULL DEFAULT 0;`
  — cumulative floor top-up minutes already written to Mesonic Belege for this
  ticket (drives incremental-export correctness in step 5). Not set by the
  trigger; incremented by the export.
- `CREATE OR REPLACE FUNCTION create_ticket_for_accepted_offer()` — same body as
  the current `SECURITY DEFINER` version, but read the frozen breakdown from the
  snapshot JSONB (scalar extraction only, no product join) and **default the
  frozen rate to €118 at the source** so the billing layer never has to guess:
  ```sql
  v_labor_min  := COALESCE((NEW.offer_data #>> '{acceptSnapshot,laborMinutes}')::int, 0);
  v_labor_amt  := (NEW.offer_data #>> '{acceptSnapshot,laborAmount}')::numeric;  -- may be NULL
  v_labor_rate := CASE
                    WHEN v_labor_min > 0
                    THEN round(COALESCE(v_labor_amt, (v_labor_min / 60.0) * 118)
                               / (v_labor_min / 60.0), 2)
                  END;  -- NULL only when there is no labor at all
  ```
  and add `offer_labor_minutes`, `offer_labor_rate` to the INSERT column list +
  VALUES (`v_labor_min`, `v_labor_rate`). Leave
  `offer_labor_floor_billed_minutes` at its DEFAULT 0.
- Keep `SECURITY DEFINER SET search_path = public`. The DEFAULT on the columns
  means already-open tickets are unaffected (floor 0 = no-op). No backfill of
  historical tickets (out of scope; they predate the feature).

### 3. Surface the snapshot on the `Ticket` type + read path

- `types.ts`: add `offerLaborMinutes: number;`, `offerLaborRate: number | null;`
  and `offerLaborFloorBilledMinutes: number;` to `Ticket`.
- `ticketApi.ts`: add `offer_labor_minutes, offer_labor_rate,
  offer_labor_floor_billed_minutes` to the `TICKET_COLS` string (line ~378 —
  **required, else the fields are never fetched**); map them in `rowToTicket`
  (line ~134): `offerLaborMinutes: r.offer_labor_minutes ?? 0`,
  `offerLaborRate: r.offer_labor_rate ?? null`,
  `offerLaborFloorBilledMinutes: r.offer_labor_floor_billed_minutes ?? 0`. No
  `TicketInput` write path needed (set by the trigger / export only).

### 4. Floor logic in the pure billing layer (shared by both consumers)

**Type changes (`types.ts`):**

- Extend the `BillingPosition.kind` union with `'labor_floor'`. A distinct kind
  (not reused `'labor'`) is **required**: the Mesonic export maps `kind:'labor'`
  via the entry's `employeeId` (→ Vertreternummer → work article), which the
  synthetic floor lacks — reusing `'labor'` would throw in the export
  (`repairOrderBeleg.ts:62`). `'labor_floor'` instead maps to the standort
  pseudo-artikel, exactly like `service_flat`/`adjustment` (see step 5).
- Add `laborMinutes: number;` to `RepairOrderBilling` (the real hourly-labor
  minutes behind that order's billing, so the ticket-level pass can sum them
  without re-resolving rates).

**`calcRepairOrderBilling`** — track `laborMinutes`:

- Add `let laborMinutes = 0`; when an entry produces a `kind:'labor'` position
  (the `rate.unit === 'hour'` branch, ~line 103), add `laborMinutes += entry.workMinutes`.
  **Do not** count `travel_wegzeit`, pauschale, or the floor. Return it on the object.

**New exported pure helper (`billing.ts`)** so preview and export apply an
identical floor:

```ts
export interface OfferLaborFloor { minutes: number; rate: number | null; }

// billedLaborMinutes = real hourly labor already billed for the ticket.
// alreadyFlooredMinutes = floor minutes previously committed (0 for the
//   on-screen preview; the ticket's exported-floor tally for Mesonic).
// Returns the synthetic top-up position (or null when the floor is already met).
export function offerLaborFloorPosition(
  billedLaborMinutes: number,
  alreadyFlooredMinutes: number,
  floor: OfferLaborFloor,
  ctx: { repairOrderId: string; repairOrderSeq: number },
): BillingPosition | null
```

- `shortfallMin = floor.minutes - billedLaborMinutes - alreadyFlooredMinutes`;
  return `null` if `floor.minutes <= 0` or `shortfallMin <= 0`.
- `rate = floor.rate ?? 118`; `hours = round2(shortfallMin/60)`;
  `total = round2(hours * rate)`.
- Position: `{ kind:'labor_floor', label:'Mindest-Arbeitszeit laut Angebot',
  quantity: hours, unit:'h', unitPrice: rate, total, repairOrderId,
  repairOrderSeq }` (no `employeeId` — the export bills it against the standort
  pseudo-artikel).

**`calcTicketBilling`** (on-screen preview — `alreadyFlooredMinutes = 0`):

- `billedLaborMinutes` = sum of `laborMinutes` across the per-order billings.
- Pick `ctx` = the latest included repair order (highest `seqNumber`). If the
  ticket has **no** billable repair orders, still emit the position with
  `{ repairOrderId:'', repairOrderSeq:0 }` so a not-yet-worked ticket shows the
  full quoted floor in the preview (informational; nothing exports until a real
  repair order exists — see step 5).
- Call `offerLaborFloorPosition(billedLaborMinutes, 0, { minutes:
  ticket.offerLaborMinutes, rate: ticket.offerLaborRate }, ctx)`.
- If non-null: append to that order's `positions`; add its `total` to that RO's
  `laborTotal`/`subtotal` and to the summary `laborTotal`; recompute
  `subtotalNet`, `vatAmount`, `grandTotalGross` from the adjusted `laborTotal`.
  (When there were no orders, add a synthetic entry to the summary
  `repairOrders[]` carrying just this position so the preview can render it.)

`CalcTicketArgs` already carries `ticket`, so the floor fields flow in for free
once the type has them.

### 5. Mesonic export consistency

The floor is a **ticket-level** invariant but Mesonic Belege are per-repair-order
and **immutable once exported** (each carries a `mesonicBelegKey`). So the floor
must be sized against *cumulative* state and its committed amount tracked on the
ticket (`offer_labor_floor_billed_minutes`, step 2) — a per-batch guardrail alone
silently under-bills when labor is split across exports.

Two touch-points:

**a) `repairOrderBeleg.ts::repairOrderToBelegPositions`** — add a case so the
floor line gets an article without needing an employee:
```ts
case 'labor_floor':
  artikelnummer = pseudo;   // standort pseudo-artikel, like service_flat/adjustment
  break;
```
Update the mapping comment at the top of the file to mention `labor_floor`.

**b) `ticketApi.ts::loadTicketBelegExport`** — it already filters
`exportable = repairOrders.filter(o => o.status !== 'cancelled' && o.billable)`
and builds `orders[]` via per-order `calcRepairOrderBilling`. Apply the floor once
on the **last order of the current batch**, sized cumulatively:

- `billedReal` = `sum(billing.laborMinutes)` over **all** of the ticket's
  exportable orders — both already-exported (they still carry their
  `work_minutes`) and the current batch — so each real labor minute counts once.
- `alreadyFloored` = `ticket.offerLaborFloorBilledMinutes` (floor minutes written
  to prior Belege).
- `floorPos = offerLaborFloorPosition(billedReal, alreadyFloored, { minutes:
  ticket.offerLaborMinutes, rate: ticket.offerLaborRate }, ctxLastNewOrder)` where
  `ctxLastNewOrder` is the last **not-yet-exported** order in the batch (the only
  one that will actually produce a new Beleg).
- If non-null: push into that order's `billing.positions` (bump its
  `laborTotal`/`subtotal`). After the export batch succeeds, increment
  `tickets.offer_labor_floor_billed_minutes` by the floor's minutes
  (`round(hours*60)`) — do this where per-order `mesonicBelegKey`s are persisted
  (`setRepairOrderBelegExport` / `runTicketBelegExport`), in the same success path,
  so a failed export doesn't advance the tally.
- **Edge — no new orders in the batch** (everything already exported): there is no
  Beleg to attach to; skip. This is correct because a fully-exported ticket has
  already had its floor committed on the last real export.
- **Edge — no exportable orders at all**: nothing exports, no floor (the preview
  still shows it informationally per step 4).

This keeps the guarantee under incremental export: total exported labor =
`billedReal + offer_labor_floor_billed_minutes ≥ offer_labor_minutes` after any
export that had room to add the shortfall.

### 6. UI: show the target on the ticket

- In `TicketBillingPreview.tsx` (and/or the ticket header): when
  `ticket.offerLaborMinutes > 0`, render a line like
  `Angebot: {h} h veranschlagt · {erfasst} h erfasst` and, when a floor position
  is present in the summary, make it visually distinct (it already renders as a
  normal labor line via its label). Keep copy German (UI strings only).
- No blocking on close — the close flow (`setTicketStatus`) is unchanged; the
  floor is a pure billing-layer overlay.

### 7. Tests (business logic first — this is the safety net)

- `acceptTotals.test.js` — step 1 cases.
- `billing.test.ts`:
  - floor tops up when `billedLaborMinutes < offerLaborMinutes`
    (0 logged → full quoted labor €; partial logged → shortfall × rate).
  - no-op when billed ≥ floor, and when `offerLaborMinutes === 0`.
  - floor does **not** feed Kassen tier resolution (real hours keep their tier).
  - floor excluded from `travel_wegzeit` labor minutes.
  - ticket with no repair orders still emits the full floor.
  - `offer_labor_rate` null → defaults to €118.
  - summary VAT/gross recomputed correctly with the floor.
- `billingConsistency.test.ts` — extend so the snapshot's `laborAmount` equals
  the labor share the builder shows, and that a fully-unworked ticket bills
  exactly the quoted labor.
- Export (`repairOrderBeleg` / `ticketBelegPlan` level):
  - a `labor_floor` position maps to the standort pseudo-artikel and does **not**
    throw (the bug the review caught).
  - floor emitted exactly once on a full export; totals match the preview.
  - incremental export: given `offer_labor_floor_billed_minutes > 0`, the next
    batch only tops up the remaining shortfall (no double-count, no under-bill).

## Out of scope

- Backfilling `offer_labor_minutes` on tickets created before this migration.
- Copying non-labor offer line items into the ticket.
- Any block/warn UX — auto top-up only.

## File touch list

- `src/lib/acceptTotals.js` (+ `src/lib/__tests__/acceptTotals.test.js`)
- `supabase/migrations/<ts>_ticket_offer_labor_floor.sql` (new — 3 columns +
  trigger `CREATE OR REPLACE`)
- `src/features/tickets/types.ts` (`Ticket` +3 fields; `BillingPosition.kind`
  +`'labor_floor'`; `RepairOrderBilling` +`laborMinutes`)
- `src/features/tickets/api/ticketApi.ts` (`TICKET_COLS`, `rowToTicket`,
  `calculateTicketBilling`, `loadTicketBelegExport`, floor-tally write in the
  export success path)
- `src/features/tickets/lib/billing.ts` (`calcRepairOrderBilling` laborMinutes,
  `offerLaborFloorPosition`, `calcTicketBilling`) + `src/features/tickets/__tests__/billing.test.ts`
- `src/features/tickets/lib/repairOrderBeleg.ts` (`labor_floor` → pseudo-artikel)
- `src/features/tickets/components/TicketBillingPreview.tsx`
- `src/lib/__tests__/billingConsistency.test.ts`
- `src/features/tickets/lib/__tests__/` — export-floor test (repairOrderBeleg /
  ticketBelegPlan level) covering: floor maps to pseudo-artikel (no throw); floor
  emitted once; incremental export sizes against `offer_labor_floor_billed_minutes`.
