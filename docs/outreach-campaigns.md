# Outreach & Replacement Campaigns

**Status:** Planned (design fixed 2026-09-15)
**Feature area:** new generic campaign engine + per-type landing components + one edge function
**First two instances:** RKSV signature-card swap · RCH/BHS/Sharp PoS-system replacement

## Why an engine, not a one-off

KITZ keeps hitting the same shape: a **forced-migration event** hits a *subset* of customers,
and we must reach exactly them, explain what changes, and capture who's in — without a Word
mail merge, without an unread letter, without waiting for the phone to ring.

- **RKSV signature card** — ACOS-ID 2.1 now, ATOS CardOS 5.3 by Mai 2027 → card must be swapped.
  Today: mail merge of `Kitz_Informationsschreiben_RKSV_Signaturkarten_2026.pdf`, print → sign →
  scan → e-mail back to `office-rksv@kitz.co.at`.
- **PoS replacement** — RCH / BHS / Sharp PoS systems reaching end-of-life → customers get
  **special offers on how the replacement works**.
- **…and the next one.** Every such event is the same pipeline; only the audience, the message,
  and the landing behaviour differ.

So we build a reusable **campaign engine** and express each event as a **campaign type** (a
handler) on top of it.

## The split: engine vs. campaign type

**Engine — identical for every campaign:**
- Audience = a **filtered segment** (never "all customers at once").
- **Batched, tracked send** in waves, idempotent (never double-send within a campaign).
- **Token landing** (`?c={token}`) that identifies the recipient.
- **Funnel** (sent → delivered → opened → clicked → started → outcome) + back-office rollup.
- **Ticket creation + rep notification** on a terminal outcome.
- **Write-back** to the source record + audit log.

**Campaign type — a small handler that plugs in:**

| aspect | Type A · RKSV signature card | Type B · PoS replacement (RCH/BHS/Sharp) |
|---|---|---|
| Audience source | Viertl licenses (`viertl_licenses`) | Mesonic Beleg by article / Erlöskonto for RCH/BHS/Sharp, or a curated list — **not** the Viertl list |
| Email message | RKSV letter + CTA "Auftrag erteilen" | replacement pitch + CTA "Angebot ansehen" |
| Landing behaviour | branching **wizard** (below) | **special offer** presentation |
| Terminal action(s) | price-free **authorization** (signature) / **Angebot anfordern** / soft-check | **accept the replacement offer** → reuse existing offer/accept flow |
| Write-back target | Viertl row (`hardwareNeeded`, setup size, status) | ticket + linked offer |
| Ties into | Viertl tracker, CRM TeamViewer OS check | offer builder + [Sharp MFP offers](sharp-mfp-offers-plan.md) |

**Recommendation:** build the engine + tables generic **now**, ship **Type A (RKSV) first** as
the proving handler, so **Type B (PoS)** is later mostly a new email template + landing component
+ audience query — not a new system.

---

## Data model (generic)

Two tables replace the earlier single `rksv_outreach`:

**`campaigns`** — one row per campaign (a specific send effort, repeatable):

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `type` | text | `rksv_signature` \| `pos_replacement` \| … — selects the handler |
| `key` | text unique | e.g. `2026-acos`, `2027-sharp-eol` |
| `title` | text | human label for the back-office |
| `email_subject` / `email_template` | text | per-campaign message (or template id) |
| `created_by_*` | text | denormalized actor |
| `created_at` | timestamptz | |

