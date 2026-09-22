# Outreach Campaigns — Fix Plan Review (adversarial)

**Plan reviewed:** `docs/outreach-campaigns-fixes-plan.md`
**Verified against:** the just-built campaigns code on `worktree/clear-cloud-d0ca`.
**Verdict:** approve_with_changes. The plan is technically sound, correctly grounded in the real
signatures, and closes all three findings. There are a handful of concrete corrections and one
must-fix (a stated file path that doesn't exist) before implementation, plus optional hardening for
the M3 concurrency edge.

---

## Grounding audit — every claimed signature/fact re-checked

| Plan claim | Reality | OK? |
|---|---|---|
| `createCampaign(input, actor)` exists, no caller | `campaignApi.ts:107` exact match | ✅ |
| `enrollRecipients(campaignId, subjects[{subjectType,subjectId,name,email,batch,payload?}])` returns `{enrolled, skipped}`, per-subject `payload` flows to the row | `campaignApi.ts:141-174`; `payload: s.payload ?? {}` at line 162 | ✅ |
| `recordOutcome` has no idempotency guard, only caller is `rksvHandler.ts` | `campaignApi.ts:334-360` unconditional update; caller confirmed | ✅ |
| `parseVersion`/`versionOk`/`VERSION_THRESHOLD=67.25` are pure + exported in `rksvWizard.ts` | `rksvWizard.ts:16,78,88` | ✅ |
| `nextStep` uses only `known.versionOk`/`known.hardwareNeeded`, not the threshold directly | confirmed `rksvWizard.ts:38-73` — threshold only used inside `versionOk` | ✅ |
| `rksvHandler.ts` calls `recordOutcome` then `addNote`/`updateLicense` via anon client | confirmed `rksvHandler.ts:39-79` | ✅ |
| `listLicenses(): Promise<ViertlLicense[]>`, `updateLicense(id, patch, actor)`, `addNote(licenseId, message, actor)` | `viertlApi.ts:92,115,241` exact | ✅ |
| `ViertlLicense` has `id`, `name`, `email`, `contact`, `ort`, `mesonicKdnr`, `hardwareNeeded: boolean`, `gastrotouchVersion: string \| null` | `viertl/types.ts:31-53` | ✅ |
| `RksvPayload` already declares `knownHardwareNeeded?`/`versionOk?` — no type change | `types.ts:76-88` | ✅ |
| Wizard reads `{ hardwareNeeded: p.knownHardwareNeeded, versionOk: p.versionOk }` from payload | `RksvWizard.tsx:48-51` exact | ✅ |
| Migration RLS is `FOR ALL USING(true)` on both campaign tables | `20260915120000...:97,99` | ✅ |
| `token` column is `NOT NULL UNIQUE` | migration line 59 | ✅ (matters for M2/M3 — see below) |
| Viertl audit trigger tracks `hardware_needed`, keyed off `NEW.updated_by_id/name` | `20260827120000...:104,112` | ✅ |
| `config.toml`: `notify-offer-accepted`/`resend-webhook`/`stripe-webhook` are `verify_jwt=false`; `send-campaign` is `true` | confirmed `config.toml` | ✅ |
| `notify-viertl-closure` uses service-role admin client for Viertl writes ("→ RLS egal") | `notify-viertl-closure/index.ts:71,123` | ✅ |
| `campaignApi.test.ts` already mocks `functions.invoke` + has a `sendCampaign` error-unwrap precedent | test lines 46, 280+ | ✅ |
| Wizard test imports `parseVersion`/`versionOk`/`VERSION_THRESHOLD` from `../rksvWizard` | `rksvWizard.test.ts:2` — **re-export keeps it green, confirmed** | ✅ |

The plan's "Grounding" section is accurate. No fabricated signatures.

---

## MUST-FIX before implementation

### F1 — `campaignAttribution.test.ts` path is wrong in the plan (precedent misstated)
The plan repeatedly cites `resend-webhook/campaignAttribution.ts` as the "pure edge-fn helper + mock
client, unit-tested" precedent and models the new `campaign-outcome/outcomeWriteBack.ts` +
`campaign-outcome/__tests__/outcomeWriteBack.test.ts` on it. But the **test file does not live next
to the edge fn** — it is at `src/features/campaigns/__tests__/campaignAttribution.test.ts` (a
`src/`-side vitest file that imports the Deno helper). There is **no `supabase/functions/**/__tests__`
directory and vitest is not configured to collect tests under `supabase/functions/`.** If the
implementer literally creates `supabase/functions/campaign-outcome/__tests__/outcomeWriteBack.test.ts`
as written in the plan's file list and test plan, **that test will not be picked up by
`npx vitest run`** (so it silently won't run / won't count), or worse will fail to resolve the Deno
`esm.sh` import under the node/jsdom test env.
**Fix:** put the new pure-helper test on the `src/` side exactly like the existing one — e.g.
`src/features/campaigns/__tests__/outcomeWriteBack.test.ts` — importing the helper from
`../../../../supabase/functions/campaign-outcome/outcomeWriteBack.ts`, mirroring how
`campaignAttribution.test.ts` imports its subject. And the helper must be import-safe under vitest:
keep it a pure module with **no top-level `esm.sh`/`Deno` references** (only `index.ts` may import
`createClient`/read `Deno.env`). Confirm `campaignAttribution.ts` follows this shape before copying.

---

## M1 — assessment: SOUND, with two corrections

**The crux (snapshot uses the SAME parse logic, no drift): satisfied.** `licenseToEnrollSubject`
calls `versionOk(l.gastrotouchVersion)` imported from the extracted `rksvVersion.ts`, and
`rksvWizard.ts` re-exports the same symbols, so there is a single implementation. The
"unknown → omit the key, never coerce to `false`" rule is correctly identified as load-bearing
(JSON drops `undefined`), and it matches `versionOk`'s real return contract (`undefined` for
null/junk). After enroll, the wizard's `known` context **will** populate, because
`RksvWizard.tsx:48-51` reads exactly `p.knownHardwareNeeded`/`p.versionOk` from `recipient.payload`,
which is the row `enrollRecipients` writes. Wiring is correct end-to-end.

