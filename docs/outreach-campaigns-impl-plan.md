# Outreach & Replacement Campaigns — Implementation Plan (Phases 1–4)

**Scope:** the generic campaign engine + **Type A (RKSV signature card)** only.
Phases 1–4 of `docs/outreach-campaigns.md`. Type B (PoS replacement, Phase 5) and
Phase 6 pre-classification are **out of scope** but the engine must not preclude them.

This plan is grounded in the real codebase. Key reference files read while writing it:
- `src/features/viertl/{types.ts,api/viertlApi.ts,api/__tests__/viertlApi.test.ts,pages/ViertlPage.tsx}`
- `supabase/migrations/20260827120000_create_viertl_tracking.sql`
- `src/App.jsx` (public `?a=` / `?t=` branches), `src/features/offers/pages/AcceptPage.jsx`
- `src/lib/offerApi.js` (`getOfferByShareCode`, `acceptOfferWithSignature`)
- `supabase/functions/{send-offer,resend-webhook,notify-viertl-closure}/index.ts`
- `supabase/config.toml`, `src/components/Select.tsx`, `src/components/AppShell.jsx`, `src/lib/sectionRoute.ts`

---

## 0. Conventions verified from the codebase (bind the implementer)

- **New files are TypeScript** (`.ts`/`.tsx`), even in JS-heavy dirs. `campaignApi.ts`,
  `types.ts`, `rksvWizard.ts`, all tests are `.ts`; React pages/components are `.tsx`.
- **Custom `Select` only** — `import Select from '../../../components/Select'`. Props:
  `value: string`, `onChange: (v: string) => void`, `options: {value,label,hint?,disabled?}[]`,
  `size?: 'sm'|'md'`, `ariaLabel?`, `className?`. **String values only** (numeric callers
  `String()`/`Number()` at the boundary). Never a native `<select>`.
- **snake_case↔camelCase mapping lives ONLY in the api module** (mirror `viertlApi.ts`:
  `rowTo*()` mappers + `*ToRow()` for updates; ISO strings for timestamps).
- **RLS is permissive** everywhere (`FOR ALL USING (true) WITH CHECK (true)`), matching
  `offers`/`viertl_licenses`. The anon supabase client can therefore read a
  `campaign_recipients` row by token directly from the public landing page, exactly as
  `AcceptPage` reads `offers` by `share_code` via `getOfferByShareCode`.
- **Tests**: pure logic (`rksvWizard.ts`) gets exhaustive unit tests; the api module gets a
  per-table chainable-mock test that mirrors `viertlApi.test.ts` (the `makeChain` harness).
- **Edge functions deploy manually.** Do not attempt to deploy. Each new fn needs a block in
  `supabase/config.toml` choosing `verify_jwt`.
- **Migration filenames**: `supabase/migrations/<UTC-timestamp>_name.sql`. Latest existing is
  `20260909140000_add_offer_customer_uid.sql`. Pick timestamps strictly after it (below).
- **Actor pattern**: staff auth is `user_profiles` via `useAuth()` (see `ViertlPage` →
  `ViertlActor { id, name }`). Denormalized `*_by_id/_by_name` on writes, like viertl.

---

## Phase 1 — Engine data model + generic API

### 1.1 Migration — `supabase/migrations/20260915120000_create_campaigns.sql`

Two tables (`campaigns`, `campaign_recipients`) replacing the earlier single-table idea.
Follow the viertl migration's style: permissive RLS, `set_updated_at_now()` trigger (that
function already exists in the DB from the viertl migration — reuse it, do not redefine).

```
CREATE TABLE campaigns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type           TEXT NOT NULL
                 CHECK (type IN ('rksv_signature','pos_replacement')),
  key            TEXT NOT NULL UNIQUE,          -- e.g. '2026-acos'
  title          TEXT NOT NULL,
  email_subject  TEXT,
  email_template TEXT,                          -- template id or inline body (see 1.1a)
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','active','archived')),
  created_by_id   TEXT,
  created_by_name TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE campaign_recipients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  subject_type   TEXT NOT NULL
                 CHECK (subject_type IN ('viertl_license','mesonic_customer')),
  subject_id     TEXT NOT NULL,                 -- id/kdnr in the source; used for write-back
  name           TEXT,                          -- snapshot at send time
  email          TEXT,                          -- snapshot; NULL ⇒ no-email/print segment
  batch          TEXT,                          -- wave label; funnel sliced per batch
  resend_count   INT NOT NULL DEFAULT 0,
  token          TEXT NOT NULL UNIQUE,          -- landing URL ?c={token}
  sent_at        TIMESTAMPTZ,
  delivered_at   TIMESTAMPTZ,
  opened_at      TIMESTAMPTZ,
  clicked_at     TIMESTAMPTZ,
  landed_at      TIMESTAMPTZ,
  started_at     TIMESTAMPTZ,                   -- stamped when the wizard's first answer lands
  outcome        TEXT
                 CHECK (outcome IN ('authorized','quote_requested','soft_check','offer_accepted')),
  outcome_at     TIMESTAMPTZ,
  bounced_at     TIMESTAMPTZ,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- type-specific answers/state
  ticket_id      UUID REFERENCES tickets(id) ON DELETE SET NULL,
  offer_id       UUID REFERENCES offers(id)  ON DELETE SET NULL,
  resend_id      TEXT,                          -- webhook attribution (Resend email id)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Indexes:
```
CREATE INDEX idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
-- idempotency lookup: "already contacted in this campaign for this subject"
CREATE UNIQUE INDEX uq_campaign_recipients_subject
  ON campaign_recipients(campaign_id, subject_type, subject_id);
