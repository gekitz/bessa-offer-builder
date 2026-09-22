# Outreach Campaigns — Fixes Code Review (M1 / M2 / M3)

**Reviewer:** automated code-review agent
**Scope reviewed:** the fix diff `653f385..HEAD` (commits `9578013` M2/M3, `c7befbe` M1) against
`docs/outreach-campaigns-fixes-plan.md`, `docs/outreach-campaigns-fixes-plan-review.md`, and the
original `docs/outreach-campaigns-code-review.md`.
**Verdict:** ship with fixes (the three findings are genuinely closed; remaining items are minor).

---

## Verification (independently re-run, not trusted from the report)

| Check | Result |
|---|---|
| `npx vitest run` | **PASS** — 145 files / **1587** tests, 0 failures (baseline 1561 + 26 new: 11 `rksvEnroll`, 12 `outcomeWriteBack`, 3 `submitOutcome`). Matches the report. |
| `npm run build` | **PASS** — built in ~4s. CampaignsPage/CampaignLandingPage chunks emit as before. |
| `npx tsc --noEmit` | Type errors ONLY in pre-existing test files (`BelegePanel.test.tsx`, `mesonicImport.test.ts`, `offerApi.test.ts`). **Zero** errors in any campaign or edge-fn file (grep-confirmed). The implementer reported 2 pre-existing files; tsc actually still lists 3 (the `mesonicImport`/`offerApi` ones were also in the original baseline of 4). Unchanged by this work either way. |

Reported test/build/typecheck status is accurate.

---

## M1 — Create-campaign + Enroll-recipients UI — **FIXED**

- **Snapshot crux satisfied.** `licenseToEnrollSubject` (`src/features/campaigns/lib/rksvEnroll.ts`)
  snapshots `payload.knownHardwareNeeded = license.hardwareNeeded` (boolean column) and
  `payload.versionOk = versionOk(license.gastrotouchVersion)` using the **same** `versionOk` imported
  from the extracted `rksvVersion.ts`. `rksvWizard.ts` re-exports those symbols, so there is a single
  implementation — no drift. Verified.
- **C1 (unknown → omit key) correctly implemented.** `licenseToEnrollSubject` builds
  `payload = { knownHardwareNeeded }` and only adds `versionOk` when it is not `undefined`
  (`if (ok !== undefined) payload.versionOk = ok`). The test asserts `'versionOk' in payload === false`
  for `null`/junk versions — so the wizard sees "unknown" and asks the Win10 question rather than
  over-trusting a coerced `false`. This is the load-bearing behavior and it is locked by a test.
- **Wizard consumes the snapshot end-to-end.** `RksvWizard.tsx:47-50` reads
  `{ hardwareNeeded: p.knownHardwareNeeded, versionOk: p.versionOk }` from `recipient.payload` and
  passes it to `nextStep`. Traced against `nextStep`: a well-triaged recipient
  (`hardwareNeeded:false, versionOk:true`) hits the zero-question `authorize` terminal; `hardwareNeeded:true`
  skips Win10 and asks only setup-size; unknown falls through to the Win10 question. Correct.
- **UI wiring complete.** `CampaignsPage.tsx` adds a "Neue Kampagne" button (header + empty state,
  replacing the old "über eine Migration" copy), a create form (`createCampaign` with the custom
  `Select` for type, fixed to `rksv_signature`), and an enroll-from-Viertl panel that reads
  `listLicenses()`, filters with `filterLicensesForSegment`, snapshots via `licenseToEnrollSubject`,
  confirms with a count (incl. "ohne E-Mail"), and calls `enrollRecipients`. No native `<select>`.
- **C3 default correct.** `filterLicensesForSegment` default keeps no-email licenses (test asserts
  the empty filter returns all 3, incl. the null-email rows), so the print segment is enrolled on the
  first run. `withEmailOnly` is opt-in.

**M1 residual (minor):** the campaign-type `Select` is a fixed single-option control with an inert
`onChange={() => {}}` — harmless placeholder for Type B, but a dead handler.

---

## M2 — Anon write-back moved server-side — **FIXED**