**Enroll caller correctness:** the subject shape the plan builds
(`{subjectType:'viertl_license', subjectId:l.id, name, email, batch, payload}`) matches
`enrollRecipients`'s parameter type exactly, and `l.id` (license UUID) is the correct write-back key
(`updateLicense(id)`/`addNote(licenseId)` both take that UUID). ✅

Corrections:

- **C1 (major-ish) — `versionOk: undefined` must not be stamped into the payload object.** The plan's
  `licenseToEnrollSubject` returns `payload: { knownHardwareNeeded, versionOk: versionOk(...) }`. When
  `versionOk(...)` returns `undefined`, this literally sets `versionOk: undefined` on the object. In
  practice `JSON.stringify` drops it and the DB stores `{knownHardwareNeeded:x}` — so the **stored**
  row is correct. But if any unit test asserts the returned JS object with `toEqual({knownHardwareNeeded:true})`
  it will FAIL against `{knownHardwareNeeded:true, versionOk:undefined}` (vitest `toEqual` treats an
  explicit `undefined` key as present-and-mismatched vs. absent in some matcher configs;
  `toStrictEqual` definitely fails). The plan's own test #2 asserts "`versionOk` **absent/undefined**".
  **Fix:** build the payload conditionally — only add `versionOk` when it is not `undefined` — OR make
  the test use `toEqual` (not `toStrictEqual`) and assert `expect(subj.payload.versionOk).toBeUndefined()`.
  Call this out so the implementer doesn't hit a self-inflicted red test.

