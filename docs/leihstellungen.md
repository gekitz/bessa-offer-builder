# Leihstellungen — Loaner Hardware Inventory

**Status:** PLANNED (design fixed 2026-09-16)
**Scope of v1:** Full loop — device register + barcode stickers + check-out/check-in + Mesonic Leih-Lieferschein + serial recognition on the ticket Lieferschein page.

## Problem

We keep a pool of hardware (Kassen, Sunmi, Küchenmonitore, Orderman, Drucker, …) that
we hand out as *Leihstellungen* (loaners). Today there is no register: we don't reliably
know what is physically in stock vs. out on a loan, who has a given device, how long it's
been out, how often a device has been rented, or whether a device has "earned back" its
purchase cost. This feature makes each physical device a tracked asset with a scannable
barcode sticker, and models the loan lifecycle.

## Core modeling decision: kinds vs. physical units

The existing `products` table describes **kinds** of things (an article, with an
`is_serialized` flag and a `mesonic_artikel_nr` base number). A loaner inventory needs
**individual physical units** — each serial is its own asset with its own cost and history.
So this is two new tables, not a column on `products`. A `loaner_device` references a
`product` for its article identity (name, Mesonic base article, Standort suffix logic).

## Decisions (fixed with Georg)

- **A loan can contain multiple devices.** Header + line-items split (like
  `delivery_notes` → `delivery_note_items`). Devices within a loan can be returned
  individually, so the return date lives on the line, not the header.
- **Deckungsbeitrag = cost-recovery, not billing.** Loans are not invoiced with a rate.
  A device has an `acquisition_cost`; its Deckungsbeitrag is a *utilization / amortization*
  metric (how much of its cost it has "worked off" across its loans), not revenue math.
  Amortized-cost + utilization is enough — the optional per-day `notional_daily_value` €
  figure is **not** surfaced in v1 (kept in the schema for later).
