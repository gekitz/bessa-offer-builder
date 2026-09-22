# Outreach Campaigns (Phases 1–4) — Code Review

**Reviewer:** automated code-review agent
**Scope reviewed:** the committed diff `main..worktree/clear-cloud-d0ca` (commits `17d6771`, `9b1560c`,
`f56c7e5`, `c263783`, `653f385`) against `docs/outreach-campaigns.md` and
`docs/outreach-campaigns-impl-plan.md`.
**Verdict:** ship with fixes.

---

## Verification (independently re-run, not trusted from the report)

| Check | Result |
|---|---|
| `npx vitest run` | **PASS** — 143 files / 1561 tests, 0 failures. New campaign tests present: `rksvWizard.test.ts` (18), `campaignApi.test.ts` (18), `campaignAttribution.test.ts` (4). |
| `npm run build` | **PASS** — built in ~4s. `CampaignLandingPage` is not force-bundled into the main chunk (it is a `lazyWithReload` import, same as `AcceptPage`). |
| `npx tsc --noEmit` | Type errors ONLY in 4 pre-existing test files (`OfferView.creator.test.tsx`, `BelegePanel.test.tsx`, `mesonicImport.test.ts`, `offerApi.test.ts`). **Zero** type errors in any new/changed campaign, routing, `App.jsx`, `sectionRoute.ts`, or `AppShell.jsx` file. Matches the implementer's claim. |

The reported test/build/typecheck status is accurate.

---

## What is correct and well-executed

- **Pure wizard module (`rksvWizard.ts`)** is genuinely pure (no React/supabase), and the branch table
  is exhaustively tested including the two subtle guards the plan called out: the zero-question fast
  path fires *only* when `hardwareNeeded===false AND versionOk===true`, and `hardwareNeeded===false`
  with unknown/false version correctly falls through to the Win10 question rather than over-trusting the
  un-triaged default. `parseVersion`/`versionOk` handle null/junk → `undefined` (unknown) cleanly.
- **`resend-webhook` regression risk is well-contained.** The attribution logic is extracted into a pure,
  exported `campaignAttribution.ts` helper and unit-tested. In `index.ts` it runs *before* the
  `email_events`-not-found 404 (correct — a campaign email has no `email_events` row and would otherwise
  404), early-returns on a campaign hit so `offers.status` is never touched, and only forward-advances
  timestamps (`!recip.<col>` guards → idempotent under duplicate webhook deliveries). The offer path is
  byte-for-byte unchanged below the insert point. The disjoint-namespace argument (`resend_id` lives on
  `campaign_recipients` OR in `email_events.metadata`, never both) holds. **No regression to existing offer
  tracking.**
- **Routing** adds a `?c=` branch that mirrors `?a=`/`?t=` exactly, with no query-param collision
  (`a`/`t`/`c` are distinct), lazy-loaded, no app shell, no auth — matches `AcceptPage`.
- **Convention adherence:** new files are `.ts`/`.tsx`; `Select` (custom) is used in `CampaignsPage`; the
  api module owns all snake↔camel mapping; the makeChain harness mirrors `viertlApi.test.ts`. Nav item,
  section route, aliases, and `config.toml` (`send-campaign` `verify_jwt=true`) all wired as planned.
- **AppShell test** does not assert the full NAV_ITEMS set (only per-item badge testids), so the added
  `kampagnen` item does not break it — verified by reading the test.

---

## Deviations from the plan (all defensible; noted for the record)

1. **Write-back moved from a DB trigger to a client handler (`rksvHandler.ts`).** The plan specified a
   `campaign_recipient_write_back()` PL/pgSQL trigger in the migration; the implementer dropped it and
   instead writes to `viertl_licenses`/`viertl_events` from `rksvHandler.ts` via the anon client under
   permissive RLS. This is a reasonable call (testable with the makeChain harness; the plan's own review
   flagged the trigger rationale as false) and the migration correctly omits the trigger. **See major
   finding #2 for the security implication this introduces.**
