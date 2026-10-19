# Signaturtausch Phase A — adversarial plan review

**Reviewer verdict:** approve_with_changes
**Date:** 2026-10-07
**Plan under review:** `docs/signaturtausch-impl-plan.md`
**Scope checked:** migration additivity, vendor default/CHECK, rowToLicense/updateToRow style,
tab rename + /viertl alias, vendor filter wiring in BOTH the Signaturtausch tab and the campaign
enroll segment, missed consumers of ViertlLicense/ViertlFilters, convention violations.

The plan is accurate, well-grounded, and the file/line references match the live code. It is safe to
build essentially as written. The findings below are refinements and two factual corrections to the
plan's own reasoning — none is a design blocker.

---

## Verified correct

- **Migration additivity.** Base table is `supabase/migrations/20260827120000_create_viertl_tracking.sql`.
  `ADD COLUMN IF NOT EXISTS vendor TEXT NOT NULL DEFAULT 'gastrotouch' CHECK (...)` backfills all 341
  existing rows to `gastrotouch` on the ALTER — correct and matches the design doc. `device_model` /
  `source` nullable TEXT; `UPDATE ... SET source='viertl_excel' WHERE source IS NULL` is correct and
  idempotent.
- **Audit function is defined exactly once and never replaced.** `grep` confirms
  `log_viertl_license_change()` + `CREATE OR REPLACE` appear ONLY in the base migration; no later
  migration touches it. So re-emitting the full body with two extra VALUES rows is the only option and
  is safe. The `CREATE TRIGGER trg_viertl_license_audit` binds by function name, so no trigger
  re-create is needed — plan is right.
- **CHECK union == `ViertlVendor` union** (`gastrotouch|sharp|rch|bhs`). In lockstep.
- **Seed INSERT uses an explicit column list** (lines 135–139) that omits `vendor`/`source`, so the
  DEFAULT + backfill reach every seeded row. No seed edit needed. (This is the load-bearing reason the
  341 rows keep working — confirmed.)
- **Edge functions do NOT break on new columns.** `notify-viertl-closure/index.ts` does an explicit
  `.select("id, name, ... closed_reason")` (no `*`); `campaign-outcome/outcomeWriteBack.ts` does a
  narrow `.update({ hardware_needed, updated_by_* })`. Neither reads/writes the new columns, and the
  narrow update won't produce spurious `vendor`/`device_model` audit rows (`IS DISTINCT FROM` sees no
  change). Additive migration is backward-compatible with both.
- **Route alias.** `src/lib/sectionRoute.ts`: `SECTION_TO_PATH.viertl` stays `/viertl` (canonical,
  keeps nav highlight + bookmarks), and adding `'/signaturtausch': 'viertl'` to `PATH_ALIASES` mirrors
  the existing `/gastrotouch` alias exactly. `/viertl` keeps working. Correct.
- **Nav rename.** `src/components/AppShell.jsx:16` is `{ id: 'viertl', label: 'Viertl', icon: KeyRound }`.
  Changing only the label (keeping id `viertl`) is correct and keeps section routing intact.
- **Enroll segment wiring.** `CampaignsPage.tsx` + `rksvEnroll.ts` match the plan's cited structure
  exactly (`segStatus`/`segCustomer` state, `segmentFilter` memo, `STATUS_SEG_OPTIONS`, `EnrollPanel`
  destructure + prop types, filter-row `Select`s). The `segVendor` mirror is well-specified.
  `filterLicensesForSegment` predicate style (`f.x && f.x !== 'all' && ...`) is correctly mirrored.
- **Custom Select used throughout** (`src/components/Select.tsx`). The plan never introduces a native
  `<select>`. The `Select` API the plan uses (`value`/`onChange`/`options`/`className`/`ariaLabel`/
  `disabled`) matches the real component signature.
- **No missed React consumer breaks on widened `ViertlLicense`.** The only external consumers are
  `offerLink.ts` (uses `Pick<ViertlLicense, 'mesonicKdnr' | 'email'>` — unaffected) and
  Tickets/OfferBuilder (pass only `license.id`). Nothing constructs a full `ViertlLicense` literal
  except the two test factories, which the plan already addresses.

---

## Findings (address before/while building)

### MAJOR — the plan's "tests will fail to compile" justification is factually wrong; restate the green-bar criterion

Plan §7b and §7 "Run the whole suite green" assert that widening `ViertlLicense` makes the `lic()`
factory **fail to compile** and that this is why the factory edit is "required."

Reality, verified by running both:
- `npx vitest run` on the two target files: **27/27 pass today.** Vitest transpiles with esbuild and
  does **no type-checking**, so adding required fields to `ViertlLicense` does **not** break `npm test`.
- `npx tsc --noEmit` is **already red on main** — independent of this change. The current `lic()`
  factory **already omits `linkedTicketId`** (a required field on `ViertlLicense`) and errors:
  `rksvEnroll.test.ts(7,3): error TS2322 ... Types of property 'linkedTicketId' are incompatible`.
  There are also many other pre-existing `tsc` errors (OfferView.creator.test, BelegePanel.test,
  mesonicImport.test, offerApi.test).