**`campaign_recipients`** — one row per recipient per campaign (the funnel + answers):

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `campaign_id` | uuid fk → campaigns | |
| `subject_type` | text | `viertl_license` \| `mesonic_customer` \| … (polymorphic source) |
| `subject_id` | text | id/kdnr in that source; used for write-back |
| `name` / `email` | text | snapshot at send time |
| `batch` | text | which wave; funnel slices per wave |
| `resend_count` | int default 0 | bumped only on explicit "Erneut senden" |
| `token` | text unique | landing URL `?c={token}` |
| `sent_at` `opened_at` `clicked_at` `landed_at` | timestamptz | funnel |
| `outcome` | text | type-defined: `authorized` \| `quote_requested` \| `soft_check` \| `offer_accepted` \| … |
| `outcome_at` | timestamptz | |
| `payload` | jsonb | **type-specific answers/state** (RKSV wizard answers, chosen offer, signature, …) |
| `ticket_id` | uuid fk → tickets | created on terminal action |
| `offer_id` | uuid fk → offers | for offer-backed types (Type B) |
| `resend_id` | text | webhook attribution |
| `created_at` / `updated_at` | timestamptz | |

- All type-specific fields live in `payload` (jsonb), so a new campaign type never migrates the
  schema. RKSV's `has_win10` / `setup_size` / `signature_data` are payload keys.
- `campaignApi.ts` (camelCase mapping, mirrors `viertlApi.ts`) is generic; each type gets a thin
  handler module (audience query, email render, landing component, `onOutcome` write-back).

## Landing router (`?c={token}`)

- One public route (no auth / no app shell), lazy-loaded from `App.jsx` next to the `?a=` accept
  branch. Loads the recipient by token, stamps `landed_at`, reads `campaign.type`, and dispatches
  to the type's landing component. Type A → wizard; Type B → offer view.

---

## Type A · RKSV signature card (first handler)

**One email to everyone in the segment. Defer the technical branch to a prefilled wizard at the
moment of engagement** — because the precondition (*WIN10 64bit + V67.25*) is a question the
non-technical customer can't answer and our data is half-empty.

Resolve server-side first: V67.25 from `viertl_licenses.gastrotouchVersion`; if `hardwareNeeded`
is known-true skip to setup-size. Ask only the unknown.

```
                      ┌─ hardwareNeeded == true (known) ──────────────► setup-size question
start (token) ───────►│
                      └─ hardware unknown ─► "Haben Sie eine Kasse mit Windows 10?"
                                              ├─ Ja        ─────────────► Auftrag erteilen
                                              ├─ Nein      ─► setup-size ► Angebot anfordern
                                              └─ Weiß nicht ────────────► "Das prüfen wir für Sie"
                                                                           (soft auth + callback)
setup-size: "Einzelplatz-Kasse" | "Mehrplatz-Kasse"
terminal (ready):    "Auftrag erteilen"  (price-free signature)
terminal (hardware): "Angebot anfordern" (intent → rep builds priced offer)
```

- **"Weiß nicht" is first-class** — routes to soft-auth + "needs remote OS check" (technician
  confirms via CRM TeamViewer before any truck roll). Never a forced binary.
- **Only ask what we can't compute.** Current version + `hardwareNeeded==false` → "Auftrag
  erteilen" with zero questions.
- **Write answers back** to the Viertl row (self-reported `hardwareNeeded`/setup size), logged as
  a `viertl_event`, distinguishable from a technician's confirmation.
- **Price-free authorization** (assumption A1) — matches today's letter; billed later as normal
  ticket/invoice work.

Pure branch module `rksvWizard.ts`: `nextStep(known, answers) → step | terminal`, exhaustively
unit-tested. Terminal actions call generic `campaignApi` + the Type-A `onOutcome` write-back.

## Type B · PoS replacement — RCH/BHS/Sharp (second handler)

- **Audience:** customers owning RCH/BHS/Sharp PoS systems — sourced from Mesonic Beleg history
  (article numbers / Erlöskonto, via the existing `mesonicBelege.ts`) or a curated import. **Open:
  confirm the exact identifying articles/accounts.**
- **Message:** "your PoS system is reaching end of life; here's how the replacement works" +
  CTA to view the offer.
