# Signaturtausch register (unify Viertl + Sharp + RCH …)

**Status:** Planned (design fixed 2026-10-07)
**Core idea:** Viertl (Gastrotouch), Sharp, RCH, BHS are the *same entity* — a POS customer who
needs an RKSV action. They differ only by **vendor** and by **required action**, and the required
action is already the existing `hardware_needed` flag. So we **generalize the live Viertl register
in place** rather than build parallel lists.

## Model

`viertl_licenses` becomes the **"Signaturtausch" register**. New columns (additive, backward-compatible):

| column | values | notes |
|---|---|---|
| `vendor` | `gastrotouch` (default) · `sharp` · `rch` · `bhs` | who made the POS |
| `device_model` | "Gastrotouch 67.x", "Sharp XEA217", … | freetext |
| `source` | `viertl_excel`, `sharp_verkaufsstatistik`, … | provenance; existing rows ← `viertl_excel` |

**Reused as-is:** `hardware_needed` IS the action discriminator —
- `false` → **neue Karte** (signature-card swap) → campaign **Type A** (RKSV wizard)
- `true`  → **neues Kassensystem / Hardware** → campaign **Type B** (replacement offer)

Everything else the Viertl feature already has — status pipeline, `viertl_events` audit log,
email backfill, offer linking, campaign enrolment — keeps working for every vendor for free.
Gastrotouch-specific columns (`gastrotouch_version`, `wartung`) simply stay null for other vendors.

Existing 341 rows auto-become `vendor=gastrotouch`, `source=viertl_excel`. Sharp imports come in as
`vendor=sharp`, `hardware_needed=true` (not fiskalizable → always a full replacement). RCH later = same.

## UI

- **Tab "Viertl" → "Signaturtausch"** with a **vendor filter** (Gastrotouch / Sharp / RCH / All) on
  top of the existing status / "Neue HW nötig" filters. Keep the `/viertl` route as an alias.
- Vendor + `device_model` shown as a column; Gastrotouch-only fields render conditionally.
- Campaign **enroll segment** gets the same vendor filter (so a Sharp campaign enrols `vendor=sharp`).

## Campaign routing (existing engine, no new types)

- `hardware_needed=false` → Type A (`rksv_signature`) card wizard.
- `hardware_needed=true` → Type B (`pos_replacement`) special offer / Beratung.

## Phasing

**Phase A — structural generalization (this build).** Migration (widen + backfill existing rows),
types/api (`vendor`/`deviceModel`/`source` + `ViertlVendor` + filters), tab rename + vendor filter,
enroll-segment vendor filter, tests. Backward-compatible; safe to deploy with no data change.

**Phase B — Sharp data + campaign (after inputs below).** Reconcile the final Sharp owner list
(the proven net-quantity + dedupe-across-models + exclude-struck + exclude-leasing logic) into a seed,
import as `vendor=sharp` rows, email-backfill (Mesonic contact + web research), then the Type B campaign.

### Sharp data facts (for Phase B)
- Source: WinLine **Verkaufsstatistik → XLSX**, one per Sharp article (`04000207/0421/3500/3515/100217`;
  `04102171KL` export still pending). No OCR/LIST-API needed for the data.
- 5 files → **399 unique current owners** (returns netted out, 25 own multiple models).
- PDF annotations reconciled by Kontonr: **115 struck (discontinued) · 6 leasing · ~268 mailable**.
- **Open before send:** Huber Toni to confirm **dot vs. checkmark** meaning (may further cut the list);
  resolve the ~77 **leasing**-hidden operators separately (KITZ install records / Lieferadresse / lessee list).