2. **`outcome` CHECK constraint dropped** from the migration; validated in `campaignApi.recordOutcome`
   against `CAMPAIGN_OUTCOMES`. Fine — a future type adds an outcome without a migration.
3. **`recordOutcome` also stamps `started_at` when null** so zero-question paths register as "started".
   Correct and matches the funnel intent.
4. **`send-campaign` stamps `sent_at` optimistically** before the Resend POST and clears it on failure.
   Documented; shrinks (does not close) the double-send window. Acceptable.
5. **Phase 4.4 enrolment-from-Viertl UI was not built** (see major finding #1).

---

## Findings

### Blockers
None. Tests and build pass; the resend-webhook change is safe for existing offers.

### Major

**M1 — The feature is not usable end-to-end from the UI (half-built; acknowledged).**
`CampaignsPage` can *list* campaigns, show the funnel, filter call-lists, send waves, resend, and export a
Druckliste — but there is **no UI to create a campaign or to enroll recipients**. The empty state literally
says campaigns must be created "über eine Migration bzw. das Enrolment (Viertl-Segment)", and Phase 4.4's
`enrollRecipients`-from-`listLicenses()` action exists only as an API + unit test, not a button. Net: to
actually run an RKSV campaign today, someone must hand-INSERT a `campaigns` row and hand-call
`enrollRecipients` (which itself has no caller). This is flagged as a follow-up by the implementer, but a
reviewer should be explicit that **Phases 1–4 are not operationally complete** — the back-office is a
read/send surface over data that nothing in the app produces. Recommend building the create+enroll action
(with the `payload.knownHardwareNeeded`/`payload.versionOk` snapshot the wizard depends on) before this
ships, or the wizard's `known` context will always be empty and every recipient will get the full
Win10 question path.

**M2 — Public/anon landing page now performs privileged write-backs to Viertl via the anon client.**
By moving the write-back into `rksvHandler.ts`, the *unauthenticated* landing page (`?c=`) now calls
`updateLicense(subjectId, {hardwareNeeded:true})` and `addNote(...)` directly against
`viertl_licenses`/`viertl_events` using the anon Supabase client. This works only because those tables have
permissive `FOR ALL USING(true)` RLS. Consequences:
- The public origin can now write arbitrary `viertl_licenses.hardware_needed=true` and insert arbitrary
  `viertl_events` for **any license UUID it can guess/knows** — the token gates *which recipient row* the
  page loads, but `rksvHandler` passes `recipient.subjectId` (the license UUID) straight into
  `updateLicense`/`addNote`. A crafted client that reuses a valid token but swaps the payload can only
  affect that recipient's own license, so practical blast radius is limited to the recipient's own row —
  but this is a genuine widening of what anon traffic touches versus today (today anon only reads offers by
  share_code and writes signatures to its own offer). It is consistent with the repo's stated posture, so
  it is **major, not a blocker** — but it should be a conscious sign-off, and ideally the write-back would
  run server-side (an edge fn with the service key, keyed by token) rather than from the browser. The
  plan's trigger approach, whatever its stated rationale, at least kept the write off the public client.

**M3 — Terminal write-back is not idempotent on re-submit → duplicate `viertl_events`.**
`recordOutcome` does not guard against an outcome already being set — it overwrites `outcome`/`outcome_at`
and re-merges payload every call. `rksvHandler.authorize/requestQuote/softCheck` then unconditionally call
`addNote(...)` (and `requestQuote` also re-calls `updateLicense`). If a recipient reaches a terminal step
and submits, then reloads the page and submits again (the in-page `busy` flag only guards a single session,
and `done` is derived from `recipient.outcome` which is stale on a fresh load only if they navigate back),
each submit appends another "RKSV-Kampagne: …" note to the Viertl timeline. The wizard's `done`-from-outcome
init mitigates the common case (revisit shows the done screen), but there is no server-side guard. Recommend
`recordOutcome` short-circuit when `current.outcome` is already the same terminal value (return the row
without re-writing), so the handler's notes fire at most once.

### Minor

**m1 — `enrollRecipients` skipped-count depends on PostgREST returning only inserted rows.**
`skipped = subjects.length - enrolled.length` relies on `upsert(rows, {ignoreDuplicates:true}).select('*')`
returning *only newly-inserted* rows (ON CONFLICT DO NOTHING). This is the documented supabase-js behaviour
and there is repo precedent for `ignoreDuplicates` upserts (`belegeApi.ts`), but the count is only correct
if that holds; the unit test asserts it against a mock that hard-codes the return, so the test cannot catch a
PostgREST version drift. Low impact now (no caller exists — see M1), but worth a note when the enroll UI is
built: verify the returned-row semantics against the live DB.

**m2 — `send-campaign` resend_count increment is read-modify-write and racy across concurrent waves.**
`patch.resend_count = (row.resend_count ?? 0) + 1` uses the row loaded at the top of the batch. Two
overlapping "Erneut senden" invocations for the same recipient could lose an increment. Self-flagged in the
fn header; acceptable given single-operator use, but a SQL `resend_count = resend_count + 1` (or an RPC)
would be safe. Not blocking.

**m3 — `send-campaign` at-least-once window is real (documented).** If the fn dies after the Resend POST
but before writing `resend_id`, a re-run resends (sent_at was stamped optimistically, so actually it would
be *skipped* on re-run — the optimistic stamp closes most of this; the residual is a crash *between* the
Resend call returning OK and the sent_at update, which cannot happen because sent_at is written *before*
the POST). Net: the design is sound; the header's "small residual window" comment slightly overstates the
risk. No action needed.

**m4 — `onOpenOffer` prop is wired in `OfferBuilderPage` but never invoked by `CampaignsPage`.** Dead until
Type B. Harmless; leave it.

**m5 — Landing page: `known` context is silently empty when enrollment didn't snapshot payload.** Because
enrollment isn't wired (M1), `recipient.payload.knownHardwareNeeded`/`versionOk` will be `undefined` in
practice, so every recipient gets the full Win10 question. That is a safe default (the wizard is designed
for it), but it means the "resolve server-side first / only ask what we can't compute" design goal is not
actually realized yet. Tie-off with M1.

**m6 — No test that `CampaignLandingPage`/`RksvWizard` render the correct step per `known`+payload.** The
pure wizard is exhaustively tested and the api is tested, but the React glue (step→component mapping,
terminal→handler wiring, done-from-outcome init) has no component test. Given the "high test coverage /
don't ask to click" mandate, a light render test of the dispatcher + one wizard branch would be warranted.
Not blocking (the load-bearing logic is the pure module, which is covered).

---

## Test-coverage assessment

- **Wizard branches:** fully covered, including the two guard edge cases and `parseVersion`/`versionOk`.
- **API mapping + funnel/outcome/enroll/dryRun/sendCampaign:** covered, mirrors `viertlApi.test.ts`.
- **Webhook attribution regression:** covered (hit stamps + early-return semantics, miss → `matched:false`,
  idempotent no-rewrite, per-event-type column mapping). This is the highest-risk change and it is guarded.
- **Gaps:** no component test for the wizard/landing glue (m6); the `enrollRecipients` skipped semantics and
  the send fn's DB side-effects are only asserted against mocks (m1, inherent to unit-testing edge/anon code).

---

## Recommendation

**Ship with fixes.** The engine, the Type-A wizard logic, the routing, and the resend-webhook change are
correct, safe for existing offers, and well-tested. Before this is operationally live, address **M1**
(build the create-campaign + enroll-recipients action — without it the back-office has no data and the
wizard's server-resolved context is always empty) and get a conscious sign-off on **M2** (anon landing
writing to Viertl), ideally moving that write-back server-side. **M3** (non-idempotent terminal write-back →
duplicate Viertl notes) is a small, self-contained fix worth doing now. The minors are follow-ups.
