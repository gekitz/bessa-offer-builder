# Accepted offer → WinLine-Angebot (Belegart 17)

When a customer accepts an offer, push it into Mesonic as an **Angebot** Beleg
so the accounting team — who work solely in WinLine — find it there. Fully
automatic on acceptance; a manual retry covers the edge cases.

## Why Belegart 17 (an *Angebot*, not an order/invoice)

Counter-intuitive but deliberate: the goal is **findability** for the WinLine
users, not accounting-grade posting. The Beleg is a freetext mirror of the
offer, alongside the ticket Reparaturschein (18) / Lieferschein (19) Belege.

## Flow

```
customer accepts (signature or Stripe)
  → offers.status='accepted' (offerApi.acceptOfferWithSignature / stripe-complete-acceptance)
    → trg_offer_accepted_export_angebot  (pg_net, same signal as ticket-create + notify)
      → export-offer-angebot edge function
        → build freetext positions from offer_data.lineSnapshot
        → mesonic-proxy (import, Type 30, WEBAngebot, Belegart 17)
        → persist offers.mesonic_beleg_{key,number,laufnummer,status,created_at}
```

Both acceptance paths converge on the one trigger, exactly like
`notify-offer-accepted` (migration `20260714130000`).

## Money model (pinned by tests in `src/lib/__tests__/offerAngebot.test.ts`)

- Each counted offer line → one **TEXT** position (Datentyp 3) at its net line
  price. A discount split (full-price qty + Aktionspreis qty) becomes two
  positions, exactly as the offer prices it.
- Monthly lines carry the term in the Bezeichnung: `… (12 Monate, monatlich)`.
- The global **Rabatt** (`rabattActive`, 2 % of the Laufzeitsumme) and a
  **Hardware-Rücknahme** (`takeBack`) are **separate negative** TEXT positions,
  not folded into line prices.
- Old offers without a frozen `lineSnapshot` fall back to summary lines from
  the `acceptSnapshot` totals (Monatlich / Einmalig), so they still export.

## The frozen `lineSnapshot`

The product catalog is DB-managed and RLS-gated — it is **out of reach** of the
server-side edge function running on acceptance. So the builder freezes the
priced, named lines into `offer_data.lineSnapshot` at save time (next to the
existing `acceptSnapshot`), and the export reads them directly — no re-pricing,
no catalog. See `OfferBuilderPage.buildLineSnapshot()`.

Only **new** offers (saved after this ships) get a `lineSnapshot`. Older
accepted offers use the summary fallback.

## Auth / the proxy

The export runs server-side with **no staff session**, but `mesonic-proxy`
requires a valid JWT at the gateway (`verify_jwt = true`). Solution: the edge
function calls the proxy with the **SERVICE_ROLE key** — itself a validly-signed
project JWT, so it clears the gateway — and `mesonic-proxy.verifyAuth` accepts
it (constant-time compare) for internal calls, in addition to staff user JWTs.
No gateway posture change; the interactive staff path is untouched.

The trigger→edge-function hop uses the shared `CRON_SECRET` (same as
`notify-offer-accepted`), so `export-offer-angebot` has `verify_jwt = false`.

## Idempotency & the no-customer case

- `offers.mesonic_beleg_key` (`<konto>-<laufnummer>`) is the idempotency anchor:
  set → already exported → skipped by both the trigger and the function.
- No `mesonic_customer_id` → **not exported**, flagged
  `mesonic_beleg_status = 'skipped_no_customer'`. The offer detail
  (`OfferDetailsModal`) shows an amber note; once the customer is linked in the
  builder, the **"Nach Mesonic exportieren"** retry button runs
  `runOfferAngebotExport` (client-side, uses the staff JWT via the proxy).

## Files

| Concern | File |
| --- | --- |
| Pure mapping + XML (shared, Deno + app) | `supabase/functions/_shared/offerAngebot.ts` |
| App bridge | `src/lib/offerAngebot.ts` |
| Mapping tests | `src/lib/__tests__/offerAngebot.test.ts` |
| Freeze snapshot at save | `OfferBuilderPage.buildLineSnapshot()` + `offerApi.saveOffer` |
| Migration (columns + trigger) | `supabase/migrations/20260922120000_offer_mesonic_angebot.sql` |
| Edge function (auto path) | `supabase/functions/export-offer-angebot/index.ts` |
| Proxy internal auth | `supabase/functions/mesonic-proxy/index.ts` (`verifyAuth`) |
| Manual retry runner | `src/features/offers/lib/runOfferAngebotExport.ts` |
| Status UI + retry | `OfferDetailsModal.tsx` (`MesonicAngebotBlock`) wired in `OfferListPage.jsx` |

## Deploy (manual — not done yet)

1. Apply migration: `supabase db push` (unique timestamp `20260922120000`).
2. Deploy functions: `supabase functions deploy export-offer-angebot` and
   redeploy `supabase functions deploy mesonic-proxy` (auth change).
3. Ensure `CRON_SECRET` is set as a secret on `export-offer-angebot` and the
   Vault secrets `digest_project_url` / `digest_cron_secret` exist (they do —
   reused from the notify path).
4. **Verify against a test account first** (as the ticket path was on 272765):
   accept a test offer with a linked Mesonic customer, confirm one Angebot
   (Belegart 17) lands and `mesonic_beleg_number` is written.

## Open / to confirm on first live run

- Belegart 17 WEBAngebot template must be configured Mesonic-side (was the
  historical blocker). User confirmed ready.
- `DatumAngebot` = acceptance date (accepted_at, else signed_at).
- Whether the accounting team want the Rabatt/take-back as separate lines
  (current) vs folded — easy to change in `offerToBelegPositions`.
