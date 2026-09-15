# Outreach & Replacement Campaigns — Implementation Plan Review (adversarial)

**Reviewer role:** plan verifier. Scope reviewed: `docs/outreach-campaigns-impl-plan.md`
against the design doc `docs/outreach-campaigns.md` and the actual codebase on branch
`worktree/clear-cloud-d0ca`. No code or the plan itself was modified.

**Bottom line:** the plan is unusually well-grounded — nearly every cited path, function,
table, and column checks out against the real code, and the highest-risk change
(`resend-webhook`) is correctly understood. It is **approvable with a handful of required
corrections**. Two items are true blockers because they rest on a factually wrong premise
or would fail as written; the rest are majors/minors to fix before or during implementation.

---

## 1. Fact-check of cited paths / functions / tables / columns

All of the following were opened and confirmed to exist as claimed:

| Claim in plan | Verified? | Notes |
|---|---|---|
| `src/App.jsx` branches on `?a=` / `?t=` before `HashRouter`, uses `lazyWithReload` | ✅ | Exact shape matches (lines 29–45). Insert point for `?c=` is correct. |
| `lazyWithReload` helper in `src/lib/lazyWithReload` | ✅ | Imported in App.jsx and OfferBuilderPage. |
| `AcceptPage` is a public no-shell page reading via `getOfferByShareCode` | ✅ | `src/features/offers/pages/AcceptPage.jsx` imports the single `supabase` client + `getOfferByShareCode`. |
| `getOfferByShareCode` / `acceptOfferWithSignature` in `src/lib/offerApi.js` | ✅ | Lines 237, 283. |
| `viertlApi.ts` mapper/`requireSupabase` conventions | ✅ | `rowToLicense`, `updateToRow`, `requireSupabase()` all present. |
| `viertlApi.test.ts` `makeChain`/`fromMock` harness | ✅ | Present; see §5 for the passthrough-method gap. |
| `20260827120000_create_viertl_tracking.sql` — permissive RLS, `set_updated_at_now()` trigger, audit trigger | ✅ | Confirmed; RLS is `FOR ALL USING(true) WITH CHECK(true)`. |
| `set_updated_at_now()` "already exists in the DB — reuse, don't redefine" | ✅ | Defined once in `20260504120000_create_workforce.sql`; viertl only *uses* it. Reuse is correct. |
| `viertl_events` columns `(license_id, type, message, actor_id, actor_name)` | ✅ | Exact. **But** `type` has a CHECK constraint — see §4 (blocker). |
| `viertl_licenses.hardware_needed` boolean, `gastrotouch_version` text | ✅ | Confirmed; version is free text like `'67.24'`. |
| `resend-webhook` keys off `resend_id`, resolves `email_events → offer_id`, 404s if not found | ✅ | Exactly as described (lines 108–120). Critical for §2. |
| `notify-offer-accepted` = AFTER UPDATE trigger via pg_net (`20260714130000`) | ✅ | Real precedent; but the write-back trigger the plan proposes is a *different* shape (see §4). |
| `supabase/config.toml` has `[functions.resend-webhook] verify_jwt=false`; default is `true` | ✅ | Confirmed; `notify-viertl-closure` is absent → defaults to `verify_jwt=true`. |
| `tickets.id` / `offers.id` are UUID (FK targets) | ✅ | Both `UUID PRIMARY KEY`. FKs `ticket_id`/`offer_id` are valid. |
| Latest migration `20260909140000_add_offer_customer_uid.sql`; pick timestamp after it | ✅ | Correct. `20260915120000` is valid (and today is 2026-09-15). |
| `Select` component: `value:string`, `onChange:(v)=>void`, `options:{value,label,...}[]`, string-only | ✅ | `src/components/Select.tsx` matches. |
| `sectionRoute.ts` `AppSection` union + `SECTION_TO_PATH` + `PATH_ALIASES` | ✅ | Adding `'kampagnen'` in three places is correct. |
| `AppShell.jsx` `NAV_ITEMS` with `{id,label,icon,adminOnly?}` | ✅ | Confirmed; `Megaphone` is a valid lucide-react icon. |
| OfferBuilderPage `section === 'viertl'` render block ~line 1699 | ✅ | Confirmed (line 1699); wrapped in `React.Suspense` — the new block must do the same. |
| `PUBLIC_APP_URL` env in `send-offer`, `?a=${shareCode}` CTA, `from:` + deterministic Message-ID | ✅ | Lines 34, 58, 217, 220. `?c=${token}` + `<campaign-${id}@offer.kitz.co.at>` is consistent. |
| `count:'exact', head:true` funnel-count pattern | ✅ | Real precedent in `procurementApi.ts:319` + its test. |
| `crypto.randomUUID()` token precedent | ✅ | Used in `productApi.ts`, `OfferBuilderPage.jsx`. |