-- webhook attribution keys off resend_id (see Phase 3)
CREATE INDEX idx_campaign_recipients_resend ON campaign_recipients(resend_id)
  WHERE resend_id IS NOT NULL;
CREATE INDEX idx_campaign_recipients_batch ON campaign_recipients(campaign_id, batch);
CREATE INDEX idx_campaign_recipients_outcome ON campaign_recipients(campaign_id, outcome);
```
(`token` gets a unique index implicitly via `UNIQUE`.)

Triggers + RLS (mirror viertl migration exactly):
```
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();
CREATE TRIGGER trg_campaign_recipients_updated_at BEFORE UPDATE ON campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

ALTER TABLE campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on campaigns" ON campaigns
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on campaign_recipients" ON campaign_recipients
  FOR ALL USING (true) WITH CHECK (true);
```

**Decision (`uq_campaign_recipients_subject`):** the unique index on
`(campaign_id, subject_type, subject_id)` is the schema-level guarantee behind Phase 4's
idempotency ("never double-send within a campaign"). A deliberate follow-up bumps
`resend_count` on the *existing* row rather than inserting a new one, so the constraint holds.

**1.1a Decision (email_template):** the doc says "template id or inline body". For Type A there
is a single RKSV letter, so `email_template` holds an **inline HTML body string** (rep-editable
per campaign), and the `send-campaign` fn wraps it in the same KITZ chrome that `send-offer`
uses (header/footer/signature). No separate template registry is built now; a future type can
switch on `campaign.type` inside the fn. Flagged in Open Decisions.

### 1.2 `src/features/campaigns/types.ts`

Generic engine types + Type-A payload/outcome union. camelCase + ISO strings.

```ts
export type CampaignType = 'rksv_signature' | 'pos_replacement';
export type CampaignStatus = 'draft' | 'active' | 'archived';
export type SubjectType = 'viertl_license' | 'mesonic_customer';
export type CampaignOutcome =
  | 'authorized' | 'quote_requested' | 'soft_check' | 'offer_accepted';