- **C2 (minor) — `filterLicensesForSegment` must mirror the REAL ViertlPage predicate, which it
  currently over-specifies.** ViertlPage's `filtered` (`ViertlPage.tsx:157-170`) filters on
  `status`, `customerStatus`, `hwOnly` (`!l.hardwareNeeded`), `noEmailOnly` (`l.email` truthy), and a
  search haystack of `name + contact + ort + mesonicKdnr + hardwareModel`. The plan's
  `ViertlSegmentFilter` names `search/status/customerStatus/hardwareNeeded/withEmailOnly`. Note the
  **polarity flip**: ViertlPage has `noEmailOnly` (show only missing-email), the plan has
  `withEmailOnly` (show only with-email). Both are legitimate but they are opposite filters — for an
  enroll segment `withEmailOnly` is the right default intent, but the plan claims it "mirrors
  ViertlPage's predicate" which it does **not** (opposite sign). Also the plan's search description
  says "name/kdnr/ort" while the real haystack additionally includes `contact` and `hardwareModel`.
  **Fix:** either genuinely reuse the ViertlPage haystack fields, or drop the "mirrors the predicate"
  claim and document it as a purpose-built segment filter. Not blocking, but the test #2 ("mirrors
  ViertlPage predicate") is worded against a mirror that isn't exact.

- **C3 (minor, already flagged by plan but under-emphasized) — no-email recipients + the enroll
  default.** The plan says no-email licenses are still enrolled (correct — the funnel counts them and
  Druckliste exports them). But if the operator sets `withEmailOnly`, they are dropped from the
  segment entirely and never enrolled, so they never reach the print list. The plan's decision #4 to
  "confirm the segment filter's default does not silently drop them" is the right instinct — make the
  **default** `withEmailOnly = false` so the first-run enroll captures the print segment too. Flag for
  the implementer as a default-value decision, not a behavior bug.

**M1 verdict:** approach is correct and the wizard context will populate. Apply C1 (payload shape) to
avoid a red test; treat C2/C3 as wording/precision fixes.

---

## M2 — assessment: CLOSES the anon-write hole, with checks