Why it matters: the plan's success criterion ("keep the whole suite green" via `npm test`) is
satisfiable without the factory edit, and `npm run typecheck` will be red whether or not you do it.
If the reviewer/implementer trusts the plan's reasoning they may (a) skip the factory edit thinking
it's "only needed for compile," or (b) believe typecheck is a gate it is not.

Recommendation: keep the factory edit (good hygiene — the widened fixture should carry
`vendor:'gastrotouch', deviceModel:null, source:null`), but **also add `linkedTicketId:null`** to the
`lic()` factory while you're there (it's a latent bug), and **restate the acceptance bar** as "`npm test`
(vitest) stays green; `tsc` is already red on main and is out of scope." Do not claim the build newly
breaks typecheck.

### MAJOR — adding REQUIRED `vendor`/`deviceModel`/`source` to `ViertlLicense` widens the typecheck debt silently

Because `vendor: ViertlVendor` (and `deviceModel`/`source`) are **non-optional**, every object literal
annotated `ViertlLicense` must now supply them. Today that's only the two test factories (handled), but
it means any future `ViertlLicense` literal — and any `tsc`-based CI you later turn on — must include
them. The `rowToLicense` mapper's `?? 'gastrotouch'` default makes the **runtime** robust, but the
**type** is stricter than the DB guarantees at the API boundary.

Recommendation: proceed with required fields (the design wants vendor to be first-class), but
explicitly note in the plan that the viertlApi.test.ts `listLicenses` default-vendor test (the row that
omits `vendor`) is the regression guard for the `?? 'gastrotouch'` fallback — and that the fallback is
deliberately defensive against a row predating the column. The plan already specifies this test; just
make sure it is not dropped, since it is the only thing protecting the fallback.

### MINOR — detail-panel gating leaves a "Version" column with no owner for non-gastrotouch rows

Plan §4e/§8 keeps the list-table "Version" column showing `gastrotouchVersion ?? '—'` for all vendors
(dash for Sharp/RCH/BHS) and §4g gates only the two detail `<Field>`s. That's internally consistent,
but note the table still advertises a "Version" column header that is meaningless for non-gastrotouch
rows, while `deviceModel` (the vendor-relevant descriptor) is only appended into the Hardware cell. For
Phase A with mostly-gastrotouch data this is acceptable (plan calls it out). Flagging so it is a
conscious choice, not an oversight — consider, in Phase B, relabeling or making the column
vendor-aware. No change required for Phase A.

### MINOR — enroll `licenseToEnrollSubject` correctly left unchanged, but confirm no snapshot needs vendor

Plan §6a states `licenseToEnrollSubject` is unchanged because Type routing is by `hardwareNeeded`, not
vendor. Verified: `EnrollSubject.payload` is `{ knownHardwareNeeded, versionOk? }` and the design doc
confirms `hardware_needed` is the action discriminator. So a Sharp enrol (always `hardware_needed=true`
per design) routes to Type B purely via the existing flag. Correct — no vendor needs to enter the
snapshot in Phase A. (Just ensure the enroll segment's **vendor filter** is what scopes a "Sharp
campaign" to `vendor='sharp'` rows, which §6 does.)

### MINOR — fieldLabel history mapping is additive-only; vendor history values show raw codes

Plan §4h adds `case 'vendor'` / `case 'device_model'` to `fieldLabel` so history rows render a German
label. Correct and additive. The audit row's `old_value`/`new_value` will be the raw code
(`gastrotouch`→`sharp`), which the plan flags as optional polish. Acceptable for Phase A.

### MINOR — migration timestamp is free but double-check at apply time

Latest existing migration is `20261006140000_campaign_public_title.sql`. `20261007120000` is after it
and unused. Per MEMORY `reference_migration_timestamps`, a parallel branch could still claim the same
round slot, so the plan's instruction to `supabase db push --dry-run` before the user applies is the
right guard. (This task does not push — fine.) No action for the build; keep the note for the user.

---

## Convention check

- New migration file / TS types / tests: all TypeScript or SQL as required. OK.
- Custom `Select` used in both the register filter bar and the EnrollPanel; no native `<select>`. OK.
- Test coverage added for the new mapping (viertlApi) and the new predicate (rksvEnroll), matching the
  project's "tests are the only safety net" norm. OK — with the MAJOR caveat that the bar is vitest, not
  tsc.
- `source` excluded from `ViertlLicenseUpdate`/`updateToRow` (provenance, read-only) — matches the
  design doc and the existing pattern (e.g. `email_checked_at` / `linked_*` are also not in the update
  type). OK.

---

## Bottom line

Approve with changes. The migration is correctly additive and will not break the 341 live rows or the
audit trigger; the vendor default + CHECK are right; the mapper/update-row style matches; the tab
rename keeps `/viertl` valid via the `/signaturtausch` alias; the vendor filter is wired in both
surfaces; and no other `ViertlLicense`/`ViertlFilters` consumer breaks. The only substantive issues are
the **two factual corrections to the plan's own reasoning about TypeScript/test-green** (the suite is
vitest-only, `tsc` is already red on main, and `linkedTicketId` is already missing from the `lic()`
factory) — fix the acceptance criterion and the factory while you are in there. Everything else is
minor polish.