- **Check-out generates one Mesonic Lieferschein per loan** using the **TEXT pseudo-article**
  (Datentyp 3, `artikelnummer: 'TEXT'`) — exactly the freetext path in
  `deliveryNoteToBelegPositions()`. **One TEXT position per device.** No stock decrement
  (it's a loan, not a sale), no billing.
- **Check-in does NOT create a Rücknahme-Lieferschein.** A CRM comment on the customer is
  enough.
- **Every loan requires a Bestandskunde** (a Kdnr). No free-text-customer loans.
- **Full loop in v1.**

## Data model

New feature dir: `src/features/loaners/` (UI strings German: "Leihstellungen"/"Leihgeräte").

### `loaner_devices` — the physical asset register

| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `product_id` | TEXT → products(id) | article identity (name, mesonic base article) |
| `serial_number` | TEXT NOT NULL UNIQUE | → the barcode on the sticker |
| `inventory_no` | TEXT | optional internal asset tag if serial is unreliable |
| `acquisition_cost` | NUMERIC(10,2) | for Deckungsbeitrag amortization |
| `acquired_at` | DATE | |
| `notional_daily_value` | NUMERIC(10,2) NULL | optional; turns utilization into € DB |
| `status` | TEXT CHECK (`available`,`on_loan`,`defective`,`retired`) | derived-but-stored; `on_loan` set/cleared by loan writes |
| `standort` | TEXT (`klagenfurt`/`wolfsberg`) | where it lives when available |
| `note` | TEXT | |
| `active` | BOOLEAN | soft-hide retired devices |
| `created_at` / `updated_at` | TIMESTAMPTZ | `set_updated_at_now()` trigger |

### `loans` — header, one row per rental (a customer handover)

| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `customer_name` | TEXT NOT NULL | snapshot |
| `customer_kdnr` | TEXT NOT NULL | Mesonic Kontonummer — always required (Bestandskunde) |
| `ticket_id` | UUID → tickets(id) NULL | if the loan came from / relates to a ticket |
| `started_at` | DATE NOT NULL | check-out date |
| `expected_return` | DATE NULL | |
| `note` | TEXT | reason / accessories handed out |
| `mesonic_beleg_laufnummer` | INTEGER NULL | idempotency anchor for the Leih-Lieferschein |
| `mesonic_beleg_key` | TEXT NULL | `<konto>-<laufnummer>` |
| `mesonic_beleg_created_at` | TIMESTAMPTZ NULL | |
| `created_by` | UUID → employees(id) | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

### `loan_devices` — line items, one row per device on a loan

| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `loan_id` | UUID → loans(id) ON DELETE CASCADE | |
| `device_id` | UUID → loaner_devices(id) | |
| `returned_at` | DATE NULL | NULL = still out; set on per-device check-in |
| `note` | TEXT | e.g. condition on return |
| `created_at` | TIMESTAMPTZ | |

**Invariant:** a device is on at most one open loan at a time. Enforce with a partial unique
index on `loan_devices(device_id) WHERE returned_at IS NULL`. A `loaner_devices.status` of
`on_loan` ⇔ it has an open `loan_devices` row; set on check-out, cleared when its line is
returned. A loan is "fully returned" (derived) when all its `loan_devices` have `returned_at`.

### Deckungsbeitrag / utilization (derived, no table)

Per device, from its `loan_devices` rows: `loan_count`, `total_days_on_loan` (Σ per line
`returned_at − started_at`, open lines count to today), `days_owned`,
`utilization = days_on_loan / days_owned`, `amortized_cost_per_loan = acquisition_cost / loan_count`.
(`notional_daily_value` € figure kept in schema but not surfaced in v1.) Computed in a
selector; surface on device detail + a fleet summary.

## Migration

`supabase/migrations/2026091700000?_create_loaner_inventory.sql` — the three tables
(`loaner_devices`, `loans`, `loan_devices`), the partial unique index on
`loan_devices(device_id) WHERE returned_at IS NULL`, the `updated_at` triggers, RLS enable +
policies (mirror `20260909120000_create_delivery_notes.sql`). Migrations are immutable once
deployed.

## API layer

`src/features/loaners/api/loanerApi.ts` — mirror `deliveryNoteApi.ts` conventions:
row mappers (snake↔camel), column-list constants, and:

- `listDevices()` / `listDevicesAdmin()` — with computed status + open-loan join
- `getDevice(id)` → `{ device, loanHistory[] }` (its `loan_devices` rows + loan headers)
- `createDevice()` / `updateDevice(id, patch)` / `retireDevice(id)`
- `findDeviceBySerial(serial)` — **the lookup the Lieferschein scan hook calls**; returns
  device + its open loan line (if any)
- `checkOut({ customer, kdnr, ticketId?, expectedReturn, note, deviceIds[] })` → creates the
  loan header + one `loan_devices` line per device, sets each device `on_loan`, then fires the
  Mesonic Leih-Lieferschein export (one Beleg, one TEXT line per device)
- `checkInDevice(loanDeviceId, { returnedAt, note })` → sets the line's `returned_at`, device
  back to `available`, and posts the CRM check-in comment. Optional `checkInLoan(loanId)` to
  return all still-open lines at once.
- `setLoanBelegExport(loanId, laufnummer, key)` — idempotency anchor (on the loan header)
- `listOpenLoans()` — for the fleet "currently out" view

Types in `src/features/loaners/types.ts`.

## Mesonic Leih-Lieferschein

Reuse the existing freetext path. A new pure transform
`src/features/loaners/lib/loanBeleg.ts` — **one TEXT position per device** on the loan:

```
loanToBelegPositions(loan, devices[]) → AngebotPosition[]  // one line per device
  devices.map(device => ({
    artikelnummer: 'TEXT', datentyp: '3', menge: 1, einzelpreis: 0,
    bezeichnung: `Leihstellung: ${device.name} SN ${device.serial_number} — `
               + `Leihbeginn ${started_at}${expected_return ? `, Rückgabe geplant ${expected_return}` : ''}`
  }))
```

Konto = `loan.customer_kdnr`. Belegart 19 (Lieferschein), same envelope/XSD path as
delivery notes (`offers/lib/angebotImport.ts`). Store `laufnummer`/`key` on the loan header
for idempotency. Export is fire-and-forget after the loan commits (loan tracking must not
depend on Mesonic being reachable). Check-in creates **no** Beleg — a CRM comment only.

## Barcode stickers

- **Format: Code128 of the plain serial number.** Fastest for the existing scanner, matches
  what most hardware already carries. No QR (nothing extra to encode).
- Render with `jsbarcode` → SVG/PNG, lay out a label sheet PDF via `@react-pdf/renderer`
  (already a dependency). Sticker shows: device name, Code128(serial), human-readable serial,
  optional inventory_no. Print one sticker (from device detail) or a batch sheet (from the list).

## Customer picker

Check-out needs a Mesonic Kontonummer for the Lieferschein, and **every loan requires a
Bestandskunde** (no free-text customer). Reuse the existing Bestandskunde picker used in
Offers/Tickets (Ansprechpartner/CRM selection) to resolve `customer_name` + `customer_kdnr`;
the picker is a required field on check-out. The same Kdnr is the target for the check-in CRM
comment.

## Scan-on-Lieferschein recognition (the elegant hook)

On the ticket Lieferschein page (`DeliveryNoteDetail.tsx`), when a scanned serial matches
`findDeviceBySerial()`:
- Surface a banner: **"Leihgerät — {status}"** ("verfügbar" / "verliehen an {Kunde} seit {Datum}").
- Offer the matching action inline: if available → **Leihstellung anlegen** (opens check-out
  prefilled with this ticket's customer + ticket_id; the tech can scan more serials to add
  devices to the same loan); if on loan → **Rückgabe** (check-in that device's line). This
  keeps all Mesonic Beleg logic in the loaners feature; the Lieferschein page only recognizes
  + links.

## UI — new "Leihstellungen" tab

1. **Fleet list** — all devices, filter by status/Standort/product; columns: device, serial,
   status, current customer (if out), loan count, utilization. Search + scan-to-find.
2. **Device detail** — asset facts, Deckungsbeitrag/utilization block, full loan history,
   print sticker, check-out/check-in.
3. **Check-out dialog** — required Bestandskunde picker, expected return, note, and a
   **device list built by scanning/adding one or more serials** → creates one loan +
   one Leih-Lieferschein (a TEXT line per device).
4. **Check-in** — from an open loan, return devices **individually or all at once**; each
   returned device flips back to available and posts a CRM comment. No Beleg.
5. **Add device** — product/article picker (reuse catalog lookup), serial (scannable),
   acquisition cost, acquired_at, Standort. Bulk import can come later.

Wire the tab into `TABS` + navigation (no router; state-based like the rest).

## Reused building blocks

| Need | Reuse |
|---|---|
| Barcode scanning | `src/features/tickets/components/BarcodeScanButton.tsx` (verbatim) |
| CRUD + migration shape | `deliveryNoteApi.ts` + `20260909120000_create_delivery_notes.sql` |
| Mesonic freetext Beleg | `deliveryNoteToBelegPositions()` pattern → `loanBeleg.ts` |
| Standort / KL-WO logic | `mesonicArtikelForStandort()` (only if a real article is ever needed) |
| Customer picker | existing Bestandskunde/Ansprechpartner selection |
| PDF rendering | `@react-pdf/renderer` (stickers) |
| Product/article identity | `products` table via catalog loader |

## Phases

1. **DB + API + types** — two tables, migration, `loanerApi.ts`, `types.ts`, tests for the
   status invariant + open-loan uniqueness + Deckungsbeitrag selector.
2. **Leihstellungen tab** — fleet list, add device, device detail (no Mesonic yet).
3. **Check-out / check-in + Deckungsbeitrag** — loan lifecycle, utilization block.
4. **Mesonic Leih-Lieferschein** — `loanBeleg.ts` + export on check-out, idempotency.
5. **Stickers** — Code128 single + batch label PDF.
6. **Lieferschein recognition hook** — `findDeviceBySerial` banner + inline actions on
   `DeliveryNoteDetail`.

Per project convention: high test coverage on the business logic (status transitions, the
one-open-loan-per-device uniqueness, partial-return handling, Deckungsbeitrag math,
`loanToBelegPositions` with multiple devices) rather than manual click-through.

## Resolved (2026-09-16)

- Deckungsbeitrag: amortized-cost + utilization is enough; no € `notional_daily_value` in v1.
- Check-in: no Rücknahme-Lieferschein — a CRM comment on the customer is enough.
- Every loan requires a Bestandskunde (Kdnr).
- A loan can carry multiple devices, returnable individually (header + `loan_devices`).
