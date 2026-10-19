# Signaturtausch register — Phase A implementation plan

**Scope:** Phase A ONLY of `docs/signaturtausch-register.md` — generalize the live
Viertl register into a unified "Signaturtausch" register. NO Sharp data import, NO
seed, NO deploy, NO new campaign types. Existing 341 rows keep working
(`vendor` defaults to `gastrotouch`). `/viertl` route stays valid.

All file paths below are absolute to the worktree root
`/Users/georgkitz/.herdr/worktrees/bessa-offer-builder/worktree-clear-cloud-d0ca`.

Grounding: every reference checked against the live code (viertl types/api/page,
AppShell, sectionRoute, CampaignsPage, rksvEnroll, both test files, the create-viertl
migration). Section/line numbers below are from that read.

---

## 0. Decisions on ambiguity (read first)

1. **Migration timestamp.** Latest existing migration is
   `20261006140000_campaign_public_title.sql`. Round `HHMMSS` slots collide across
   parallel branches (bit twice before, per MEMORY `reference_migration_timestamps`).
   **Decision:** use **`20261007120000_signaturtausch_vendor.sql`** (the prompt's
   suggested slot, after the latest and on today's UTC date). Before `db push`, do a
   `supabase db push --dry-run` and bump the timestamp if a collision is reported.
   NOTE: this task does NOT run `db push` (no deploy) — the migration file is written
   but applying it is the user's step.

2. **`CREATE OR REPLACE` of `log_viertl_license_change()` must re-emit the WHOLE body.**
   The function is defined exactly once, in
   `supabase/migrations/20260827120000_create_viertl_tracking.sql:93-116`, and never
   replaced since (grep confirms). So the new migration must reproduce all 9 existing
   `VALUES` rows and ADD two (`vendor`, `device_model`). Partial replace is impossible —
   Postgres has no "add one line to a function". The audit function references no columns
   that don't already exist after our ALTER, so ordering (ALTER before CREATE OR REPLACE)
   is safe.

3. **`vendor` NOT NULL DEFAULT.** New column is `NOT NULL DEFAULT 'gastrotouch'`. On an
   `ADD COLUMN ... DEFAULT`, Postgres backfills every existing row to `gastrotouch`
   automatically — this is exactly the design-doc intent for the 341 rows. `device_model`
   and `source` are plain nullable TEXT. `source` is then backfilled to `'viertl_excel'`
   for existing rows (all rows are NULL right after the ALTER, so a simple
   `WHERE source IS NULL` is correct and idempotent).

4. **CHECK constraint.** `vendor IN ('gastrotouch','sharp','rch','bhs')` matches the
   `ViertlVendor` union in types.ts. Keep them in lockstep.

5. **Filter default = Alle.** Both the register page vendor filter and the enroll vendor
   filter default to `'all'` (show everything) so existing behaviour is unchanged until a
   user actively narrows to a vendor.

6. **Enroll vendor filter uses `'all'` sentinel** (mirrors `segStatus`/`segCustomer`
   which already use `'all'`). The predicate skips filtering when vendor is `undefined`
   or `'all'`, matching the existing `status`/`customerStatus` predicate style in
   `filterLicensesForSegment`.

7. **Page heading.** Current heading is `Viertl / Gastrotouch`
   (`ViertlPage.tsx:312`). **Decision:** rename to `Signaturtausch`. Keep the
   sub-line counts text as-is (it is vendor-neutral). The nav label and heading both
   become "Signaturtausch"; the component/file names (`ViertlPage`, `viertl` id) stay.

8. **Gastrotouch-only fields.** `gastrotouchVersion` and `wartung` render in the detail
   panel unconditionally today. **Decision:** gate BOTH the "Version" field and the
   "Wartung" field on `license.vendor === 'gastrotouch'`. The list-table "Version" column
   (`ViertlPage.tsx:419,452`) shows `gastrotouchVersion ?? '—'`; for non-gastrotouch rows
   that is just `—`, which is acceptable and needs no conditional in the table. Keep it
   simple: only gate the two detail-panel `<Field>`s.

9. **device_model vs hardware_model.** These are DISTINCT columns. `hardware_model` is the
   existing freetext hardware note from the Excel. `device_model` is the new
   vendor-device descriptor ("Sharp XEA217"). Both are shown; `device_model` is added as a
   read/edit field in the detail panel and as inline text in the list row. Do NOT conflate.

---

## 1. Migration — `supabase/migrations/20261007120000_signaturtausch_vendor.sql`

New file. Content (additive, backward-compatible):

```sql
-- ════════════════════════════════════════════════════════════════════
-- Signaturtausch: Viertl-Register auf mehrere Hersteller verallgemeinern
--
-- Phase A von docs/signaturtausch-register.md. Rein additiv:
--   • vendor        — Hersteller des POS (gastrotouch default / sharp / rch / bhs)
--   • device_model  — Freitext-Gerätemodell ("Sharp XEA217")
--   • source        — Herkunft der Zeile (bestehende 341 ← 'viertl_excel')
-- Bestehende Zeilen werden automatisch vendor='gastrotouch' (DEFAULT) und
-- per Backfill source='viertl_excel'. Der Audit-Trigger wird um die zwei
-- neuen getrackten Spalten erweitert (CREATE OR REPLACE, voller Body).
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE viertl_licenses
  ADD COLUMN IF NOT EXISTS vendor TEXT NOT NULL DEFAULT 'gastrotouch'
    CHECK (vendor IN ('gastrotouch','sharp','rch','bhs')),
  ADD COLUMN IF NOT EXISTS device_model TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT;

-- Bestehende Zeilen stammen aus der Viertl-Excel.
UPDATE viertl_licenses SET source = 'viertl_excel' WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS idx_viertl_licenses_vendor ON viertl_licenses(vendor);

-- Audit-Trigger erweitern: auch vendor + device_model protokollieren.
-- Voller Funktionskörper (CREATE OR REPLACE ersetzt die Definition aus
-- 20260827120000_create_viertl_tracking.sql komplett).
CREATE OR REPLACE FUNCTION log_viertl_license_change() RETURNS TRIGGER AS $$
DECLARE
  fld TEXT; oldv TEXT; newv TEXT;
BEGIN
  FOR fld, oldv, newv IN
    SELECT t.f, t.o, t.n FROM (VALUES
      ('status',              OLD.status,                  NEW.status),
      ('customer_status',     OLD.customer_status,         NEW.customer_status),
      ('wartung',             OLD.wartung,                 NEW.wartung),
      ('gastrotouch_version', OLD.gastrotouch_version,     NEW.gastrotouch_version),
      ('hardware_model',      OLD.hardware_model,          NEW.hardware_model),
      ('hardware_needed',     OLD.hardware_needed::text,   NEW.hardware_needed::text),
      ('email',               OLD.email,                   NEW.email),
      ('closed_reason',       OLD.closed_reason,           NEW.closed_reason),
      ('notes',               OLD.notes,                   NEW.notes),
      ('vendor',              OLD.vendor,                  NEW.vendor),
      ('device_model',        OLD.device_model,            NEW.device_model)
    ) AS t(f,o,n)
    WHERE t.o IS DISTINCT FROM t.n
  LOOP
    INSERT INTO viertl_events (license_id, type, field, old_value, new_value, actor_id, actor_name)
    VALUES (NEW.id, 'field_change', fld, oldv, newv, NEW.updated_by_id, NEW.updated_by_name);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

The existing `CREATE TRIGGER trg_viertl_license_audit` already binds to this function
name, so replacing the function body is enough — no trigger re-create needed.

**Verify after writing (no deploy):** `supabase db push --dry-run` to confirm SQL parses
and timestamp doesn't collide. Do NOT actually push.

---

## 2. Types — `src/features/viertl/types.ts`

a. Add the vendor union (after `ViertlCustomerStatus`, ~line 20):

```ts
// Hersteller des POS-Systems. gastrotouch = die bisherige Viertl-Welt.
export type ViertlVendor = 'gastrotouch' | 'sharp' | 'rch' | 'bhs';
```

b. In `interface ViertlLicense` (lines 32-56) add three fields. Place `vendor`,
   `deviceModel`, `source` near the top (after `ort`/`email` block is fine; grouped
   together for clarity):

```ts
  vendor: ViertlVendor;
  deviceModel: string | null;
  source: string | null;
```

c. In `interface ViertlLicenseUpdate` (lines 73-83) add the two editable ones
   (`source` is provenance, not user-edited → NOT in the update type):

```ts
  vendor?: ViertlVendor;
  deviceModel?: string | null;
```

d. In `interface ViertlFilters` (lines 91-96) add:

```ts
  vendor?: ViertlVendor | 'all';
```

NOTE: `ViertlFilters` is currently declared but not imported anywhere (ViertlPage uses
inline `useState` hooks, not this type). Adding `vendor?` keeps the type honest for
future use and matches the prompt. No consumer breaks.

---

## 3. API — `src/features/viertl/api/viertlApi.ts`

a. `rowToLicense(r)` (lines 26-52) — add three mappings. Put them next to the existing
   fields:

```ts
    vendor: r.vendor ?? 'gastrotouch',
    deviceModel: r.device_model ?? null,
    source: r.source ?? null,
```

   The `?? 'gastrotouch'` default keeps the mapper robust even if a row somehow predates
   the column (defensive; the DB default already guarantees non-null).

b. `updateToRow(patch)` (lines 72-87) — add two snake_case mappings (NOT `source`):

```ts
  if (patch.vendor !== undefined) row.vendor = patch.vendor;
  if (patch.deviceModel !== undefined) row.device_model = patch.deviceModel;
```

c. **Vendor filter application.** `listLicenses()` (lines 93-101) currently takes no
   args and does `.select('*').order('name')`. `ViertlFilters` is consumed by the UI
   layer (ViertlPage filters client-side in `useMemo`), NOT by the API. The prompt says
   "apply the vendor filter where ViertlFilters is consumed (listLicenses or wherever
   filtering happens)".

   **Decision:** keep filtering **client-side in ViertlPage** (consistent with the
   existing status/customer/hwOnly/noEmail filters which are all client-side `useMemo`).
   Do NOT add a server-side vendor `.eq()` — that would split filtering across two layers
   and break the established pattern. So no change to `listLicenses` signature. The
   `ViertlFilters.vendor` field documents the filter dimension; the actual predicate lives
   in ViertlPage's `filtered` memo (§4b). This matches how `status`/`customerStatus`
   already work (they are `ViertlFilters` fields too, applied client-side).

   (If a reviewer insists on API-level filtering, the alternative is
   `listLicenses(f?: ViertlFilters)` with optional `.eq('vendor', f.vendor)` when
   `f?.vendor && f.vendor !== 'all'` — but that is inconsistent with the other filters and
   is NOT recommended.)

---

## 4. Register page — `src/features/viertl/pages/ViertlPage.tsx`

a. **Imports / vendor meta.** Add `ViertlVendor` to the type import block (lines 10-17).
   Add a vendor label map + options near the other `*_META` / `*_OPTIONS` constants
   (after `WARTUNG_OPTIONS`, ~line 50):

```ts
const VENDOR_LABEL: Record<ViertlVendor, string> = {
  gastrotouch: 'Gastrotouch',
  sharp: 'Sharp',
  rch: 'RCH',
  bhs: 'BHS',
};
const VENDOR_OPTIONS = (['gastrotouch', 'sharp', 'rch', 'bhs'] as ViertlVendor[])
  .map((v) => ({ value: v, label: VENDOR_LABEL[v] }));
```

b. **State + filter predicate.** Add state next to `statusFilter` (line 150):

```ts
const [vendorFilter, setVendorFilter] = useState<ViertlVendor | 'all'>('all');
```

   In the `filtered` memo (lines 174-187) add, as the first predicate:

```ts
      if (vendorFilter !== 'all' && l.vendor !== vendorFilter) return false;
```

   Add `vendorFilter` to the memo dep array (line 187).

c. **Heading rename.** `ViertlPage.tsx:312`
   `<h1 ...>Viertl / Gastrotouch</h1>` → `<h1 ...>Signaturtausch</h1>`.

d. **Vendor filter control** (custom `Select`, NEVER native). In the filter bar
   (lines 358-399), insert a vendor `Select` BEFORE the status `Select` (line 368) so
   vendor sits at the top of the filter row per the design doc:

```tsx
        <Select
          value={vendorFilter}
          onChange={(v) => setVendorFilter(v as ViertlVendor | 'all')}
          options={[{ value: 'all', label: 'Alle Hersteller' }, ...VENDOR_OPTIONS]}
          className="inline-block min-w-[150px]"
          ariaLabel="Hersteller filtern"
        />
```

e. **Vendor + device_model in the list row.** In the "Kunde" cell sub-line
   (lines 447-449) today shows `{contact} · Kd. {kdnr}`. Add a small vendor badge next to
   the name (line 435 area) for non-gastrotouch rows, and show `deviceModel` in the
   Hardware cell. Concretely:

   - In the name flex row (after the customerStatus badge, ~line 440) add:
     ```tsx
     {l.vendor !== 'gastrotouch' && (
       <span className="inline-block px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
         {VENDOR_LABEL[l.vendor]}
       </span>
     )}
     ```
   - In the Hardware `<td>` (lines 454-461), append `deviceModel` to the existing
     `hardwareModel` text, e.g. change the trailing span to show
     `{[l.deviceModel, l.hardwareModel].filter(Boolean).join(' · ')}`.

f. **Detail panel — vendor + device_model fields.** In `LicenseDetail` (the
   `<div className="p-4 space-y-4">` block, after "Status"/"Kundenstatus", ~line 717),
   add a Vendor `Select` and a Gerätemodell input:

```tsx
          <Field label="Hersteller">
            <Select
              value={license.vendor}
              onChange={(v) => void patch({ vendor: v as ViertlVendor })}
              options={VENDOR_OPTIONS}
              disabled={busy}
            />
          </Field>
          <Field label="Gerätemodell">
            <BlurInput value={license.deviceModel ?? ''} disabled={busy}
              onCommit={(v) => void patch({ deviceModel: v || null })} />
          </Field>
```

g. **Gate Gastrotouch-only fields.** Wrap the existing "Version" `<Field>`
   (lines 757-759) AND the "Wartung" `<Field>` (lines 737-739) in
   `{license.vendor === 'gastrotouch' && ( … )}`.

h. **fieldLabel** (lines 104-117) — add cases so the history renders the new audit rows:

```ts
    case 'vendor': return 'Hersteller';
    case 'device_model': return 'Gerätemodell';
```

   (Optional polish: map vendor code→label in history values; not required.)

---

## 5. Nav + routing

a. **`src/components/AppShell.jsx:16`** — rename label only, KEEP id:
   `{ id: 'viertl', label: 'Viertl', icon: KeyRound }` →
   `{ id: 'viertl', label: 'Signaturtausch', icon: KeyRound }`.

b. **`src/lib/sectionRoute.ts`** — add a `/signaturtausch` alias, KEEP `/viertl` and
   `/gastrotouch`. In `PATH_ALIASES` (lines 30-55), after the `'/viertl'`/`'/gastrotouch'`
   entries (lines 42-43) add:

```ts
  '/signaturtausch': 'viertl',
```

   `SECTION_TO_PATH[viertl]` (line 23) stays `/viertl` — the canonical path is unchanged,
   so existing links/bookmarks and the nav's active-highlight keep working;
   `/signaturtausch` is an inbound alias only (same pattern as `/gastrotouch`, `/orders`).

---

## 6. Campaign enroll vendor filter

Two files: `rksvEnroll.ts` (pure logic) and `CampaignsPage.tsx` (state + UI).

### 6a. `src/features/campaigns/lib/rksvEnroll.ts`

- Import `ViertlVendor` into the existing type import (line 17):
  `import type { ViertlCustomerStatus, ViertlLicense, ViertlStatus, ViertlVendor } from '../../viertl/types';`

- Add `vendor?` to `ViertlSegmentFilter` (lines 33-39):

```ts
  vendor?: ViertlVendor | 'all';   // 'all'/undefined ⇒ alle Hersteller
```

- Add the predicate in `filterLicensesForSegment` (lines 43-59), mirroring the
  `status`/`customerStatus` style (`&& f.x !== 'all'`), as the first predicate:

```ts
    if (f.vendor && f.vendor !== 'all' && l.vendor !== f.vendor) return false;
```

`licenseToEnrollSubject` is unchanged (vendor does not affect the snapshot — Type routing
is by `hardwareNeeded`, per the design doc).

### 6b. `src/features/campaigns/pages/CampaignsPage.tsx`

- Import `ViertlVendor` into the type import (line 20):
  `import type { ViertlCustomerStatus, ViertlLicense, ViertlStatus, ViertlVendor } from '../../viertl/types';`

- Add `segVendor` state next to `segStatus` (line 91):

```ts
  const [segVendor, setSegVendor] = useState<ViertlVendor | 'all'>('all');
```

- Add `vendor` to the `segmentFilter` memo (lines 99-105) and its dep array:

```ts
  const segmentFilter = useMemo<ViertlSegmentFilter>(() => ({
    search: segSearch,
    vendor: segVendor,
    status: segStatus,
    customerStatus: segCustomer,
    hardwareNeeded: segHwOnly,
    withEmailOnly: segWithEmail,
  }), [segSearch, segVendor, segStatus, segCustomer, segHwOnly, segWithEmail]);
```

- Add a `VENDOR_SEG_OPTIONS` constant next to `STATUS_SEG_OPTIONS`/`CUSTOMER_SEG_OPTIONS`
  (after line 714):

```ts
const VENDOR_SEG_OPTIONS: { value: ViertlVendor | 'all'; label: string }[] = [
  { value: 'all', label: 'Alle Hersteller' },
  { value: 'gastrotouch', label: 'Gastrotouch' },
  { value: 'sharp', label: 'Sharp' },
  { value: 'rch', label: 'RCH' },
  { value: 'bhs', label: 'BHS' },
];
```

- Pass `segVendor`/`setSegVendor` into `<EnrollPanel>` (lines 501-514, add next to the
  `segStatus` props):

```tsx
                segVendor={segVendor} setSegVendor={setSegVendor}
```

- Extend `EnrollPanel`'s destructure (lines 718-744) and prop types to accept
  `segVendor: ViertlVendor | 'all'; setSegVendor: (v: ViertlVendor | 'all') => void;`.

- In `EnrollPanel`'s filter row (lines 758-799), add a vendor `Select` BEFORE the status
  `Select` (line 768):

```tsx
            <Select
              value={segVendor}
              onChange={(v) => setSegVendor(v as ViertlVendor | 'all')}
              options={VENDOR_SEG_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              className="inline-block min-w-[150px]"
              ariaLabel="Hersteller"
            />
```

Mirrors exactly how `segStatus` (with `STATUS_SEG_OPTIONS`) was wired.

---

## 7. Tests

### 7a. `src/features/viertl/api/__tests__/viertlApi.test.ts`

- **Extend `listLicenses` mapping test** (lines 46-72): add
  `vendor: 'sharp', device_model: 'Sharp XEA217', source: 'sharp_verkaufsstatistik'` to
  the mocked row, and assert `toMatchObject({ vendor: 'sharp', deviceModel: 'Sharp XEA217', source: 'sharp_verkaufsstatistik' })`.

- **Add a default-vendor test**: a row WITHOUT `vendor` maps to `vendor: 'gastrotouch'`
  and `deviceModel: null, source: null` (covers the `?? 'gastrotouch'` fallback).

- **Extend `updateLicense` mapping**: add a test (or extend the existing null-free-text
  test, lines 107-113) asserting `updateLicense('l1', { vendor: 'sharp', deviceModel: 'X' })`
  produces `payload.vendor === 'sharp'` and `payload.device_model === 'X'`; and that
  `source` is NEVER written (`expect(payload).not.toHaveProperty('source')`).

### 7b. `src/features/campaigns/lib/__tests__/rksvEnroll.test.ts`

- Add `vendor: 'gastrotouch'`, `deviceModel: null`, `source: null` to the `lic()` factory
  defaults (lines 6-32) so the typed object satisfies the widened `ViertlLicense`.
  (TypeScript will otherwise fail to compile the test — this is a required edit, not just
  coverage.)

- Add a `describe('filterLicensesForSegment — vendor')` block (or cases in the existing
  block, lines 69-132):
  - fixture with mixed vendors, e.g.
    `[lic({id:'1',vendor:'gastrotouch'}), lic({id:'2',vendor:'sharp'}), lic({id:'3',vendor:'rch'})]`
  - `{ vendor: 'sharp' }` → `['2']`
  - `{ vendor: 'all' }` → all three
  - `{}` (absent) → all three
  - combine: `{ vendor: 'sharp', customerStatus: 'active' }` drops a closed sharp row.

### 7c. ViertlPage

No component test exists for ViertlPage today (grep shows no
`ViertlPage.test`). **Decision:** do NOT add one in Phase A — the filter/predicate logic
being added to ViertlPage duplicates `filterLicensesForSegment`, which IS unit-tested via
rksvEnroll. Adding a full RTL harness for one new Select is disproportionate. (If desired
later, a focused test could assert the vendor memo predicate; flagged, not blocking.)

### Run the whole suite green

```
npm test
```

(Or the project's vitest invocation.) Expected: both edited test files pass plus the rest
of the suite unaffected. The `lic()` factory widening in 7b is the only change that would
otherwise break existing campaign tests at compile time.

---

## 8. File change list (summary)

Modified / created:
1. `supabase/migrations/20261007120000_signaturtausch_vendor.sql` — NEW
2. `src/features/viertl/types.ts` — `ViertlVendor`, +3 license fields, +2 update fields, +1 filter field
3. `src/features/viertl/api/viertlApi.ts` — `rowToLicense` +3 maps, `updateToRow` +2 maps
4. `src/features/viertl/pages/ViertlPage.tsx` — heading rename, vendor meta/options, vendorFilter state+predicate, vendor Select, vendor badge + deviceModel in row, detail-panel vendor Select + Gerätemodell field, gate Version/Wartung on gastrotouch, fieldLabel cases
5. `src/components/AppShell.jsx` — nav label "Viertl" → "Signaturtausch" (id stays `viertl`)
6. `src/lib/sectionRoute.ts` — add `/signaturtausch` alias → `viertl`
7. `src/features/campaigns/lib/rksvEnroll.ts` — `ViertlSegmentFilter.vendor` + predicate
8. `src/features/campaigns/pages/CampaignsPage.tsx` — `segVendor` state, segmentFilter wiring, `VENDOR_SEG_OPTIONS`, EnrollPanel vendor Select
9. `src/features/viertl/api/__tests__/viertlApi.test.ts` — mapping tests
10. `src/features/campaigns/lib/__tests__/rksvEnroll.test.ts` — `lic()` factory widening + vendor filter tests

Out of scope (Phase B, do NOT touch): Sharp seed/import, email backfill for sharp,
Type B campaign, any `db push`/deploy.

---

## 9. Open questions / flags

- **F1 (resolved by decision §3-§0.7):** page heading wording confirmed as
  "Signaturtausch" (dropping "/ Gastrotouch").
- **F2 (resolved §3c):** vendor filtering stays client-side; `listLicenses` signature
  unchanged. Deviating would break the established single-layer filter pattern.
- **F3:** `source` is read-only in the app (set by migration/import only); deliberately
  excluded from `ViertlLicenseUpdate` and `updateToRow`. Confirm this is acceptable (it is,
  per the design doc — `source` is provenance).
- **F4:** migration timestamp `20261007120000` must be dry-run-checked for collision with
  any parallel branch before the user applies it (MEMORY `reference_migration_timestamps`).
