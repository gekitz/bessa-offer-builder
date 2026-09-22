# Outreach Campaigns — Fix Plan (M1 / M2 / M3)

**Source review:** `docs/outreach-campaigns-code-review.md`
**Design:** `docs/outreach-campaigns.md`
**Scope:** Type A (`rksv_signature`) only. Do **not** touch Type B (`pos_replacement`).
**Baseline:** 1561 tests pass, build passes on `worktree/clear-cloud-d0ca`.

This plan fixes the three "Major" findings:

- **M1** — no create-campaign / enroll-recipients UI; the `payload` snapshot the wizard depends on is never written.
- **M2** — the public/anon landing page performs privileged Viertl write-backs via the anon client.
- **M3** — terminal outcome recording is non-idempotent → duplicate `viertl_events` notes on re-submit.

The unifying decision: **M2 moves the terminal write-back into a new public edge fn `campaign-outcome`, and M3's idempotency guard lives inside that same edge fn.** M1 is a pure client-side (CampaignsPage) addition plus a small refactor of the version-parse helper.

---

## Grounding — current signatures (verified in code)

- `campaignApi.ts`
  - `createCampaign(input: { type; key; title; emailSubject?; emailTemplate? }, actor: CampaignActor): Promise<Campaign>` — already exists, no caller.
  - `enrollRecipients(campaignId, subjects: Array<{ subjectType; subjectId; name; email; batch; payload? }>): Promise<{ enrolled; skipped }>` — already exists, tested, **no caller**. Note `payload?` per-subject already flows into the upserted row (line 162).
  - `recordOutcome(token, outcome, patch?)` — anon client update; **no idempotency guard** (M3). Called only by `rksvHandler.ts`.
  - `getRecipientByToken`, `markLanded`, `saveRecipientPayload` — anon reads/writes by token.
- `rksvWizard.ts`
  - `nextStep(known: RksvKnown, answers): RksvStep` — pure.
  - `parseVersion(raw): number | null`, `versionOk(raw): boolean | undefined`, `VERSION_THRESHOLD = 67.25` — pure, exported. **These are the exact functions the enroll snapshot must reuse** (finding M1 requires "SAME parse logic").
- `rksvHandler.ts` (client, anon) — `authorize` / `requestQuote` / `softCheck`. Each calls `recordOutcome(...)` then `addNote`/`updateLicense` from `viertlApi.ts` via the **anon client** (M2).
- `viertlApi.ts` — `listLicenses(): Promise<ViertlLicense[]>`, `updateLicense(id, patch, actor)`, `addNote(licenseId, message, actor)`. `ViertlLicense` has `id`, `name`, `email`, `contact`, `hardwareNeeded: boolean`, `gastrotouchVersion: string | null`, `mesonicKdnr`, etc.
- `RksvPayload` (types.ts) already declares `knownHardwareNeeded?: boolean` and `versionOk?: boolean` — the snapshot keys. No type change needed.
- `CampaignsPage.tsx` uses `useAuth()` → `actor`, custom `Select`, and already imports from `campaignApi`.
- `CampaignLandingPage.tsx` → `RksvWizard.tsx` calls the client handler on terminal steps.
- Migration `20260915120000_create_campaigns.sql`; permissive RLS `FOR ALL USING(true)` on both tables.
- `config.toml` pattern: `notify-offer-accepted` / `resend-webhook` / `stripe-webhook` are `verify_jwt=false`; `send-campaign` is `verify_jwt=true`.
- Edge-fn service-role + Viertl write-back precedent: `notify-viertl-closure/index.ts` (loads license by id with the **service-role** admin client, inserts `viertl_events` with service role "→ RLS egal").
- `resend-webhook/campaignAttribution.ts` — precedent for a pure, unit-tested edge-fn helper with a minimal `AttributionClient` interface (there is **no** Deno edge-fn test harness in the repo; pure helpers are extracted and tested with a mock client).

---

## Shared refactor (needed by M1 and M2): version-parse helper