**No cited path/column was found to be missing or misnamed.** The plan's "reference files read"
list is accurate.

---

## 2. resend-webhook change — does it break existing offer attribution? (highest risk)

**Verdict: safe as designed, but ONE ordering detail is load-bearing and must be enforced, and
the change is UNTESTABLE as the function is currently written.**

The plan's understanding of the current function is correct:
- On a mapped event it looks up the `sent` `email_events` row by `metadata @> {resend_id}`,
  and **returns 404 if none is found** (lines 115–120), *before* touching `offers`.

The plan proposes an **additive campaign lookup on the same `resendEmailId`, tried first, with an
early return on hit.** This is correct and necessary:

- ✅ Namespaces are disjoint: campaign sends write `resend_id` only onto `campaign_recipients`;
  offer sends write it only into `email_events.metadata`. No collision.
- ✅ **The campaign lookup MUST run before the `email_events` 404 branch.** If it ran after, a
  campaign email (which has no `email_events` row) would hit the existing
  `return 404 'offer not found for email_id'` and the campaign funnel would never be stamped.
  The plan says "after the existing offer-resolution block (or before it, as a parallel
  lookup)" — **"after" is wrong**; it must be **before** the 404 return. Flag this as a hard
  requirement, not an either/or. (Recommendation below.)
- ✅ Forward-only timestamp guards (`!recip.opened_at` etc.) make duplicate webhook deliveries
  idempotent — matches the offer path's spirit.
- ✅ Early return prevents the `offers.status` mutation from running for campaign emails.

**Gap (major): the webhook logic is not unit-testable in its current form.** There are **zero**
edge-function tests in the repo (`find supabase -name '*test*'` → none). The `resend-webhook`
attribution is inline inside `serve()` and nothing is exported. The plan's Test Plan item 3
("a unit test for the new campaign branch") cannot be satisfied without first **extracting the
attribution into a pure, exported helper** (e.g. `attributeEvent(supabase, resendEmailId,
eventType, nowIso)` in a sibling `.ts`), then importing it from a Vitest test with a mocked
client. The plan hand-waves this ("if one exists; otherwise extract…"). Given the memory's
strong "tests are the only safety net" rule and that this is the single highest-risk change,
**the extraction + regression test (campaign hit stamps recipient & does NOT touch offers;
campaign miss runs the offer path unchanged) should be mandatory, not optional.**

---

## 3. Is the engine generic enough that Type B slots in later without a schema migration?

**Mostly yes, with two caveats.**

- ✅ Type-specific state is correctly isolated in `payload jsonb`. RKSV's `hasWin10`/`setupSize`/
  `signatureData` are payload keys; the tables carry no RKSV-only columns. Type B's
  `offer_id`/`ticket_id` are already generic columns. Good.