export interface Campaign {
  id: string;
  type: CampaignType;
  key: string;
  title: string;
  emailSubject: string | null;
  emailTemplate: string | null;
  status: CampaignStatus;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  subjectType: SubjectType;
  subjectId: string;
  name: string | null;
  email: string | null;
  batch: string | null;
  resendCount: number;
  token: string;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  landedAt: string | null;
  startedAt: string | null;
  outcome: CampaignOutcome | null;
  outcomeAt: string | null;
  bouncedAt: string | null;
  payload: Record<string, unknown>;   // typed per-handler; see RksvPayload
  ticketId: string | null;
  offerId: string | null;
  resendId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignActor { id: string | null; name: string | null; }

// ── Type A (RKSV) payload — the wizard's persisted answers/state ──
export interface RksvPayload {
  hasWin10?: 'ja' | 'nein' | 'weiss_nicht';   // self-reported precondition
  setupSize?: 'einzelplatz' | 'mehrplatz';
  signatureData?: string;                       // data-URL, price-free authorization
  signedByName?: string;
}
```

Filter/rollup types (Phase 3) live here too (see 3.2): `CampaignFunnelCounts`,
`CampaignRecipientFilter`.

### 1.3 `src/features/campaigns/api/campaignApi.ts`

Generic (type-agnostic) CRUD + funnel/outcome side-effects. Mirrors `viertlApi.ts`
(`requireSupabase()`, `rowTo*` mappers, `*ToRow` update mapper). **No Type-A logic here** —
that lives in the handler (2.4).

Row mappers:
```ts
function rowToCampaign(r): Campaign          // snake→camel, all columns above
function rowToRecipient(r): CampaignRecipient
```

Functions (signatures):
```ts
// Campaigns
listCampaigns(): Promise<Campaign[]>
getCampaign(id: string): Promise<Campaign | null>
createCampaign(input: {
  type: CampaignType; key: string; title: string;
  emailSubject?: string | null; emailTemplate?: string | null;
}, actor: CampaignActor): Promise<Campaign>

// Recipients — list + funnel
listRecipients(campaignId: string, opts?: {
  batch?: string;                    // slice per wave
  filter?: CampaignRecipientFilter;  // 'opened_not_acted' | 'started_unfinished' | 'not_opened' | 'all'
  notOpenedDays?: number;            // for 'not_opened' bucket
}): Promise<CampaignRecipient[]>

getFunnelCounts(campaignId: string, batch?: string): Promise<CampaignFunnelCounts>

// Enrolment (used by Phase 4 send + back-office selection). Idempotent:
// upsert on (campaign_id, subject_type, subject_id); returns {inserted, skipped}.
enrollRecipients(campaignId: string, subjects: Array<{
  subjectType: SubjectType; subjectId: string;
  name: string | null; email: string | null; batch: string;
}>): Promise<{ enrolled: CampaignRecipient[]; skipped: number }>

// Public landing (anon client, by token). Mirrors getOfferByShareCode.
getRecipientByToken(token: string): Promise<CampaignRecipient | null>
// Stamp landed_at once (idempotent — only if null).
markLanded(token: string): Promise<CampaignRecipient>
// Persist wizard answers into payload (shallow-merge) + stamp started_at on first write.
saveRecipientPayload(token: string, patch: Record<string, unknown>): Promise<CampaignRecipient>
// Terminal outcome from the landing page (public). Stamps outcome + outcome_at,
// merges final payload (e.g. signature). Type-specific write-back is done by the
// handler's onOutcome (2.4), NOT here.
recordOutcome(token: string, outcome: CampaignOutcome, patch?: Record<string, unknown>):
  Promise<CampaignRecipient>

// Back-office link fields set after handler side-effects (ticket/offer).
linkRecipientTicket(recipientId: string, ticketId: string): Promise<CampaignRecipient>
linkRecipientOffer(recipientId: string, offerId: string): Promise<CampaignRecipient>
```

Notes on behaviour to encode:
- `token` generation for `enrollRecipients`: `crypto.randomUUID()` (browser) — a plain unique
  opaque string; nothing type-specific. The **send** fn (Phase 4) may also mint tokens, so the
  helper is shared: put `newToken()` in `src/features/campaigns/lib/token.ts` and reuse in the
  edge fn (Deno has `crypto.randomUUID()` too).
- `enrollRecipients` upserts with `onConflict: 'campaign_id,subject_type,subject_id',
  ignoreDuplicates: true` then re-selects to compute `skipped = requested − inserted`.
- `markLanded`/`saveRecipientPayload`/`recordOutcome` operate **by token** (anon-safe) and only
  advance funnel timestamps forward (never overwrite a set `landed_at`). `saveRecipientPayload`
  sets `started_at = now()` only when currently null (this is the "started" funnel state).
- `getFunnelCounts` computes rollups with count queries (see 3.2 for exact buckets).

### 1.4 Test — `src/features/campaigns/api/__tests__/campaignApi.test.ts`

Mirror `viertlApi.test.ts`: copy the `makeChain`/`fromMock` harness (per-table chainable mock),
`vi.mock('../../../../lib/supabase', …)`. Add `upsert` to the `passthrough` method list.
Cases:
1. `rowToRecipient` maps every snake_case column → camelCase (assert `subjectType`, `resendId`,
   `landedAt`, `payload` object passthrough).
2. `createCampaign` sends `created_by_id/name` from the actor and the CHECK-valid `type`.
3. `enrollRecipients` calls `upsert` with `onConflict: 'campaign_id,subject_type,subject_id'`
   and `ignoreDuplicates:true`; computes `skipped`.
4. `saveRecipientPayload` shallow-merges into `payload` and sets `started_at` only when null
   (stub the current row via the select in the chain).
5. `recordOutcome` writes `outcome` + `outcome_at` and merges the terminal patch.
6. `getFunnelCounts` issues the count queries and returns the rollup shape.
7. `getRecipientByToken` filters `.eq('token', …)`.

---

## Phase 2 — Landing router + Type A wizard

### 2.1 Router hook in `src/App.jsx` (next to `?a=` / `?t=`)

`App.jsx` already branches on `URLSearchParams` **before** `HashRouter`. Add a `?c=` branch
identical in shape to the `?a=` accept branch. Lazy-load with the same `lazyWithReload` helper
so it stays out of the main bundle (like `AcceptPage`).

Insert after the `ticketShareCode` block (around line 45):
```jsx
const campaignToken = search.get('c');
if (campaignToken) {
  return (
    <React.Suspense fallback={<div className="p-8 text-center">Wird geladen...</div>}>
      <CampaignLandingPage token={campaignToken} />
    </React.Suspense>
  );
}
```
And at the top with the other lazy imports:
```jsx
const CampaignLandingPage = lazyWithReload(
  () => import('./features/campaigns/pages/CampaignLandingPage')
);
```
This is a public, no-app-shell page (no auth), exactly like `AcceptPage`. It uses the anon
supabase client already exported from `src/lib/supabase`.

### 2.2 `src/features/campaigns/pages/CampaignLandingPage.tsx` (dispatcher)

Public page tree:
1. On mount: `getRecipientByToken(token)`; if not found → friendly "Link ungültig/abgelaufen"
   state (mirror AcceptPage's error rendering).
2. `markLanded(token)` (fire-and-forget, stamps `landed_at`).
3. Load the parent `getCampaign(recipient.campaignId)`, read `campaign.type`.
4. Dispatch:
   - `rksv_signature` → `<RksvWizard recipient={…} campaign={…} />` (2.3).
   - `pos_replacement` → **not built in this scope**; render a neutral placeholder
     ("in Vorbereitung"). The `switch` exists so Type B slots in later.

Wrap everything in the same centered card chrome AcceptPage uses (KITZ header, no nav).

### 2.3 `src/features/campaigns/pages/rksv/RksvWizard.tsx` (Type-A landing component)

Thin React shell around the **pure** `rksvWizard.ts` (2.5). Holds `answers` state
(`RksvPayload`), computes `nextStep(known, answers)` on each render, renders the step, and on
each answer calls `saveRecipientPayload(token, patch)` (stamps `started_at`). On a terminal
step it calls the terminal action (2.4). Uses `Select` for the setup-size question if presented
as a dropdown, but per the memo pill preference and ≤7 options these are better as **pill
buttons** (2 options, one tap) — implement as buttons, not `Select`. (The Select rule forbids
native `<select>`; buttons are fine and preferred here.)

`known` is computed server-derived context passed from the recipient/campaign:
```ts
const known: RksvKnown = {
  // V67.25 resolved from the Viertl row's gastrotouchVersion at ENROLL time and
  // snapshotted into recipient.payload by the handler; OR recomputed here from
  // subjectId. Simplest: handler writes payload.knownHardwareNeeded + payload.versionOk
  // at enroll. Landing reads them out of recipient.payload.
  hardwareNeeded: recipient.payload.knownHardwareNeeded as boolean | undefined,
  versionOk: recipient.payload.versionOk as boolean | undefined,
};
```
**Decision (where `known` comes from):** the design says "Resolve server-side first: V67.25
from `viertl_licenses.gastrotouchVersion`; if `hardwareNeeded` is known-true skip to
setup-size." We resolve this **at enroll time** (Phase 4 send / back-office enroll), writing
`payload.knownHardwareNeeded` (from `viertl_licenses.hardware_needed`) and
`payload.versionOk` (parse `gastrotouch_version >= 67.25`) into the recipient row. The landing
page is then a pure function of the snapshot — no live Viertl read needed on the public page,
and no auth needed to reach Viertl data. This also keeps the wizard reproducible/testable.

### 2.4 `src/features/campaigns/lib/rksvHandler.ts` (Type-A `onOutcome` write-back)

The type-specific glue. Called by `RksvWizard` on a terminal action. Three terminal actions map
to three outcomes; each does: (a) `recordOutcome(token, outcome, patch)` via `campaignApi`,
then (b) write back to the Viertl row + append a `viertl_event`.

| terminal | outcome | payload written | Viertl write-back |
|---|---|---|---|
| "Auftrag erteilen" (ready) | `authorized` | `signatureData`, `signedByName` | `viertl_event` type `note`, message "RKSV Auftrag erteilt (Kampagne)"; optionally `status='replied'` |
| "Angebot anfordern" (hardware) | `quote_requested` | `hasWin10:'nein'`, `setupSize` | `updateLicense(licenseId,{hardwareNeeded:true},actor)` (self-reported) + note "Angebot angefordert (Kampagne)" |
| "Weiß nicht" (soft-check) | `soft_check` | `hasWin10:'weiss_nicht'` | `viertl_event` note "Remote-OS-Check angefordert (Kampagne)" |

**Auth constraint:** the landing page is **anonymous** — it cannot call the authed
`updateLicense`/`addNote` in `viertlApi` (those need a `user_profiles` actor and go through the
authed client). The write-back must therefore run **server-side**. Decision:

- The public page only calls `campaignApi.recordOutcome(token, outcome, patch)` (anon-safe,
  RLS permissive) to stamp the funnel + payload.
- A DB trigger `AFTER UPDATE ON campaign_recipients` (fired when `outcome` transitions from NULL
  to a terminal value) performs the Viertl write-back for `subject_type='viertl_license'`.
  Because the trigger runs with table access regardless of the anon caller, it can update
  `viertl_licenses` and insert `viertl_events`. This mirrors the existing
  `20260714130000_notify_offer_accepted.sql` pattern (trigger reacts to a status change) and
  the viertl audit trigger. **This trigger is added in the Phase 1 migration** (it is generic
  infra) but its body is Type-A aware:

```sql
-- in 20260915120000_create_campaigns.sql
CREATE OR REPLACE FUNCTION campaign_recipient_write_back() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.outcome IS DISTINCT FROM OLD.outcome AND NEW.outcome IS NOT NULL
     AND NEW.subject_type = 'viertl_license' THEN
    -- self-reported hardware need on a quote request
    IF NEW.outcome = 'quote_requested' THEN
      UPDATE viertl_licenses SET hardware_needed = TRUE,
             updated_by_id = 'campaign', updated_by_name = 'RKSV-Kampagne'
        WHERE id = NEW.subject_id::uuid;
    END IF;
    INSERT INTO viertl_events (license_id, type, message, actor_id, actor_name)
    VALUES (NEW.subject_id::uuid, 'note',
            'RKSV-Kampagne: ' || NEW.outcome, 'campaign', 'RKSV-Kampagne');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_campaign_recipient_write_back
  AFTER UPDATE ON campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION campaign_recipient_write_back();
```
Note `subject_id` for `viertl_license` is the license **UUID** (cast). (For
`mesonic_customer` it will be the kdnr text — the trigger's `viertl_license` guard avoids the
cast for those.) The `updateLicense` audit trigger already logs the `hardware_needed` change;
we add the explicit note for the human-readable timeline.

**Distinguishable from a technician's confirmation:** the write-back uses
`actor_name='RKSV-Kampagne'`, so self-reported answers are visually distinct from a technician's
CRM-TeamViewer confirmation in the viertl_events log (design requirement).

### 2.5 `src/features/campaigns/lib/rksvWizard.ts` (PURE — the branch module)

The exhaustively-tested pure function. No React, no supabase.

```ts
export interface RksvKnown {
  hardwareNeeded?: boolean;   // from viertl_licenses.hardware_needed (undefined = unknown)
  versionOk?: boolean;        // gastrotouch_version >= 67.25 (undefined = unknown)
}
export interface RksvAnswers {
  hasWin10?: 'ja' | 'nein' | 'weiss_nicht';
  setupSize?: 'einzelplatz' | 'mehrplatz';
}

export type RksvStep =
  | { kind: 'question'; id: 'has_win10' }        // "Haben Sie eine Kasse mit Windows 10?"
  | { kind: 'question'; id: 'setup_size' }       // Einzelplatz | Mehrplatz
  | { kind: 'terminal'; id: 'authorize' }        // "Auftrag erteilen" (price-free signature)
  | { kind: 'terminal'; id: 'request_quote' }    // "Angebot anfordern"
  | { kind: 'terminal'; id: 'soft_check' };      // "Das prüfen wir für Sie"

export function nextStep(known: RksvKnown, answers: RksvAnswers): RksvStep;
```

**Branch logic (exhaustive):**

1. **hardwareNeeded known-true** (`known.hardwareNeeded === true`):
   → skip the Win10 question; the customer needs new hardware.
   - if `answers.setupSize` unset → `{question, setup_size}`
   - else → `{terminal, request_quote}`  (they need a priced offer for the new HW)

2. **hardware unknown** (`known.hardwareNeeded` is `undefined` or `false`):
   ask "Haben Sie eine Kasse mit Windows 10?"
   - `answers.hasWin10` unset → `{question, has_win10}`
   - `hasWin10 === 'ja'` → ready → `{terminal, authorize}`
   - `hasWin10 === 'nein'` → needs new HW → setup-size branch:
     - `setupSize` unset → `{question, setup_size}`
     - else → `{terminal, request_quote}`
   - `hasWin10 === 'weiss_nicht'` → `{terminal, soft_check}`

`known.versionOk` is **informational context** the handler/landing uses to phrase copy (and to
decide whether the "your software is current" line shows); it does not gate the wizard branches
in this scope — the precondition the customer answers is the Win10 question. Decision recorded
in Open Decisions: *`versionOk` is snapshotted and shown but does not branch* (the doc's flow
only branches on hardware/Win10; version is resolved server-side to phrase the message, not to
route). If the implementer wants version to hard-gate, it would slot in as a pre-step before
step 2 — but that is not what the doc's diagram shows.

**Decision (hardwareNeeded === false):** the doc says *"Current version + `hardwareNeeded==false`
→ 'Auftrag erteilen' with zero questions."* But `hardware_needed=false` in Viertl is the
**default** (most rows are false and simply un-triaged), so treating every false as "ready, zero
questions" would wrongly skip the Win10 check for untriaged customers. **Resolution:** only skip
to `authorize` with zero questions when **both** `hardwareNeeded === false` **and**
`versionOk === true` are known. Implement as a guard at the very top:
```
if (known.hardwareNeeded === false && known.versionOk === true && !answers.hasWin10)
  return { kind:'terminal', id:'authorize' };
```
Otherwise fall through to the Win10 question (step 2). This honours the doc's "only ask what we
can't compute" while not over-trusting the default-false. Flagged in Open Decisions.

### 2.6 Test — `src/features/campaigns/lib/__tests__/rksvWizard.test.ts`

Exhaustive `nextStep` table. Cases:
- `hardwareNeeded:true` + no setupSize → `setup_size`; + setupSize → `request_quote`.
- unknown hardware, no answer → `has_win10`.
- `hasWin10:'ja'` → `authorize`.
- `hasWin10:'nein'`, no setupSize → `setup_size`; + setupSize einzelplatz → `request_quote`;
  + mehrplatz → `request_quote`.
- `hasWin10:'weiss_nicht'` → `soft_check`.
- zero-question fast path: `hardwareNeeded:false` + `versionOk:true` → `authorize`.
- `hardwareNeeded:false` + `versionOk` unknown → falls through to `has_win10` (NOT authorize).
- `hardwareNeeded:false` + `versionOk:false` → `has_win10`.
- idempotent/monotonic: re-calling with the same answers returns the same step.

---

## Phase 3 — Tracking + funnel back-office

### 3.1 `resend-webhook` change — attribute open/click to campaign_recipients

**Current mechanics** (`supabase/functions/resend-webhook/index.ts`): on a Resend event it
looks up the originating `email_events` row with `event_type='sent'` and
`metadata @> { resend_id: <email_id> }`, resolves `offer_id` (+ `activity_id`), inserts a new
`email_events` row, and updates the `offers.status`. Attribution is keyed off `resend_id`.

**Change — additive, must NOT break offer attribution.** After the existing offer-resolution
block (or before it, as a parallel lookup), add a campaign lookup keyed off the **same**
`resendEmailId`:

```ts
// campaign attribution — additive; a given resend_id belongs to EITHER an
// offer send (email_events) OR a campaign send (campaign_recipients.resend_id),
// never both. Try campaign first; if it hits, stamp the funnel and return.
const { data: recip } = await supabase
  .from('campaign_recipients')
  .select('id, opened_at, clicked_at, delivered_at, bounced_at')
  .eq('resend_id', resendEmailId)
  .limit(1)
  .maybeSingle();

if (recip) {
  const patch: Record<string, string> = {};
  if (eventType === 'delivered' && !recip.delivered_at) patch.delivered_at = nowIso;
  if (eventType === 'opened'    && !recip.opened_at)    patch.opened_at    = nowIso;
  if (eventType === 'clicked'   && !recip.clicked_at)   patch.clicked_at   = nowIso;
  if (eventType === 'bounced'   && !recip.bounced_at)   patch.bounced_at   = nowIso;
  if (Object.keys(patch).length) {
    await supabase.from('campaign_recipients').update(patch).eq('id', recip.id);
  }
  return new Response(JSON.stringify({ success: true, campaign: true }), {...});
}
// …fall through to existing offers/email_events attribution unchanged…
```

Why this is safe:
- The lookup namespace is separate: campaign sends write `resend_id` only onto
  `campaign_recipients` (Phase 4); offer sends write it only into `email_events.metadata`. A
  `resend_id` never collides across the two.
- If the campaign lookup misses (`recip` null), the function proceeds to the **unchanged**
  offer path — existing behaviour and its tests are untouched.
- We **early-return** on a campaign hit so the offer path's `offers.status` mutation and the
  "offer not found → 404" branch are never reached for campaign emails (a campaign email has no
  `offer_id`, so the old code would 404 — the early return prevents that).
- Only forward-advances funnel timestamps (guards on `!recip.<col>`), so duplicate webhook
  deliveries are idempotent.

`config.toml` already has `[functions.resend-webhook] verify_jwt = false` — no change.

### 3.2 Funnel counts + filter buckets (in `campaignApi.ts`, types in `types.ts`)

```ts
export type CampaignRecipientFilter =
  | 'all'
  | 'opened_not_acted'      // opened_at set, outcome null  → "opened, not acted"
  | 'started_unfinished'    // started_at set, outcome null → HOTTEST call list
  | 'not_opened';           // sent_at set, opened_at null, sent >= N days ago

export interface CampaignFunnelCounts {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  landed: number;
  started: number;
  outcomeAuthorized: number;
  outcomeQuoteRequested: number;
  outcomeSoftCheck: number;
  noEmail: number;          // email IS NULL (print/no-email segment)
}
```
`getFunnelCounts` = a set of `select('*', { count:'exact', head:true })` queries per bucket,
each `.eq('campaign_id', id)` and (optionally) `.eq('batch', batch)`. `listRecipients`
translates the three actionable filters into `.is('outcome', null)` + presence predicates
(`.not('opened_at','is',null)`, `.not('started_at','is',null)`, or
`.is('opened_at',null).not('sent_at','is',null).lte('sent_at', nowMinusNDaysIso)`).

### 3.3 Back-office UI — `src/features/campaigns/pages/CampaignsPage.tsx` + nav

**Home decision (doc Open Decisions):** the doc leans "shared Kampagnen tab once there are ≥2
types." For this scope there is exactly one live type (Type A). Decision: **add a dedicated
`kampagnen` section now** (the engine is generic and Type B will reuse it), rather than nesting
under Viertl. This avoids a later migration of the UI out of Viertl.

Wire the tab exactly like `viertl`:
1. `src/lib/sectionRoute.ts`: add `'kampagnen'` to `AppSection`, to `SECTION_TO_PATH`
   (`/kampagnen`), and aliases (`/kampagnen`, `/campaigns`).
2. `src/components/AppShell.jsx`: add to `NAV_ITEMS`:
   `{ id: 'kampagnen', label: 'Kampagnen', icon: Megaphone }` (import `Megaphone` from
   `lucide-react`). Decide `adminOnly` — recommend **not** admin-only (sales reps work the call
   lists); confirm with user.
3. `src/features/offers/pages/OfferBuilderPage.jsx`: add a lazy import
   `const CampaignsPage = lazyWithReload(() => import('../../campaigns/pages/CampaignsPage'));`
   and a `{section === 'kampagnen' && (<CampaignsPage onOpenOffer={…} />)}` block mirroring the
   `section === 'viertl'` block (lines ~1699).

`CampaignsPage` structure (mirror `ViertlPage.tsx` patterns — `useAuth()` for the actor,
`Select` for pickers, badge/label meta maps):
- Campaign picker (`Select` of `listCampaigns()`), plus a batch `Select` (distinct batches).
- **Rollup header**: the `CampaignFunnelCounts` as stat chips
  (Gesendet → Zugestellt → Geöffnet → Geklickt → Gestartet → Ergebnis-Split), sliceable per
  batch. Use the same badge styling vocabulary as `STATUS_META` in ViertlPage.
- **Three call-list filters** as pill buttons (memo: pills for ≤7 often-switched options with
  counts):
  - **"Geöffnet, keine Aktion"** (`opened_not_acted`)
  - **"Gestartet, nicht fertig"** (`started_unfinished`) — labelled the hottest list
  - **"Nicht geöffnet (>N Tage)"** (`not_opened`, N configurable, default 5)
- Recipient table for the selected filter: name, email (or "keine E-Mail" chip), batch, funnel
  timestamps, outcome badge, quick actions (call/mail links like ViertlPage's `Phone`/`Mail`).

---

## Phase 4 — Batched, filtered, idempotent send

### 4.1 `supabase/functions/send-campaign/index.ts` (new edge fn)

Type-agnostic sender. Mirrors `send-offer` (Resend POST, KITZ HTML chrome, tracking pixel,
`email_events`-style logging) but reads from `campaigns`/`campaign_recipients`.

**Auth:** staff-invoked from the back-office → `verify_jwt = true`. Add to `config.toml`:
```
[functions.send-campaign]
verify_jwt = true
```
(Comment: invoked by logged-in staff from the Kampagnen back-office; gateway JWT stays on, like
`mesonic-proxy`.)

**Request body:**
```ts
{
  campaignId: string;
  recipientIds: string[];   // the CURRENT filtered selection from the back-office
  batch: string;            // wave label to stamp on freshly-sent rows
  resend?: boolean;         // true ⇒ deliberate "Erneut senden" (bump resend_count)
}
```

**Algorithm:**
1. Load `campaign` (subject, `email_template` inline body). 400 if missing/`status='archived'`.
2. Load the selected `campaign_recipients` (`.in('id', recipientIds)`).
3. **Idempotency filter:** partition into
   - `toSend` = rows with `sent_at IS NULL` (never contacted) **plus**, if `resend===true`, rows
     already `sent_at` set (deliberate follow-up).
   - `skipped` = rows already `sent_at` set when `resend!==true`.
   - `noEmail` = rows with `email IS NULL` (never sent; belong to the print segment).
   The **DB unique index** `uq_campaign_recipients_subject` guarantees a subject can't be
   enrolled twice, so "already contacted" == "row already has `sent_at`".
4. For each `toSend` row (throttled — see below):
   - Build the landing CTA URL `${PUBLIC_APP_URL}/?c=${row.token}` (same env var `send-offer`
     uses for `?a=`).
   - Render HTML: reuse `send-offer`'s KITZ header/footer/signature chrome; body =
     `campaign.email_template` with `{name}` interpolation; single CTA button
     ("Auftrag erteilen"/"Angebot ansehen" per type — for Type A: "Jetzt erledigen").
   - Include the **same signed tracking-pixel scheme** send-offer uses **but pointed at the
     campaign** — decision: reuse `track-open` is offer-specific, so **rely on Resend
     `email.opened`/`clicked` webhooks** (Phase 3) for campaign opens rather than a pixel. This
     avoids extending `track-open`. (Pixel optional future work.)
   - POST to Resend (`from: 'Kitz Computer & Office GmbH <angebote@kitz.co.at>'`, `to:[email]`,
     subject = `campaign.email_subject`, deterministic `Message-ID`
     `<campaign-${row.id}@offer.kitz.co.at>`).
   - On success: `update campaign_recipients set sent_at=now(), resend_id=<resendData.id>,
     batch=<batch>, resend_count = resend_count + (resend?1:0) where id=row.id`.
   - Also insert an `email_events` row? **Decision:** campaign funnel lives on
     `campaign_recipients` (Phase 3 webhook writes there), so we do **not** write `email_events`
     for campaign sends (that table is offer-scoped: `offer_id NOT NULL`). Attribution is via
     `campaign_recipients.resend_id`.
5. **Throttling:** send sequentially with a small delay (e.g. `await sleep(120ms)` between
   Resend calls) to avoid a burst — matches the doc's deliverability rationale. Cap the batch
   size server-side (e.g. reject `recipientIds.length > 200` with 400) as a guardrail.
6. **Response (confirm-math the dialog shows):**
```ts
{ ok: true, sent: N, skipped: M, noEmail: K, failed: F, batch }
```
The back-office pre-flight confirm dialog states *"Sende an N · überspringe M (bereits
kontaktiert) · K ohne E-Mail"* using these same numbers, computed **before** the call via
`campaignApi` (a `dryRunSend(campaignId, recipientIds, resend)` helper that partitions locally),
then re-confirmed by the fn's response.

### 4.2 Back-office send flow (in `CampaignsPage.tsx`)

- Selection = the current filter view's recipient ids (the "send to the current filtered
  segment, in waves" rule). A "Welle senden" button.
- Pre-flight: compute `{sent,skipped,noEmail}` locally + show a **sample render** (the HTML the
  first recipient would get — render the template with their `name`), then confirm.
- On confirm: `supabase.functions.invoke('send-campaign', { body: { campaignId, recipientIds,
  batch, resend } })` (authed client forwards the JWT, like `notifyViertlClosure`). Add a thin
  `sendCampaign(...)` wrapper in `campaignApi.ts` that unwraps edge-fn error bodies exactly like
  `notifyViertlClosure` does (parse `error.context.body`).
- **"Erneut senden"** action on an individual recipient (or a filtered set) sets `resend:true`.

### 4.3 No-email fallback (print segment)

Rows with `email IS NULL` are never sent by the fn. The back-office offers a **"Druckliste"**
export (CSV or a printable list) of the `noEmail` recipients for the mail-merge/print path —
hybrid, not all-or-nothing (doc requirement). For this scope: a client-side CSV download of
name/address (from the snapshot columns) is sufficient; regenerating the
`Kitz_Informationsschreiben_RKSV…` PDF per recipient is future work (flag it).

### 4.4 Enrolment source for Type A (how recipients get created)

The back-office "Neue Kampagne / Empfänger laden" action enrolls the Viertl segment:
- Query `viertl_licenses` (via existing `listLicenses()` from `viertlApi`) filtered to the RKSV
  audience (e.g. `customerStatus='active'`, not already `done`).
- For each, `enrollRecipients(campaignId, subjects)` with `subjectType:'viertl_license'`,
  `subjectId=license.id`, `name`, `email` snapshot, and **snapshot the wizard `known` context
  into payload** at enroll: `knownHardwareNeeded=license.hardwareNeeded`,
  `versionOk = parseVersion(license.gastrotouchVersion) >= 67.25`. Put `parseVersion` in
  `rksvWizard.ts` (pure, tested) so enroll and wizard agree.

---

## File-by-file change list

**New files:**
- `supabase/migrations/20260915120000_create_campaigns.sql` — tables, indexes, RLS, updated_at
  triggers, `campaign_recipient_write_back()` trigger (Type-A Viertl write-back).
- `src/features/campaigns/types.ts` — engine + RKSV types, funnel/filter types.
- `src/features/campaigns/lib/token.ts` — `newToken()`.
- `src/features/campaigns/lib/rksvWizard.ts` — pure `nextStep(known, answers)` + `parseVersion`.
- `src/features/campaigns/lib/rksvHandler.ts` — Type-A terminal→outcome mapping (calls
  `campaignApi.recordOutcome`; Viertl write-back is the DB trigger).
- `src/features/campaigns/api/campaignApi.ts` — generic CRUD/funnel/outcome + `sendCampaign`
  wrapper.
- `src/features/campaigns/pages/CampaignLandingPage.tsx` — public `?c=` dispatcher.
- `src/features/campaigns/pages/rksv/RksvWizard.tsx` — Type-A landing wizard shell.
- `src/features/campaigns/pages/CampaignsPage.tsx` — back-office funnel + send.
- `src/features/campaigns/lib/__tests__/rksvWizard.test.ts`
- `src/features/campaigns/api/__tests__/campaignApi.test.ts`
- `supabase/functions/send-campaign/index.ts`

**Edited files:**
- `src/App.jsx` — add `?c=` branch + lazy `CampaignLandingPage` import.
- `src/lib/sectionRoute.ts` — add `'kampagnen'` section + path + aliases.
- `src/components/AppShell.jsx` — add `Kampagnen` nav item (import `Megaphone`).
- `src/features/offers/pages/OfferBuilderPage.jsx` — lazy import + `section === 'kampagnen'`
  render block.
- `supabase/functions/resend-webhook/index.ts` — additive campaign attribution (early-return on
  hit; offer path unchanged).
- `supabase/config.toml` — add `[functions.send-campaign] verify_jwt = true`.
- (Test) `src/components/__tests__/AppShell.test.jsx` — if it asserts the NAV_ITEMS set, update
  to include Kampagnen.

---

## Test plan (maps to the doc's test plan)

1. **`rksvWizard.test.ts`** — exhaustive branch coverage (all cases in 2.6) + `parseVersion`
   comparisons (`'67.24' < 67.25`, `'67.25' >= 67.25`, null → unknown).
2. **`campaignApi.test.ts`** — mapping + funnel/outcome side-effects (cases in 1.4), incl.
   idempotent `enrollRecipients` (upsert/onConflict), `saveRecipientPayload` `started_at`-once,
   `recordOutcome`, filter-bucket query construction, `sendCampaign` error-body unwrap.
3. **Webhook attribution** — a unit test for the new campaign branch of `resend-webhook`:
   given a `resend_id` present on a `campaign_recipients` row, an `opened` event stamps
   `opened_at` and early-returns without touching `offers`; given a `resend_id` absent from
   campaigns, the offer path runs unchanged (regression guard). (Follow the existing pattern for
   testing edge-fn logic if one exists; otherwise extract the attribution into a testable
   helper.)
4. **Idempotent send** — a unit test around `dryRunSend`/the partition logic: already-`sent_at`
   rows skipped when `resend!==true`; counted into `skipped`; `email IS NULL` → `noEmail`;
   `resend===true` moves an already-sent row into `toSend`. Confirm the returned confirm-math
   `{sent,skipped,noEmail}`.
5. **Funnel query** — `getFunnelCounts` returns correct counts per bucket, and each of the three
   `listRecipients` filters builds the right predicates, sliceable per `batch`.

---

## Ambiguities in the design doc + decisions made

1. **`email_template` = id or inline body?** → **inline HTML body per campaign** (single RKSV
   letter), wrapped in the shared `send-offer` KITZ chrome. A template registry is deferred.
2. **`hardwareNeeded===false` "zero questions" fast-path.** Doc says version-current +
   `hardwareNeeded==false` → immediate "Auftrag erteilen". But false is the un-triaged default,
   so → **only skip when `hardwareNeeded===false` AND `versionOk===true` are both known**;
   otherwise ask the Win10 question.
3. **Role of `versionOk` in the wizard.** The doc's diagram branches only on hardware/Win10;
   version is "resolved server-side." → **`versionOk` is snapshotted at enroll, used to phrase
   copy and to enable the zero-question fast-path, but does not itself branch** the wizard.
4. **Where `known` (hardwareNeeded/versionOk) is resolved.** → **at enroll time**, snapshotted
   into `campaign_recipients.payload`, so the public/anon landing page needs no authed Viertl
   read and the wizard stays a pure function of the snapshot.
5. **Anonymous landing can't call authed `viertlApi`.** → **DB trigger**
   (`campaign_recipient_write_back`) does the Viertl write-back on `outcome` transition;
   `actor_name='RKSV-Kampagne'` keeps self-reported answers distinguishable from technician
   confirmations.
6. **Campaign opens: tracking pixel vs. webhook.** `track-open` is offer-specific. → **rely on
   Resend `opened`/`clicked` webhooks** (Phase 3) for campaign funnel; no pixel/`track-open`
   change. Pixel is optional future work.
7. **`email_events` for campaign sends?** That table is offer-scoped (`offer_id`). → **no
   `email_events` rows for campaigns**; funnel lives on `campaign_recipients`, attribution via
   its `resend_id`.
8. **Back-office home.** → **dedicated `kampagnen` tab now** (not nested under Viertl), since the
   engine is generic and Type B will reuse it. `adminOnly` left as a confirm-with-user question
   (recommend not admin-only).
9. **`send-campaign` `verify_jwt`.** → **true** (staff-invoked from back-office), unlike the
   webhook fns.

---

## Open questions for the user (confirm before implementing)

- **Kampagnen tab visibility:** admin-only or all sales reps? (recommend all reps; they work the
  call lists).
- **RKSV audience filter:** exact `viertl_licenses` predicate for enrolment (all `active` and
  not `done`? exclude `closing`/`closed`? include a specific `wartung`?).
- **"Auftrag erteilen" → Viertl status:** should a completed authorization also advance the
  license `status` (e.g. to `replied`/`done`), or only append a `viertl_event` note?
- **Version threshold:** confirm **V67.25** is the exact `>=` cutoff for `versionOk`
  (the doc says "V67.25").
- **Batch cap / throttle values:** confirm the per-wave size cap (proposed 200) and inter-send
  delay (proposed ~120ms) suit technician-scheduling capacity.