Finding M1 requires the enroll snapshot to compute `versionOk` "using the SAME parse logic as `rksvWizard.ts`", and M2's edge fn will (optionally) recompute nothing but must stay consistent. `parseVersion` / `versionOk` / `VERSION_THRESHOLD` currently live **inside `rksvWizard.ts`**, which imports nothing but is conceptually the wizard's branch module. They are already pure and exported.

**Decision:** extract the version helpers into a tiny shared module so both the browser enroll path (M1) and any Deno-side reuse import them from a neutral spot, and `rksvWizard.ts` re-exports them for backward compatibility (keeps `rksvWizard.test.ts` green with zero edits).

- **New file** `src/features/campaigns/lib/rksvVersion.ts`:
  - `export const VERSION_THRESHOLD = 67.25;`
  - `export function parseVersion(raw: string | null | undefined): number | null` (verbatim move).
  - `export function versionOk(raw: string | null | undefined): boolean | undefined` (verbatim move).
- **Edit** `rksvWizard.ts`: delete the three definitions; add `export { VERSION_THRESHOLD, parseVersion, versionOk } from './rksvVersion';` and `import { VERSION_THRESHOLD } from './rksvVersion';` where `nextStep` needs nothing (it doesn't use the threshold directly — verify: `nextStep` uses only `known.versionOk`, so no internal import is even required; only the re-export matters).
  - **Ambiguity/decision:** `rksvWizard.test.ts` imports `parseVersion`/`versionOk`/`VERSION_THRESHOLD` from `../rksvWizard`. The re-export keeps that import path valid, so **the existing 18 wizard tests need no change**. This is the reason to re-export rather than force test-file edits.

**Why not put it in `_shared/`?** The Deno edge fn (`campaign-outcome`, M2) does **not** need to recompute `versionOk` — the snapshot is authoritative and already stored in `payload` at enroll time (browser side). The edge fn only records the outcome + writes back a fixed note/flag. So the version helper stays a browser-side (`src/`) module; no Deno duplication is introduced. (If a future pre-classification batch (Phase 6) runs server-side, it can duplicate the ~6-line helper into `_shared/` then — out of scope here.)

---

## M1 — Create-campaign + Enroll-recipients UI (CampaignsPage)

### Goal
From the Kampagnen back-office an operator can (a) create a `rksv_signature` campaign, and (b) enroll recipients from the Viertl license segment, **snapshotting `payload.knownHardwareNeeded` and `payload.versionOk` per recipient at enroll time** so the wizard's "only ask what we can't compute" path fires.

### Where the code goes
All UI lives in `src/features/campaigns/pages/CampaignsPage.tsx` plus one small extracted helper module (pure, unit-tested) and a data read from `viertlApi.listLicenses`.

### New pure helper — `src/features/campaigns/lib/rksvEnroll.ts`
This is the load-bearing, testable core (keeps CampaignsPage thin and lets us unit-test the snapshot logic directly, per the repo's "pure logic unit-tested" mandate).

```
import { versionOk } from './rksvVersion';
import type { ViertlLicense } from '../../viertl/types';

export interface EnrollSubject {   // shape enrollRecipients() consumes
  subjectType: 'viertl_license';
  subjectId: string;
  name: string | null;
  email: string | null;
  batch: string;
  payload: { knownHardwareNeeded: boolean; versionOk?: boolean };
}

// Filter shape reused from Viertl (subset of ViertlFilters — see decision below).
export interface ViertlSegmentFilter {
  search?: string;
  status?: ViertlStatus | 'all';
  customerStatus?: ViertlCustomerStatus | 'all';
  hardwareNeeded?: boolean;   // true ⇒ only hardwareNeeded licenses
  withEmailOnly?: boolean;    // optional convenience
}

export function filterLicensesForSegment(
  licenses: ViertlLicense[],
  f: ViertlSegmentFilter,
): ViertlLicense[]   // mirrors ViertlPage's `filtered` useMemo predicate

export function licenseToEnrollSubject(l: ViertlLicense, batch: string): EnrollSubject {
  return {
    subjectType: 'viertl_license',
    subjectId: l.id,                                   // license UUID = write-back key
    name: l.name,
    email: l.email,
    batch,
    payload: {
      knownHardwareNeeded: l.hardwareNeeded,           // boolean column, never null
      versionOk: versionOk(l.gastrotouchVersion),      // SAME parse as the wizard; undefined = unknown
    },
  };
}
```

**Exact snapshot semantics (the crux of M1):**
- `knownHardwareNeeded` = `license.hardwareNeeded` (the boolean column; `false` is the un-triaged default — the wizard already treats `false` correctly: it does **not** take the zero-question fast path on `false` alone, only on `false && versionOk===true`, per `nextStep`).
- `versionOk` = `versionOk(license.gastrotouchVersion)`:
  - parseable version `>= 67.25` → `true`
  - parseable `< 67.25` → `false`
  - null / junk version → `undefined` — **must be omitted or left undefined in the payload**, never coerced to `false`, so the wizard sees "unknown" and asks the Win10 question. (JSON drops `undefined`; storing `{ knownHardwareNeeded: x }` without a `versionOk` key is the correct representation of "unknown". Confirm the enroll subject does not stamp `versionOk: false` for unknown.)

This exactly satisfies the wizard's `RksvKnown = { hardwareNeeded?, versionOk? }` contract read in `RksvWizard.tsx` (`{ hardwareNeeded: p.knownHardwareNeeded, versionOk: p.versionOk }`).

### CampaignsPage state + UI additions
Add, alongside the existing back-office (guarded so it doesn't disturb the existing list/funnel/send flow):

1. **"Neue Kampagne" affordance** — a button in the header (next to Druckliste/Welle senden) and also surfaced in the empty state (replacing the "über eine Migration" text). Opens an inline panel / lightweight modal (follow ViertlPage's inline-panel style; no new modal lib).

2. **Create-campaign form state:**
   - `type` — fixed to `'rksv_signature'` for now via a custom `Select` with a single option (Type B intentionally excluded from enroll in this scope). **Decision:** render the Select (not a hidden constant) so Type B can be added later without a structural change, but only offer `rksv_signature`.
   - `key` (text, required, unique — e.g. `2026-acos`), `title` (text, required), `emailSubject` (text), `emailTemplate` (textarea — inline HTML body, `{name}` interpolation as the send fn expects).
   - Submit → `createCampaign({ type, key, title, emailSubject, emailTemplate }, actor)`; on success set `campaignId` to the new campaign and reload the list. Surface unique-key violations via the existing `error` banner.

3. **Enroll-from-Viertl panel** (enabled once a campaign is selected, for `campaign.type === 'rksv_signature'`):
   - On open, `await listLicenses()` (from `viertlApi`), store in local `licenses` state.
   - **Segment filter UI** reusing the Viertl filter *shape*: a `search` text input, `Select` for `customerStatus` (default `active` — you don't enroll closed customers), a `hardwareNeeded`-only pill, and a `withEmailOnly` pill. Compute the live segment with `filterLicensesForSegment(licenses, filter)` and show a **count** ("Segment: N Lizenzen · M ohne E-Mail").
     - **Decision on "reuse ViertlFilters where sensible":** we reuse the filter *predicate logic* by extracting it into `filterLicensesForSegment` (mirrors ViertlPage's `filtered` useMemo) and reuse the `ViertlStatus`/`ViertlCustomerStatus` option lists, but we do **not** import ViertlPage's JSX (it's page-scoped and coupled to its own state). This keeps the reuse at the logic layer, which is also what gets unit-tested.
   - **Batch label** input (default `new Date().toISOString().slice(0,10)`), matching the send fn's wave convention.
   - **Enroll button** → build subjects via `licenseToEnrollSubject(l, batch)` for each license in the current segment, then `enrollRecipients(campaignId, subjects)`.
     - Show a confirm dialog first: "Enrolle N Empfänger (überspringe bereits enrollte via Idempotenz)". After the call, flash `Enrolled: {enrolled.length} · übersprungen: {skipped}` (uses the existing `flash`), then `reload()` to refresh funnel + list.
     - Idempotency is already handled by `enrollRecipients` (upsert `ignoreDuplicates` on `(campaign_id, subject_type, subject_id)`), so re-enrolling a grown segment only adds the new licenses. **Note m1 from the review** (skipped-count depends on PostgREST returning only inserted rows) — call this out in a code comment; behavior already has repo precedent (`belegeApi.ts`).

4. **No-email handling:** licenses with `email === null` are still enrolled (so they appear in the funnel's "Ohne E-Mail" count and the existing Druckliste CSV export). `enrollRecipients` and the send fn already treat `email: null` as the print segment. Confirm the segment filter's default does **not** silently drop them.

### Files touched (M1)
- **New** `src/features/campaigns/lib/rksvVersion.ts` (shared version helper — see refactor).
- **New** `src/features/campaigns/lib/rksvEnroll.ts` (`filterLicensesForSegment`, `licenseToEnrollSubject`, types).
- **Edit** `src/features/campaigns/lib/rksvWizard.ts` (re-export version helpers).
- **Edit** `src/features/campaigns/pages/CampaignsPage.tsx` (create + enroll UI + state; import `listLicenses` from `../../viertl/api/viertlApi`, `createCampaign`/`enrollRecipients` already available).

### Ambiguities & decisions (M1)
- **Campaign `status` after create:** migration defaults `draft`. `send-campaign` refuses only `archived`, so `draft` can be sent — no status transition UI is required for the feature to work. **Decision:** leave status at `draft`; do not add activate/archive controls in this fix (out of scope; can be a minor follow-up). Flag for sign-off.
- **Enroll batch vs. send batch:** the send fn overwrites `batch` on the recipient at send time (`update({ sent_at, batch })`). So the enroll-time batch is a pre-send grouping label; sending a wave re-labels. **Decision:** keep the enroll batch (it labels un-sent recipients for the wave picker); acceptable that send can relabel. Note in a comment.

---

## M2 — Move terminal write-back server-side (`campaign-outcome` edge fn)

### Decision (confirming the planner's recommended shape)
Create a **new public edge fn `campaign-outcome`** with `verify_jwt=false`, keyed by the recipient **token**. It: validates the token, **guards idempotency (M3)**, records the outcome with the **service-role** key, and performs the Viertl write-back (flag + note) server-side. The landing page calls this fn instead of the client-side `rksvHandler` + `campaignApi.recordOutcome`.

This mirrors `notify-viertl-closure` (service-role admin client for Viertl writes) and `stripe-complete-acceptance` (public, credential-in-body). It closes M2 (no anon write to `viertl_*`) and gives M3 a single server-side chokepoint.

### New edge fn — `supabase/functions/campaign-outcome/index.ts`
**Request** (POST JSON):
```
{
  token: string,                         // the recipient's landing token (the credential)
  outcome: 'authorized' | 'quote_requested' | 'soft_check',
  payload?: {                            // terminal answers to merge (type A)
    signatureData?, signedByName?,       // authorize
    hasWin10?, setupSize?                // request_quote / soft_check
  }
}
```

**Flow:**
1. CORS/OPTIONS + `json()` helpers (copy from `notify-viertl-closure`).
2. Parse body; require `token` and a valid `outcome` (validate against the same `CAMPAIGN_OUTCOMES` terminal subset — inline the array; do not import from `src/` into Deno).
3. `admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`.
4. **Load recipient by token** (service role): `select('*').eq('token', token).limit(1).maybeSingle()`. 404 if not found. **The token is the credential** — same posture as `getOfferByShareCode`; a caller can only affect the row its token maps to (this is exactly the blast-radius bound the review asked for, now enforced server-side because the client no longer chooses `subject_id`).
5. **Idempotency guard (M3 — see below):** if `recipient.outcome === outcome` (already the same terminal value), **return the existing row immediately** — no update, no Viertl write-back, no note. (Return `{ ok: true, idempotent: true, recipient }`.)
6. **Record outcome** (service role): update `campaign_recipients` where `token` — set `outcome`, `outcome_at = now`, `payload = { ...existing, ...body.payload }`, and `started_at = now` if null. (This is the server-side equivalent of `recordOutcome`.)
7. **Viertl write-back** (only when `recipient.subject_type === 'viertl_license'`), keyed by `recipient.subject_id` (the license UUID from the DB row — **the server chooses it, not the client**):
   - `authorized` → insert one `viertl_events` note: `"RKSV-Kampagne: Auftrag erteilt (self-reported)"`.
   - `quote_requested` → `update viertl_licenses set hardware_needed = true` (with `updated_by_id/name` = sentinel actor so the audit trigger attributes it), **then** insert `viertl_events` note `"RKSV-Kampagne: Angebot angefordert (<Einzelplatz|Mehrplatz>, neue Hardware, self-reported)"`.
   - `soft_check` → insert `viertl_events` note `"RKSV-Kampagne: Remote-OS-Check angefordert (weiß nicht, self-reported)"`.
   - Sentinel actor: `actor_id: 'campaign'`, `actor_name: 'RKSV-Kampagne'` (mirrors `CAMPAIGN_ACTOR` in `rksvHandler.ts`, preserving the "self-reported vs technician" distinction in the timeline). Note `viertl_licenses.update` for `hardware_needed` should send `updated_by_id/name` so the existing audit trigger logs the field change (matches `updateLicense`).
8. Return `{ ok: true, recipient: <mapped or raw row> }`.

**Extracted pure helper for testability** — `supabase/functions/campaign-outcome/outcomeWriteBack.ts`, mirroring the `campaignAttribution.ts` pattern (minimal client interface + pure function), so the idempotency guard and the write-back branch selection are unit-tested without a Deno harness:
```
export interface OutcomeClient { from(table): { select/update/insert chain… } }  // minimal, like AttributionClient
export function noteForOutcome(outcome, payload): string           // pure: the three note strings + label
export async function applyOutcome(client, recipientRow, outcome, payload):
  Promise<{ recorded: boolean; wroteBack: boolean; idempotent: boolean }>
```
`index.ts` stays a thin HTTP wrapper (env + createClient + parse + call `applyOutcome`), exactly as `resend-webhook/index.ts` wraps `attributeCampaignEvent`.

### `config.toml`
Add:
```
# Called from the anonymous campaign landing page (?c={token}, no login).
# The recipient token is the credential; the fn loads the row by token and
# refuses anything else, then records the outcome + Viertl write-back with the
# SERVICE ROLE key (so the public client never touches viertl_* directly).
[functions.campaign-outcome]
verify_jwt = false
```
(Placed near `notify-offer-accepted` / `stripe-webhook`, the other `verify_jwt=false` public fns.)

### Client wiring change (landing page)
Add an API wrapper in `campaignApi.ts` and switch the wizard to it:

- **New** `campaignApi.submitOutcome(input: { token; outcome; payload? }): Promise<CampaignRecipient>` — calls `supabase.functions.invoke('campaign-outcome', { body })`, unwraps the error body exactly like `sendCampaign`/`notifyViertlClosure`, and maps the returned row via `rowToRecipient`. Uses the **anon** client's `functions.invoke` (fn is `verify_jwt=false`, so the anon key passes the gateway — same as the accept-page Stripe fns).
- **Edit** `RksvWizard.tsx`: replace the three imports from `../../lib/rksvHandler` (`authorize`, `requestQuote`, `softCheck`) and the direct `saveRecipientPayload`-on-terminal with calls to `submitOutcome`:
  - `onAuthorize` → `submitOutcome({ token, outcome: 'authorized', payload: { signatureData, signedByName } })`.
  - `onRequestQuote` → `submitOutcome({ token, outcome: 'quote_requested', payload: { hasWin10: 'nein', setupSize } })`.
  - `onSoftCheck` → `submitOutcome({ token, outcome: 'soft_check', payload: { hasWin10: 'weiss_nicht' } })`.
  - `done`-state and success UX unchanged.
- **`saveRecipientPayload` (mid-wizard, non-terminal answers)** stays on the anon client — it only writes `campaign_recipients.payload`/`started_at` (its own recipient row, gated by token), **not** `viertl_*`. That is not the M2 concern (M2 is specifically the privileged Viertl write-back). **Decision:** leave `markLanded` and `saveRecipientPayload` as anon `campaign_recipients` writes (consistent with the offers `share_code` posture the migration already documents); only the **Viertl** write-back moves server-side. This keeps the change surgical and the funnel stamps best-effort as designed.

### What becomes of `rksvHandler.ts` / `recordOutcome`
- **`rksvHandler.ts`** — its only caller was `RksvWizard.tsx`, which now calls `submitOutcome`. **Decision:** delete `src/features/campaigns/lib/rksvHandler.ts` (and its `CAMPAIGN_ACTOR` export moves conceptually into the edge fn as the sentinel actor). Removing it also removes the only anon `updateLicense`/`addNote` call path — which is the whole point of M2. (There is no existing `rksvHandler.test.ts` to delete; grep confirms only `rksvWizard.test.ts` + `campaignApi.test.ts`.)
- **`campaignApi.recordOutcome`** — no longer called from the client landing path (the edge fn does the equivalent server-side). **Decision:** **keep** `recordOutcome` in `campaignApi.ts` for now but it becomes unused by production code. Its unit tests stay green. Two sub-options, pick one and flag:
  - (a) Keep it + its tests as-is (dead but tested; zero test churn). **Recommended** — least risk to the 1561 count.
  - (b) Remove it and its two tests. Reduces dead code but churns the test file. Not recommended in a fix PR.
  We go with **(a)**; add a one-line comment that the production caller is now the `campaign-outcome` edge fn.

### Files touched (M2)
- **New** `supabase/functions/campaign-outcome/index.ts`
- **New** `supabase/functions/campaign-outcome/outcomeWriteBack.ts` (pure, tested)
- **Edit** `supabase/config.toml` (add the `[functions.campaign-outcome]` block)
- **Edit** `src/features/campaigns/api/campaignApi.ts` (add `submitOutcome`; comment `recordOutcome` as edge-fn-superseded)
- **Edit** `src/features/campaigns/pages/rksv/RksvWizard.tsx` (call `submitOutcome`, drop handler imports)
- **Delete** `src/features/campaigns/lib/rksvHandler.ts`

**Do NOT deploy** the edge fn (repo convention: edge fns deploy manually). The plan/PR only adds the code + config.toml entry.

---

## M3 — Idempotent terminal outcome (guard lives in the edge fn)

### Where
Inside `campaign-outcome`'s `applyOutcome` (step 5 above), before any update or write-back.

### Exact condition
```
if (recipientRow.outcome === requestedOutcome) {
  return { recorded: false, wroteBack: false, idempotent: true };  // return the existing row unchanged
}
```
- Short-circuits **only** when the already-stored outcome equals the incoming terminal outcome (the "re-submit the same terminal step" case the review describes). Fires no `viertl_events` note, no `updateLicense`, no outcome re-stamp.
- If a **different** terminal outcome arrives (e.g. the recipient went back and chose a different branch), the guard does **not** trip — the new outcome is recorded and its write-back fires. **Decision:** this matches the wizard's real branch semantics (a genuine change of answer should be reflected once). Flag: if the product wants "first terminal wins, ignore all later", change the condition to `if (recipientRow.outcome != null)`. **Recommended: same-value guard** (`=== requestedOutcome`) per the review's exact wording ("already set to the same terminal value").

### Why server-side and not in `recordOutcome`
The review suggested guarding in `recordOutcome`; since M2 already relocates the whole terminal path into the edge fn, the guard belongs there so it protects **both** the outcome stamp **and** the Viertl note in one atomic check (client-side `recordOutcome` couldn't guard the note anyway — the note was a separate handler call). This also means a duplicate submit that races is bounded by the single edge-fn read-then-write; acceptable given single-recipient, low-concurrency use (a strict guarantee would need a conditional UPDATE / unique index, out of scope — note it).

### Files touched (M3)
- Covered by the `campaign-outcome/outcomeWriteBack.ts` new file (M2). No separate files.

---

## Full file-by-file change list

| File | M | Change |
|---|---|---|
| `src/features/campaigns/lib/rksvVersion.ts` | M1 | **New.** `VERSION_THRESHOLD`, `parseVersion`, `versionOk` (moved verbatim from wizard). |
| `src/features/campaigns/lib/rksvWizard.ts` | M1 | Delete the three version defs; re-export them from `./rksvVersion` (keeps existing wizard tests' import path valid). |
| `src/features/campaigns/lib/rksvEnroll.ts` | M1 | **New.** `filterLicensesForSegment`, `licenseToEnrollSubject`, `EnrollSubject`/`ViertlSegmentFilter` types. The snapshot logic. |
| `src/features/campaigns/pages/CampaignsPage.tsx` | M1 | Create-campaign form + enroll-from-Viertl panel + state; import `listLicenses`, `createCampaign`, `enrollRecipients`, the two enroll helpers, `Select`. |
| `supabase/functions/campaign-outcome/index.ts` | M2/M3 | **New.** Public edge fn: token → record outcome + service-role Viertl write-back. |
| `supabase/functions/campaign-outcome/outcomeWriteBack.ts` | M2/M3 | **New.** Pure `applyOutcome` (idempotency guard) + `noteForOutcome`; minimal client interface (like `campaignAttribution.ts`). |
| `supabase/config.toml` | M2 | Add `[functions.campaign-outcome]` `verify_jwt = false`. |
| `src/features/campaigns/api/campaignApi.ts` | M2 | Add `submitOutcome()` (invokes `campaign-outcome`); comment `recordOutcome` as edge-fn-superseded (kept). |
| `src/features/campaigns/pages/rksv/RksvWizard.tsx` | M2 | Terminal handlers call `submitOutcome` instead of `rksvHandler` + client `recordOutcome`. |
| `src/features/campaigns/lib/rksvHandler.ts` | M2 | **Delete.** Only caller (RksvWizard) rewired; removes the anon Viertl write path. |

**No new migration.** The schema already has everything (permissive RLS suffices for the service-role edge-fn writes; token/outcome/payload columns exist). Confirmed against `20260915120000_create_campaigns.sql`. If sign-off later wants defense-in-depth RLS tightening on `campaign_recipients`/`viertl_*` for anon, that is a **separate** migration and explicitly out of this fix's scope (the app-wide posture is permissive RLS; M2's fix is "don't write privileged data from the anon client", achieved by the edge fn — not by RLS changes).

---

## Test plan

**Guiding constraints:** keep the existing 1561 green; pure logic unit-tested; api mapping tested like `campaignApi.test.ts`; edge-fn logic tested via extracted pure helper (like `campaignAttribution.test.ts`), since there is no Deno harness.

### Existing tests — stay green, why
- `rksvWizard.test.ts` (18) — imports `parseVersion`/`versionOk`/`VERSION_THRESHOLD`/`nextStep` from `../rksvWizard`. The **re-export** preserves those exports, so **zero edits, still passes**. (Confirm no test imports internal-only symbols.)
- `campaignApi.test.ts` (18) — unchanged; `recordOutcome` kept, so its two tests stay. New `submitOutcome` tests are additive.
- `campaignAttribution.test.ts` (4) — untouched.
- No `rksvHandler.test.ts` exists → deleting `rksvHandler.ts` breaks no test. Grep-confirmed.

### New tests
1. **`src/features/campaigns/lib/__tests__/rksvVersion.test.ts`** (optional if kept identical) — the version cases already live in `rksvWizard.test.ts`; **decision:** do not duplicate. If a reviewer prefers colocated tests, move (not copy) the version cases here and keep the wizard test importing via re-export. Default: leave as-is to minimize churn.

2. **`src/features/campaigns/lib/__tests__/rksvEnroll.test.ts`** (new — the M1 crux):
   - `licenseToEnrollSubject`: `hardwareNeeded:true` → `payload.knownHardwareNeeded:true`; version `'67.25'`/`'68.00'` → `versionOk:true`; `'67.24'` → `false`; `null`/`'kaputt'` → `versionOk` **absent/undefined** (NOT `false`) — the key assertion that the wizard gets "unknown" and asks Win10. Assert `subjectId === license.id`, email/name passthrough, batch set.
   - `filterLicensesForSegment`: mirrors ViertlPage predicate — `customerStatus` filter (default drops non-active when set), `hardwareNeeded`-only, `withEmailOnly` excludes null-email, `search` substring over name/kdnr/ort. Table-driven.

3. **`campaignApi.test.ts` additions** (`submitOutcome`):
   - invokes `campaign-outcome` with `{ token, outcome, payload }` body; maps the returned row via `rowToRecipient`.
   - unwraps the error body like the existing `sendCampaign` error test.

4. **`supabase/functions/campaign-outcome/__tests__/outcomeWriteBack.test.ts`** (new — M2/M3 logic; pure, mock client mirroring `campaignAttribution.test.ts`'s `AttributionClient` mock):
   - **M3 idempotency:** recipient already `outcome:'authorized'`, incoming `'authorized'` → `applyOutcome` returns `{ idempotent:true }`, performs **no** update, **no** insert into `viertl_events`, **no** `viertl_licenses` update (assert the mock's insert/update were never called).
   - **authorize** (fresh): records outcome, inserts exactly **one** `viertl_events` note with the authorized text + sentinel actor; no `hardware_needed` update.
   - **request_quote** (fresh): updates `viertl_licenses.hardware_needed=true` with sentinel `updated_by_*`, inserts one note containing the setup-size label.
   - **soft_check** (fresh): one note, no license update.
   - **non-viertl subject** (`subject_type !== 'viertl_license'`): records outcome, **no** Viertl writes.
   - **different-outcome re-submit** (stored `soft_check`, incoming `quote_requested`): guard does NOT trip; records + writes back once. (Locks the chosen guard condition.)
   - `noteForOutcome('quote_requested', { setupSize:'mehrplatz' })` → contains `'Mehrplatz'`; `'einzelplatz'` → `'Einzelplatz'`.

5. **Component/glue test (addresses review m6, optional but recommended)** — `RksvWizard.test.tsx`:
   - `known={hardwareNeeded:false, versionOk:true}` (via `recipient.payload`) → renders the **authorize** terminal with zero questions (proves the enroll snapshot wires through).
   - unknown version + `hardwareNeeded:false` → renders the **has_win10** question.
   - terminal submit calls `submitOutcome` (mock `campaignApi`) once with the right outcome; the `done` view renders. This is light and guards the M2 rewiring without "asking the user to click".

### Full-suite gate
- `npx vitest run` — expect 1561 + new tests, 0 failures.
- `npm run build` — must pass (new lazy imports unchanged; CampaignsPage still lazy under the app shell as before).
- `npx tsc --noEmit` — no **new** errors in campaign/edge files (the 4 pre-existing unrelated test-file type errors remain as the baseline documented in the review).

---

## Ambiguities flagged (decisions taken)

1. **Version helper location** — extract to `src/features/campaigns/lib/rksvVersion.ts` and **re-export** from `rksvWizard.ts` (not `_shared/`, since the edge fn doesn't recompute version). Keeps existing wizard tests green.
2. **`recordOutcome` fate** — **keep** (dead in prod, tests stay) rather than delete, to avoid test churn in a fix PR. Comment it.
3. **M3 guard condition** — same-value guard (`recipient.outcome === requestedOutcome`), matching the review's wording. Alternative "first terminal wins" (`outcome != null`) noted for sign-off.
4. **Campaign `status`** — new campaigns stay `draft`; no activate/archive UI added (send fn accepts non-archived). Flag for sign-off.
5. **Anon `campaign_recipients` writes** (`markLanded`, `saveRecipientPayload`) **stay anon** — M2 is scoped to the **privileged Viertl** write-back only; funnel stamps on the recipient's own token-gated row match the offers `share_code` posture. No RLS migration in this fix.
6. **"Reuse ViertlFilters where sensible"** — reuse at the **logic layer** (`filterLicensesForSegment` mirrors ViertlPage's `filtered` predicate + shared status option lists), not the JSX. Testable, decoupled.
7. **Type coverage of enroll** — enroll UI is Type A only; the campaign-type Select offers only `rksv_signature`. Type B untouched.
8. **Strict send-once concurrency** for the outcome guard is best-effort (read-then-write in the edge fn), acceptable for single-recipient use; a conditional UPDATE / unique guarantee is out of scope, noted.