- **Landing:** a **special offer** — reuse the existing offer/accept flow. Simplest model: the
  campaign pre-builds a *draft replacement offer* per recipient (template + their data), and the
  landing reveals it and lets them accept via the normal signature/Stripe accept page. `offer_id`
  on the recipient row links the two; acceptance flows through existing `notify-offer-accepted` +
  ticket creation.
- **Write-back:** outcome `offer_accepted`; ticket + linked offer. No Viertl coupling.
- Reuses everything the offer/accept flow already has (pricing, signature, Stripe-optional,
  acceptance ticket) — the campaign engine only adds the *tracked front door* + funnel.

---

## Phases

**Engine first, RKSV as the proving handler, PoS as a fast-follow.**

### Phase 1 — Engine data model + generic API
- Migrations for `campaigns` + `campaign_recipients` (schema above). `campaignApi.ts` +
  camelCase types + tests (mirror `viertlApi.ts`).

### Phase 2 — Landing router + Type A wizard
- `?c={token}` router in `App.jsx`; pure `rksvWizard.ts` (unit-tested); RKSV wizard component;
  Type-A `onOutcome` write-back to Viertl + `viertl_event`.

### Phase 3 — Tracking + funnel back-office
- Extend `resend-webhook` to attribute `opened`/`clicked` to `campaign_recipients` via
  `resend_id` (today it only resolves `email_events → offer_id`).
- Back-office campaign view (own tab or under Viertl for Type A): rollup counts + actionable
  filters — **"opened, not acted"**, **"started, didn't finish"** (hottest call list),
  **"not opened after N days"**. Sliceable per `batch`.

### Phase 4 — Batched, filtered send
- **Never all at once — send to the current filtered segment, in waves.** Rationale: capacity
  matching (authorizations must not outrun technician scheduling) > deliverability (no 300-burst
  spam risk) > honest human-in-the-loop (A2).
- Selection = the current filter view. **Idempotent:** skip recipients already in this campaign;
  deliberate follow-up = explicit "Erneut senden" (`resend_count`++). Confirm dialog states
  *"Sende an N · überspringe M (bereits kontaktiert) · K ohne E-Mail"* + a sample render.
- New edge fn `send-campaign` (type-agnostic; renders the campaign's email, CTA →
  `{appUrl}/?c={token}`, records `sent_at`/`resend_id`/`email_events`, throttled).
- **No-email fallback:** excluded rows → print list / regenerated PDF (hybrid, not all-or-nothing).

### Phase 5 — Type B (PoS replacement) handler
- Audience query for RCH/BHS/Sharp owners; replacement email template; draft-offer-per-recipient
  build; landing reveals offer → existing accept flow; `offer_accepted` write-back.
- Mostly new template + landing component + audience query — engine, send, funnel already exist.

### Phase 6 — Pre-classification batch (Type A, optional)
- Read `gastrotouchVersion` + Mesonic Beleg POS-purchase age → best-guess `hardwareNeeded`,
  shrinking wizard questions. Does not gate sending.

## Test plan
- `rksvWizard.ts` — exhaustive branch coverage.
- `campaignApi.ts` — mapping + funnel/outcome side-effects (mirror `viertlApi.test.ts`).
- Webhook attribution — `resend_id → campaign_recipients`.
- Idempotent send — already-contacted recipients skipped; "Erneut senden" bumps `resend_count`.
- Funnel query — counts + each filter bucket, per `batch`.

## Open decisions
- **A1** price-free RKSV authorization? (lean: yes)
- **Audience source for Type B** — exact Mesonic articles/Erlöskonto identifying RCH/BHS/Sharp
  PoS owners, vs a curated import.
- **Type B landing** — pre-build a draft offer per recipient (recommended) vs. build on demand
  when they land.
- Attach the PDF to the email, or link-only? (lean: link-only; PDF for the print segment only.)
- Back-office home — one shared "Kampagnen" tab, or Type A under Viertl + Type B under Offers?
  (lean: shared tab once there are ≥2 types.)