**Does moving the write-back server-side remove ALL anon Viertl writes?** Yes. A grep of
`src/features/campaigns/` for `updateLicense`/`addNote`/`viertl_licenses`/`viertl_events` shows the
**only** write path is `rksvHandler.ts:39-79`. Deleting `rksvHandler.ts` and rewiring the wizard to
`submitOutcome` (which calls the service-role edge fn) removes every anon Viertl write from the
campaign feature. `saveRecipientPayload`/`markLanded` touch **only** `campaign_recipients` (the
recipient's own token-gated row, confirmed `campaignApi.ts:292-328`) — leaving them anon is
consistent with the offers `share_code` posture and is NOT the M2 concern. ✅

**Token validation soundness (can a caller pass someone else's token or a bogus outcome?):**
- The token is a `NOT NULL UNIQUE` column (migration line 59). The edge fn loads the row by
  `eq('token', token)` and the **server** picks `subject_id` from the loaded row, never from the
  client body. So a caller can only affect the single recipient/license its token maps to — exactly
  the blast-radius bound the review demanded, now enforced server-side (previously the client passed
  `recipient.subjectId` straight through). ✅ This is a genuine improvement over the anon handler.
- Bogus outcome: the plan validates `outcome` against an inlined terminal subset. **Correction C4
  (must-verify):** the plan says "validate against the same `CAMPAIGN_OUTCOMES` terminal subset —
  inline the array". Be precise: `CAMPAIGN_OUTCOMES` (`types.ts:22-27`) includes `offer_accepted`
  (Type B). The Type-A edge fn must accept **only** `authorized | quote_requested | soft_check` and
  reject `offer_accepted` (Type B is explicitly out of scope, and it would otherwise hit the Viertl
  write-back branch selection with no matching note). Inline a **3-value** terminal set, not the full
  `CAMPAIGN_OUTCOMES`. The plan's request body type already lists only the three — make the runtime
  guard match.
- **Correction C5 (minor):** the plan should also guard that the loaded recipient's
  `campaign.type === 'rksv_signature'` (or at least `subject_type === 'viertl_license'` before any
  Viertl write, which it does). Since a mesonic-customer or Type-B recipient could carry a valid
  token, gate the Viertl write-back on `subject_type === 'viertl_license'` (plan step 7 does this ✅)
  AND ignore/records-only for other subject types (plan handles via the `if` — good). No change
  needed beyond making sure the `outcome`-record step still runs for non-viertl subjects only if you
  want it to; simplest is: record outcome for the row unconditionally, do Viertl write-back only for
  `viertl_license`. Plan already says this. ✅

**Service-role key usage mirrors existing fns:** the plan copies `notify-viertl-closure`'s
`createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` admin pattern and the `viertl_events` insert
with sentinel actor. That is the correct precedent. **Correction C6 (must-do):** for the
`quote_requested` license update, the plan correctly notes it must send `updated_by_id/name` so the
audit trigger attributes the `hardware_needed` field-change (trigger reads `NEW.updated_by_id/name`,
migration line 112). Ensure the edge fn's `update` includes `updated_by_id:'campaign'`,
`updated_by_name:'RKSV-Kampagne'` — otherwise the trigger logs the change with NULL actor. The plan
states this in prose; make sure it's in the helper, not just the note insert.

**config.toml `verify_jwt=false`:** correct and necessary — the landing page is unauthenticated and
invokes with the anon key; the token in the body is the credential. Placement near the other public
fns matches convention. ✅ The plan's block comment is accurate.

**Client wiring:** `submitOutcome` via `supabase.functions.invoke('campaign-outcome', {body})` with
the anon client, error-body unwrap mirroring `sendCampaign` (`campaignApi.ts:456-462`), and mapping
the returned row via `rowToRecipient` — all consistent with existing code. The wizard rewrite
(replace `authorize/requestQuote/softCheck` imports with three `submitOutcome` calls) is a faithful
1:1 translation of the current terminal handlers. ✅

**`recordOutcome` fate:** keeping it (dead-but-tested) is the low-risk call. But note its existing
test at `campaignApi.test.ts:188` (`rejects an outcome outside the known set`) will keep passing.
Fine. Optionally the implementer could route the edge-fn's outcome-record through the same validation,
but that's server-side and separate. No action.

**M2 verdict:** the design removes all anon Viertl writes, the token is a sound credential, and the
service-role pattern is correct. Apply C4 (3-value terminal set, exclude `offer_accepted`) and C6
(`updated_by_*` on the license update). C5 is already handled.

---

## M3 — assessment: guard is correct for reload+resubmit; NOT airtight against concurrent double-submit

**Reload + resubmit (the review's actual scenario):** the same-value guard
`if (recipientRow.outcome === requestedOutcome) return {idempotent:true}` correctly short-circuits —
no re-stamp, no duplicate `viertl_events` note, no second `updateLicense`. Because the guard now sits
server-side in `applyOutcome` (a single chokepoint that also owns the note), it fixes the exact bug
the review described (the old client path couldn't guard the note — it was a separate `addNote` call).
✅ This is strictly better than guarding in `recordOutcome`.

**Different-outcome resubmit:** the plan's decision to let a genuinely different terminal outcome
through (record once, write back once) matches the wizard's real branch semantics and the review's
wording ("already set to the **same** terminal value"). Reasonable. Flag retained for sign-off. ✅

**Concurrent double-submit (the gap):** the guard is **read-then-write**, so two near-simultaneous
POSTs with the same token+outcome can both read `outcome === null`, both pass the guard, and both
insert a note → duplicate note, exactly the failure M3 exists to prevent. The plan explicitly
acknowledges this ("best-effort … a conditional UPDATE / unique index … out of scope, noted"). For a
single-recipient, human-paced landing page the practical risk is low (a double-tap is the realistic
trigger, and the in-page `busy` flag guards a single session). **Recommendation (not a blocker):**
make it cheaply airtight with a **conditional UPDATE as the claim**: do the outcome-stamp first as
`update(...).eq('token', token).is('outcome', null).select()` and treat "0 rows returned" as "someone
else already terminalized → return existing row, skip write-back". That converts the guard from
read-then-write to a single atomic compare-and-set with **no new migration** and no unique index, and
it also collapses the same-value idempotency case. If the team accepts the double-tap risk, the plan's
version is acceptable as-is, but I'd push for the conditional UPDATE since it's ~2 lines and removes
the only remaining hole. **Note:** the conditional-UPDATE approach changes the "different-outcome
resubmit" semantics to "first terminal wins" — if the team wants "genuine answer change reflected",
keep the read-then-write same-value guard and accept the concurrency caveat. Decide explicitly.

**M3 verdict:** fixes the stated bug (reload+resubmit) correctly. Concurrent double-submit remains a
small, acknowledged hole; recommend the conditional-UPDATE hardening but it's optional.

---

## Regression risk to the 1561 tests & resend-webhook attribution

- **`rksvWizard.test.ts` (18):** stays green — imports `parseVersion`/`versionOk`/`VERSION_THRESHOLD`
  from `../rksvWizard`; the re-export preserves the path. Verified the import line (`test:2`). ✅
- **`campaignApi.test.ts` (18):** `recordOutcome` kept → its two tests stay; `submitOutcome` tests are
  additive and the file already mocks `functions.invoke`. ✅ No churn.
- **`campaignAttribution.test.ts` (4):** untouched by these changes. **The resend-webhook attribution
  path is not modified by any of M1/M2/M3** — `campaign-outcome` is a new, separate fn; the webhook
  still stamps `sent/delivered/opened/clicked/bounced` on `campaign_recipients` and never reads
  `outcome`. No interaction, no regression. ✅
- **`rksvHandler.ts` deletion:** grep confirms no `rksvHandler.test.ts` exists and the only importer is
  `RksvWizard.tsx` (rewired). Deletion breaks no test. ✅
- **New MUST-FIX F1** is the one real test-suite risk: a mis-placed edge-fn test dir won't be collected
  by vitest. Placing the helper test on the `src/` side (like the existing attribution test) keeps it
  counted and green.

No path here touches offer tracking, the accept page, or the send-campaign fn, so the highest-risk
existing surface (resend-webhook offer attribution) is untouched.

---

## Summary of required changes to the plan

1. **F1 (must-fix):** put the new pure-helper test under `src/features/campaigns/__tests__/` (import
   the Deno helper cross-tree), NOT under `supabase/functions/campaign-outcome/__tests__/` — vitest
   won't collect the latter. Keep `outcomeWriteBack.ts` import-safe (no top-level Deno/esm.sh).
2. **C1 (must-fix):** don't stamp `versionOk: undefined` into the payload object; add the key
   conditionally (or assert with `toBeUndefined`, not `toStrictEqual`) so the M1 crux test passes.
3. **C4 (must-fix):** the edge-fn outcome allow-list is the **3-value** Type-A terminal set
   (`authorized|quote_requested|soft_check`), NOT the full `CAMPAIGN_OUTCOMES` (which includes Type-B
   `offer_accepted`).
4. **C6 (must-do):** the `quote_requested` `viertl_licenses` update must send
   `updated_by_id/name` = sentinel so the audit trigger attributes the `hardware_needed` change.
5. **C2/C3 (minor):** align `filterLicensesForSegment` with the real ViertlPage haystack fields and
   the `noEmailOnly` polarity; default `withEmailOnly=false` so the print segment is enrolled.
6. **M3 hardening (recommended, optional):** replace the read-then-write same-value guard with a
   conditional `update().is('outcome', null)` compare-and-set to close the concurrent double-submit
   hole with no migration — and decide the "first-terminal-wins vs. change-reflected" semantics
   explicitly.

Everything else in the plan (extraction + re-export of version helpers, service-role write-back
mirroring `notify-viertl-closure`, `verify_jwt=false` registration, keeping `recordOutcome`,
no new migration) is correct and well-grounded.