- ⚠️ **`outcome` CHECK constraint is not future-proof enough** and WILL force a migration for
  Type B — but that is *acceptable* since Type B is out of scope. The plan pre-includes
  `'offer_accepted'` in the CHECK (line 85 of the plan's DDL), so Type B's happy path is
  covered. But any *new* Type-B outcome (e.g. `'declined'`, `'offer_viewed'`) needs an
  `ALTER … DROP CONSTRAINT / ADD CONSTRAINT`. Same for `subject_type` (`viertl_license` |
  `mesonic_customer`) and `type` (`rksv_signature` | `pos_replacement`). This is a reasonable
  trade (CHECK constraints catch typos now) — but the plan's claim that "a new campaign type
  never migrates the schema" (echoing the design doc) is **overstated**: adding a type is fine,
  but adding a *new enum value* to any of the three CHECKs is a migration. Recommend either
  (a) documenting that new outcome/subject/type values are an expected small migration, or
  (b) dropping the CHECK on `outcome` specifically (it is the most type-variable) and validating
  it in the API layer instead. Minor.
- ✅ The `campaign_recipient_write_back()` trigger is guarded by `subject_type='viertl_license'`,
  so Type-B (`mesonic_customer`) rows fall through untouched and the `::uuid` cast is skipped for
  them. Genuinely generic. Good design.

---

## 4. The Type-A write-back trigger — TWO real problems

The plan (2.4 + §5 of its decisions) replaces an authed client write-back with a DB trigger
`campaign_recipient_write_back()` on `campaign_recipients`. Two issues:

### 4a. BLOCKER — the trigger inserts a `viertl_events` row that violates the CHECK constraint
The proposed trigger body does:
```sql
INSERT INTO viertl_events (license_id, type, message, actor_id, actor_name)
VALUES (NEW.subject_id::uuid, 'note', 'RKSV-Kampagne: ' || NEW.outcome, 'campaign', 'RKSV-Kampagne');
```
`viertl_events.type` has `CHECK (type IN ('field_change','note','email_sent','email_opened',
'offer_attached','viertl_notified'))`. `'note'` is valid, so *this* insert passes. **However**,
the trigger also does `UPDATE viertl_licenses SET hardware_needed = TRUE, updated_by_id='campaign',
…` for `quote_requested`. That UPDATE fires the **existing** `log_viertl_license_change()` audit
trigger, which will insert a `field_change` row for `hardware_needed` (valid type) — fine — **but
attributes it to `updated_by_name='RKSV-Kampagne'` via the `NEW.updated_by_*` the plan sets.**
That part actually works. The real defect: the plan's decision text claims the campaign note is
what makes it "distinguishable from a technician's confirmation," yet a *plain* `'note'` with
`actor_name='RKSV-Kampagne'` is only distinguishable by actor string, not by type — acceptable,
but see 4b for the deeper issue. **Net:** verify every `type` value the trigger writes is in the
CHECK set (currently only `'note'` is used, which is valid — so this is a *latent* trap for
whoever extends the trigger, not an immediate break). Downgrade to **major** on that basis;
the true blocker is 4b.

### 4b. BLOCKER — the stated rationale for the trigger ("anonymous landing can't call authed viertlApi") is FALSE, and the alternative it rules out would actually work — which matters because the trigger has a correctness cost the plan didn't weigh.
The app uses a **single** Supabase client (`src/lib/supabase.js`, anon key) whose auth token is
*only* present when a staff SSO session exists. RLS on `viertl_licenses`/`viertl_events` is
`FOR ALL USING(true) WITH CHECK(true)` — **fully permissive**. Therefore an anonymous
landing-page call to `updateLicense`/`addNote` would **succeed at the DB level** (there is no
policy denying anon writes). The plan's premise — *"the landing page is anonymous — it cannot
call the authed `updateLicense`/`addNote`"* — is **incorrect**. It *can*; the only thing missing
is a staff actor (`updated_by_id/name` would be null/`'campaign'`, which is exactly what the
trigger hard-codes anyway).

Why this matters (not just pedantry):
- The trigger approach couples the public funnel table to the Viertl schema at the DB layer and
  makes the write-back **invisible to the API/test surface** — you cannot unit-test it with the
  `makeChain` Vitest harness (it's Postgres PL/pgSQL). Given the "test business logic" rule, a
  handler-module write-back (called from the landing page, or better from an edge function) would
  be **testable**, whereas the trigger is not.
- A trigger firing a *second* trigger (`log_viertl_license_change`) on a nested UPDATE inside a
  public-initiated transaction increases the blast radius of the anonymous landing write.

**Recommendation:** either (a) keep the trigger but **correct the stated rationale** (the honest
reason is "no staff actor on the public page + keep the public page thin + atomic with the
outcome write" — not "RLS forbids it"), OR (b) do the write-back in the **Type-A handler module**
`rksvHandler.ts` calling a small dedicated API fn (testable), accepting the null actor. Given the
memory's testing mandate, (b) is more consistent with the codebase; if the trigger is kept, add a
note that it is deliberately untested infra and document the actor='campaign' sentinel. Either
way the **false premise must be struck** so reviewers don't approve it on wrong grounds.

### 4c. Minor — `updated_by_id='campaign'` is a TEXT column, fine; but the audit trigger will now emit a `field_change` row on *every* `quote_requested`, even if `hardware_needed` was already TRUE. `o IS DISTINCT FROM n` guards that (no-op if already true). Verified against `log_viertl_license_change`. OK.

---

## 5. Test-harness reality vs. plan

**Major (concrete): the `makeChain` mock passthrough list is too short for the queries the plan
introduces.** `viertlApi.test.ts` passthrough is
`['select','insert','update','delete','eq','in','order']`; procurement's adds `'gte','lte'`.
Neither includes: **`upsert`, `not`, `is`, `limit`, `contains`**. The plan's API needs:
- `enrollRecipients` → `.upsert(..., {onConflict, ignoreDuplicates})` — plan mentions adding
  `upsert` ✅ (only this one is called out).
- `getRecipientByToken` → `.eq('token',…).limit(1).maybeSingle()` — needs **`limit`** in
  passthrough (not currently present in either harness). `maybeSingle` exists. ❌ not called out.
- `listRecipients` filters → `.not('opened_at','is',null)`, `.is('outcome',null)`,
  `.lte('sent_at',…)` — needs **`not`** and **`is`** in passthrough. ❌ not called out.
- `getFunnelCounts` → `.select('*',{count:'exact',head:true})` — the mock's `then` resolves the
  `response` which can carry `count`; works, but the response fixture must include `count`.

None of these are hard, but the plan's "Add `upsert` to the passthrough" understates it: the
implementer must add `upsert, not, is, limit` (and possibly `contains`) or the tests won't even
run. Call it out explicitly.

**Minor:** there is **no existing DB-row `upsert`/`onConflict` precedent** in the app (only
Supabase Storage `upload(..., {upsert})`). `enrollRecipients` would be the first. Not a
blocker, but there's no pattern to mirror — the implementer should verify the
`{onConflict:'campaign_id,subject_type,subject_id', ignoreDuplicates:true}` shape against the
installed `@supabase/supabase-js` v2 API, and confirm that `ignoreDuplicates:true` returns
*only inserted* rows (needed for the `skipped = requested − inserted` math). With
`ignoreDuplicates`, PostgREST issues `ON CONFLICT DO NOTHING` and returns inserted rows only when
`.select()` is chained — verify the count semantics rather than assuming.

---

## 6. Idempotency — is "skip already-contacted" airtight?

**Mostly yes; one subtlety.**

- ✅ The unique index `uq_campaign_recipients_subject (campaign_id, subject_type, subject_id)` is
  the correct schema-level guarantee against enrolling a subject twice. Sound.
- ✅ Phase 4 partitions on `sent_at IS NULL` for "never contacted," and `resend===true` moves
  already-sent rows into `toSend`. The `dryRunSend` helper lives in `campaignApi.ts` → Node/Vitest
  testable. Good — this is the *right* place for the testable business logic (contrast the
  untestable trigger in §4).
- ⚠️ **Idempotency of the send itself under partial failure / retry is not addressed.** If
  `send-campaign` POSTs to Resend for row X, Resend succeeds, but the subsequent
  `update … set sent_at=now(), resend_id=…` fails (or the fn times out mid-batch), row X has
  `sent_at IS NULL` and a **re-run will double-send it** (Resend was already called). The unique
  index protects against duplicate *enrolment*, not duplicate *sends*. The design doc's
  "idempotent (never double-send within a campaign)" is therefore only *approximately* met.
  Mitigations to consider: stamp `sent_at` *before* the Resend call (optimistic) and clear it on
  failure, or make the per-recipient send tolerant of "already has resend_id." At minimum the
  plan should acknowledge the at-least-once nature of the send and the small double-send window.
  Major.
- ⚠️ `resend_count = resend_count + (resend?1:0)` in a raw update string won't work through
  supabase-js `.update({...})` (that sets a literal, it can't reference the column). The plan
  writes it as SQL-ish (`resend_count = resend_count + 1`), which is fine **inside the edge fn if
  done via an RPC or a read-then-write**, but a plain `.update({resend_count: <n>+1})` requires
  reading the current value first. Since the edge fn processes rows it has already `SELECT`ed,
  it can compute `row.resend_count + 1` — acceptable, but the plan's shorthand hides a
  read-modify-write that is racy under concurrent waves. Minor (concurrency on the same campaign
  by two staff simultaneously is unlikely, but note it).

---

## 7. Landing router integration into App.jsx

**Correct.** The `?a=`/`?t=` pattern is exactly as the plan describes (params parsed before
`HashRouter`, each returns a lazy public page in `<Suspense>`). The proposed `?c=` branch and
top-level `lazyWithReload` import mirror it precisely. Insert point ("after the `ticketShareCode`
block") is valid — order among the three doesn't matter since tokens are disjoint. No conflict
with the `#test` hash check (that's checked first and unrelated). ✅

One minor: the plan passes `token={campaignToken}` as a prop, matching `AcceptPage`'s
`shareCode={acceptCode}` convention. Consistent. ✅

---

## 8. Missing pieces / gaps checklist

- **RLS on new tables:** ✅ addressed — permissive policies mirror viertl. Correct for the anon
  landing read + staff writes. (Note the *security* posture: like the rest of the app, these
  tables are world-readable/writable to anyone with the anon key. That is the established
  project stance; the landing token is the only obscurity protecting a recipient row. Acceptable
  per precedent, but worth stating that a leaked `campaign_recipients` `select *` exposes every
  recipient's name/email — same class of exposure as `offers`. Minor, consistent with repo.)
- **Public (anon) landing access:** ✅ works via permissive RLS + single anon client. Confirmed
  the client has no auth session on the public page.
- **Token generation/uniqueness:** ⚠️ `crypto.randomUUID()` gives a 122-bit random token —
  effectively uncollidable, and `token` has a UNIQUE index as a backstop. But the plan does **not
  specify collision handling** if the UNIQUE insert ever fails (astronomically unlikely, but the
  edge fn should catch it and retry with a new token rather than 500 the whole wave). Minor. Also
  a bare UUID as `?c=` is guessable-space-safe but appears in email link logs / Resend dashboards
  — fine, same as `share_code` today.
- **Audit logging:** ✅ for Viertl write-back (via `viertl_events`). ⚠️ there is **no audit trail
  on the `campaigns`/`campaign_recipients` side** for who sent a wave (the `send-campaign` fn
  stamps `sent_at` but not "sent_by"). The design doc's engine bullet lists "audit log" — for
  Type A the Viertl event covers outcomes, but *sends* are unattributed. Consider a `sent_by_*`
  or a `campaign_events` table if send attribution matters. Minor (not in the doc's Phase 1–4
  hard requirements, but a genuine omission vs. the engine description).
- **`started_at` semantics:** the plan stamps `started_at` on first `saveRecipientPayload`. But
  the wizard may legitimately have **zero questions** (the `hardwareNeeded===false && versionOk`
  fast-path, or `hardwareNeeded===true` going straight to setup). In the zero-question authorize
  path, the customer lands and immediately hits "Auftrag erteilen" → `recordOutcome` may fire
  *without any* `saveRecipientPayload`, so `started_at` stays null even though they finished.
  The "started, didn't finish" (`started_unfinished`) call-list filter then can't regress, but the
  funnel's `started` count under-reports. Clarify: does `recordOutcome` also stamp `started_at`
  if null? The plan doesn't say. Major-ish for funnel accuracy; call it minor since it's a
  metrics edge, easily fixed by stamping `started_at` in `recordOutcome` too.

---

## 9. Convention violations

- ✅ **TypeScript for new files** — all new `.ts/.tsx`. Good.
- ✅ **Custom `Select`, never native** — the plan explicitly chooses **pill buttons** for the
  2-option wizard questions (per the "pills for ≤7 often-switched options" memo) and reserves
  `Select` for back-office pickers. This does **not** violate the "never native `<select>`" rule
  (buttons ≠ native select). Correct reading of the guidance. ✅
- ✅ **Pure business logic unit-tested** — `rksvWizard.ts` (+`parseVersion`) and `dryRunSend`
  partition logic are pure and testable. Good.
- ⚠️ **Untested business logic** — the **Viertl write-back** (DB trigger, §4) and the
  **webhook attribution** (inline in `serve()`, §2) are the two pieces that end up *outside* the
  testable surface. Both are load-bearing. This is the plan's main convention tension vs. the
  "tests are the only safety net" mandate. Push both toward testable helper modules.

---

## 10. Ambiguities the plan resolved — spot check

- **`hardwareNeeded===false` fast-path** — the plan's refinement (only skip when
  `hardwareNeeded===false && versionOk===true`, because `false` is the un-triaged default) is a
  **correct and important** catch. Verified against the seed data: the overwhelming majority of
  the 341 seeded rows are `hardware_needed=FALSE` and clearly un-triaged (default), so blindly
  trusting `false` as "ready" would mis-route most customers. Good defensive decision. ✅
- **`versionOk` snapshot at enroll, parse `gastrotouch_version >= 67.25`** — `gastrotouch_version`
  is free text (`'67.24'`, `'66.00'`, and some `NULL`). `parseVersion` must handle NULL → unknown
  and non-numeric gracefully. Plan says `parseVersion` is pure+tested — ensure the test covers
  `NULL`, `'66.00'`, `'67.24'`, `'67.25'`, and junk. Called out in the plan's test list. ✅
- **`email_template` inline HTML** — reasonable for a single letter. ✅
- **`send-campaign` `verify_jwt=true`** — correct (staff-invoked); matches `mesonic-proxy`
  precedent. The authed client auto-attaches the SSO session JWT via `functions.invoke`
  (confirmed `notifyViertlClosure` relies on the same implicit behavior). ✅

---

## Prioritized recommendations

1. **(Blocker, §2)** State as a hard requirement that the campaign lookup in `resend-webhook`
   runs **before** the existing `email_events` 404 return, and **extract the attribution into an
   exported pure helper** so it can be unit-tested (there is no edge-fn test harness today).
2. **(Blocker, §4b)** Strike the false premise "anonymous landing can't call authed viertlApi"
   (permissive RLS + single anon client means it *can*). Re-justify the write-back mechanism on
   honest grounds (no staff actor / thin public page / atomicity), and prefer a **testable
   handler-module write-back** over the untestable PL/pgSQL trigger — or explicitly document the
   trigger as deliberate untested infra with the `actor='campaign'` sentinel.
3. **(Major, §5)** Expand the test mock `passthrough` to include `upsert, not, is, limit`
   (not just `upsert`), or the Phase 1/3 API tests won't run.
4. **(Major, §6)** Address the send double-send window under partial failure/retry (stamp
   `sent_at` before the Resend call, or make per-row send tolerant of an existing `resend_id`);
   acknowledge the send is at-least-once, not exactly-once.
5. **(Major, §2/§9)** Make the webhook + write-back testability explicit deliverables, per the
   "tests are the only safety net" rule.
6. **(Minor, §3)** Soften the "a new type never migrates the schema" claim — new enum values on
   the `type`/`subject_type`/`outcome` CHECKs *are* migrations; consider dropping the `outcome`
   CHECK and validating in the API.
7. **(Minor, §8)** Decide whether `recordOutcome` should also stamp `started_at` (zero-question
   paths otherwise under-count the funnel's `started`); add send attribution (`sent_by_*`) if the
   engine's "audit log" bullet is to be honored for sends.
8. **(Minor, §6)** Note the `resend_count` increment is a read-modify-write (racy under
   concurrent waves); compute from the already-selected row.
9. **(Minor, §5)** Verify `upsert(..., {ignoreDuplicates:true}).select()` returns only inserted
   rows so `skipped = requested − inserted` holds — no existing precedent to copy.

Overall the plan is faithful to the codebase and safe to implement once items 1–4 are corrected.