- **No anon Viertl write remains in the campaign feature.** `rksvHandler.ts` is deleted; a grep of
  `src/features/campaigns/` for `updateLicense`/`addNote`/`viertl_licenses`/`viertl_events` finds only
  test/comment references, no live client write path. `saveRecipientPayload`/`markLanded` still touch
  only `campaign_recipients` (the recipient's own token-gated row) — consistent with the offers
  `share_code` posture and explicitly out of M2's scope.
- **Write-back now runs in the `campaign-outcome` edge fn with the service role.**
  `supabase/functions/campaign-outcome/index.ts` creates a service-role admin client, loads the
  recipient by token, and calls the pure `applyOutcome` helper which does the `viertl_licenses` update
  (with `updated_by_*` sentinel — C6 satisfied, so the audit trigger attributes the `hardware_needed`
  change) and the `viertl_events` note insert. Mirrors `notify-viertl-closure`.
- **Token validation prevents cross-recipient / bogus-outcome writes.** The **server** picks
  `subject_id` from the loaded row (never the client body), so a caller can only affect the single
  recipient its token maps to — the exact blast-radius bound the original review demanded, now enforced
  server-side. Outcome is validated against a **3-value** Type-A allow-list (`isRksvOutcome`) that
  **rejects** `offer_accepted` and junk (C4 satisfied; tested). Missing token → 400, unknown token → 404.
- **`config.toml`** registers `[functions.campaign-outcome] verify_jwt = false` — correct for the
  unauthenticated landing page; the body token is the credential.
- **Client wiring.** `campaignApi.submitOutcome` invokes the fn via the anon client, unwraps the
  error body like `sendCampaign`, and maps the returned row. `RksvWizard.tsx` calls it on all three
  terminals. `recordOutcome` is kept but has **no production caller** (grep-confirmed: only its own def
  + a comment), documented as edge-fn-superseded — per plan decision (a).

**M2 residual (minor):** `index.ts` re-`select`s the recipient row after `applyOutcome` and returns
`fresh ?? recipient` — one extra round-trip, harmless. Edge fn is **not deployed** (correct: manual
deploy convention).

---

## M3 — Idempotent terminal outcome — **FIXED (with a disclosed semantic deviation)**

- **The reload+resubmit duplicate-note bug is closed.** `applyOutcome` short-circuits when the row is
  already terminal and, on a fresh submit, stamps the outcome via an **atomic compare-and-set**
  (`update(...).eq('token', token).is('outcome', null).select('*')`). A stamp that matches 0 rows is
  treated as "already terminalized → skip write-back". So a re-submit fires no second `viertl_events`
  note, no second `updateLicense`. Tested (three idempotency cases, incl. the 0-row race path).
- **Deviation from the plan (disclosed by the implementer, endorsed by the plan review):** the guard is
  `if (recipient.outcome != null)` — **"first terminal wins"** — not the plan's same-value
  (`=== requestedOutcome`) read-then-write guard. This additionally closes the concurrent double-submit
  hole with no migration, at the cost of ignoring a genuinely *different* later terminal answer on an
  already-terminalized row. The plan review explicitly recommended this hardening and flagged the
  semantic change as an explicit decision; a test (`outcomeWriteBack.test.ts:95`) locks the
  "different already-terminal outcome → idempotent" behavior. This is a reasonable, safer choice for a
  single-recipient landing page and is fully disclosed. **Flag for product sign-off** that a customer
  who changes their answer after submitting a terminal will not have the new answer recorded.

**M3 residual (minor, non-blocking):** stale comment. `outcomeWriteBack.ts:100-101` says the
short-circuit fires "wenn schon **derselbe** Terminal-Wert gestempelt ist" (same-value), but the code
guards `!= null` (any value). The header comment lower down correctly describes "first terminal wins",
so the module is internally contradictory on this point — worth a one-line comment fix.

---

## Regression check

- **`rksvWizard.test.ts` (18):** green — imports `parseVersion`/`versionOk`/`VERSION_THRESHOLD` from
  `../rksvWizard`, preserved by the re-export.
- **`campaignApi.test.ts`:** `recordOutcome` tests stay green; `submitOutcome` tests are additive and
  assert the invoke body + row mapping + error-body unwrap.
- **`campaignAttribution.test.ts` (4):** untouched. The resend-webhook offer/campaign attribution path
  is not modified by any of M1/M2/M3 — `campaign-outcome` is a separate fn that never reads/writes the
  attribution columns. No regression to the highest-risk existing surface.
- **`rksvHandler.ts` deletion:** no `rksvHandler.test.ts` existed; only importer (RksvWizard) rewired.
- **F1 (plan-review must-fix) honored:** the new pure-helper test lives at
  `src/features/campaigns/__tests__/outcomeWriteBack.test.ts` (src-side, cross-tree import), NOT under
  `supabase/functions/**/__tests__`, so vitest collects it. Confirmed it ran (12 tests counted).

---

## Findings

### Blockers
None.

### Major
None. All three review findings (M1/M2/M3) are genuinely closed and tested.

### Minor
- **m1 — M3 "first terminal wins" needs an explicit product sign-off.** A customer who submits a
  terminal, then goes back and picks a different branch, will NOT have the second answer recorded
  (guard trips on `outcome != null`). Disclosed + tested, but it is a behavior change from the plan's
  same-value guard; confirm the business is fine with it.
- **m2 — stale comment in `outcomeWriteBack.ts` (lines 100-101)** describes a same-value short-circuit
  while the code guards any non-null outcome. Contradicts the "first terminal wins" header comment.
  Documentation-only; fix the comment.
- **m3 — dead `onChange={() => {}}`** on the fixed campaign-type `Select` in `CampaignsPage.tsx`.
  Harmless placeholder for Type B.
- **m4 (carried from original review) — enroll skipped-count still depends on PostgREST returning only
  inserted rows** for `ignoreDuplicates` upserts. Now has a live caller (the enroll button), so this
  should be spot-checked against the real DB on first use; unit tests assert it against a mock only.
- **m5 — no component/glue test for the wizard step→terminal→`submitOutcome` mapping** (original
  review's m6). The pure `nextStep` and the pure `applyOutcome` are exhaustively tested and the api
  mapping is tested, so the load-bearing logic is covered, but the React dispatcher is still untested.
  Light follow-up.

---

## Recommendation

**Ship with fixes.** M1, M2, and M3 are each verified closed: the enroll snapshot populates
`knownHardwareNeeded`/`versionOk` with the correct values using the wizard's own parse logic and the
wizard consumes them (a well-triaged recipient reaches a terminal with zero/fewer questions); the
privileged Viertl write-back is fully server-side behind a token-validated service-role edge fn with no
remaining anon write; and the outcome recording is idempotent (reload+resubmit produces no duplicate
note) via an atomic compare-and-set. The only items outstanding are a product sign-off on the disclosed
"first terminal wins" semantics (m1) and cosmetic cleanups (m2/m3) — none block shipping. Tests (1587)
and build pass on independent re-run.
