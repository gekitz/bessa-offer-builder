# Plan: Sharp MFP Offers (+ PoS/Sharp/Brother offer types)

Status: **planned, not yet implemented.** Last updated 2026-06-30.

## Goal

Add a second kind of offer — **Sharp MFP copiers** — alongside the existing PoS
offers, structured so that offers can later be **filtered by PoS / Sharp / Brother**.
Brother will be functionally similar to Sharp and should reuse the same machinery.

## Locked decisions

1. **Offer type is a first-class attribute.** New `offer_type` column on `offers`
   (`'pos' | 'sharp' | 'brother'`, default `'pos'`). Drives list filtering, builder
   tabs, and PDF rendering.
2. **Sharp & Brother share one "copier/MFP" family.** Build one parameterized copier
   module; Brother later = add a `BROTHER` catalog + a config entry, no new rendering.
   Do **not** build a fully generic product-family engine (over-engineering for 3 types).
3. **Device sold as Kauf OR Leasing** — per-offer toggle (`saleMode: 'kauf' | 'leasing'`).
   Both fully supported.
4. **Per-page maintenance (All-in Kopienpreiswartung): rates-only**, exactly as the
   paper sample. Show €/page rates + covered/excluded list + quarterly-meter note.
   **Not** part of any numeric total. (Optional volume-estimate = future, out of scope.)
5. **Leasing via Grenke, computed by factor + override, 60 Monate only.** See below.
6. **Tax stays 20%** (sample is all 20%; revisit only if a 10% line ever appears).

## Leasing model (Grenke) — validated against two real calcs

Grenke is the leasing partner. The **price-list "Leasing 60 Monate" columns are Sharp's
indicative numbers (~2,2%) and must be ignored** — Grenke quotes lower.

- **Financed base = full Kauf net:** `Σ vk (device + accessories) + UHG + install
  − Mietsonderzahlung − trade-in`. (Grenke calc base €3.594,73 = 3.150 + 194,73 + 250.)
- **Rate = base × grenkeFactor[60mo]**, factor stored as **editable config**, default
  **1,9801 %**. Rep can override with the exact Grenke quote.
- **Validation (both 60 Monate, factor 1,980 %):**
  - Grenke calc: base 3.594,73 → €71,18/mo.
  - Sample offer (−650 trade-in): base 2.974,73 → €58,90/mo.
- **Grenke params (shown in the PDF Leasing block):** Vertragsart Teilamortisation,
  Restwert 5 %, Provision 2 %, Bearbeitungsgebühr €75, Zahlungsart Lastschrift,
  Vertragsgebühr 1 % der Auftragssumme (the one computed extra), Bonitätsprüfung.

## Source data (verify before hard-coding — transcribed from price list, Stand Jänner 2026)

Devices carry: `vk`, `uhg`, `install`, `pageBw`, `pageColor`. Scan rate flat **€0,0019**.
Ignore the price-list leasing columns.

| Modell | Inkl. Optionen | A4/min | VK | UHG | Install | s/w | color |
|---|---|---|---|---|---|---|---|
| BP51C26 | BPDE12 1×550 + BPTU10 | 26 | 3.150 | 194,73 | 250 | 0,0075 | 0,0750 |
| BP51C31 | BPDE12 1×550 + BPTU10 | 31 | 3.490 | 194,73 | 300 | 0,0075 | 0,0750 |
| BP51C36 | BPDE14 3×550 + BPTU10 | 36 | 4.450 | 194,73 | 300 | 0,0075 | 0,0750 |
| BP51C45 | BPDE14 3×550 + BPTU10 | 45 | 4.780 | 235,02 | 300 | 0,0075 | 0,0750 |
| BP61C31 | BPDE14 3×550 + BPTU10 | 31 | 4.150 | 194,73 | 300 | 0,0070 | 0,0650 |
| BP61C36 | BPDE14 3×550 + BPTU10 | 36 | 4.795 | 194,73 | 300 | 0,0070 | 0,0650 |
| BP61C45 | BPDE14 3×550 + BPTU10 | 45 | 5.470 | 235,02 | 350 | 0,0070 | 0,0650 |
| BP71C31 | BPDE14 3×550 + BPTU10 | 31 | 5.270 | 194,73 | 350 | 0,0070 | 0,0650 |
| BP71C36 | BPDE14 3×550 + BPTU10 | 36 | 5.910 | 194,73 | 350 | 0,0070 | 0,0650 |
| BP71C45 | BPDE14 3×550 + BPTU10 | 45 | 6.320 | 235,02 | 400 | 0,0070 | 0,0650 |
| BP71C55 | BPDE14 3×550 + BPTU10 | 55 | 7.210 | 235,02 | 400 | 0,0055 | 0,0550 |
| BP71C65 | BPDE14 3×550 + BPTU10 (ohne Finisher) | 65 | 8.300 | 235,02 | 520 | 0,0055 | 0,0550 |

Accessories (`vk` only — ignore the price-list leasing column):
WLAN-Adapter BPEB10 216 · Post-Script MXPK13ED 423 · Konsole BPDE14 (Aufpreis) 345 ·
Fax-Kit BPFX11DE 553 · Ausgabefach BPTR12 119,20 · Papierführung BPRB10 334 ·
Heft-Finisher BPFN13 1.445 · Heft-Finisher BPFN15 1.910 · Data Security Kit BPPR12U 525.

> ⚠️ Verify: WLAN-Adapter row names models "BP30C25 und BP50C26" (doesn't match BP51/61/71).

## Phases

### Phase 1 — Offer-type foundation (self-contained, low risk) ✅ DONE
Migration `20260630120000_add_offer_type.sql`; `offerType` wired through `saveOffer`
(column + offer_data mirror) and all builder load/save/reset paths; `listOffers` selects
`offer_type`; type filter pills on the list (auto-shown once a 2nd type exists). Tests in
`offerApi.test.ts`. **Note: migration not yet applied to Supabase — needs a deploy/push.**

Original spec:
- Migration `<ts>_add_offer_type.sql`: `ALTER TABLE offers ADD COLUMN offer_type TEXT
  NOT NULL DEFAULT 'pos' CHECK (offer_type IN ('pos','sharp','brother'));` + index.
- Add `offerType` to builder state, `offer_data` JSONB, and `saveOffer`/`getOffer`
  (`src/lib/offerApi.js`); also in `src/lib/urlState.js`.
- PoS/Sharp/Brother filter pills on the `angebote` list (with counts).
- Tests: round-trips `offer_type`; legacy rows read back as `'pos'`.

### Phase 2 — Sharp catalog + `copier` item kind ✅ DONE
`SHARP` (12 devices, `t:'copier'`) + `SHARP_ZUBEHOR` (9 accessories) in `catalogs.ts`,
registered in `ALL` + `catalogs.test.ts`. New pure engine `src/lib/copierOffer.ts`
(`buildCopierOffer`) owns all Sharp math: Kauf line expansion + net/VAT/gross, Grenke
leasing (factor 0,0198 on the financed base, override-able, Restwert/Bearbeitungsgebühr/
Vertragsgebühr), and per-page maintenance rates (informational, never summed). `Item`
gains copier fields (`vk`/`uhg`/`install`/`pageBw`/`pageColor`/`pageScan`/`includedOptions`);
`CartItem` gains `saleMode`/`tradeIn`/`leasingRateOverride`/`mietsonderzahlung`. PoS
`computeTotals` + `buildLineItems` defensively skip `t:'copier'`. Tests in
`copierOffer.test.ts` reproduce the Grenke calc (€71,18) and the sample (€2.974,73 net /
€3.569,68 gross, €58,90 lease). Engine is NOT yet wired to PDF/builder (Phases 3–4).

Original spec:
- `catalogs.ts`: `SHARP` (devices, `t:'copier'`, fields above + `includedOptions[]`,
  `description`) and `SHARP_ZUBEHOR` (accessories, `t:'o'`). Register in `ALL` and
  `catalogs.test.ts`.
- Cart line for `t:'copier'`: `saleMode`, optional `tradeIn {name,value}`,
  `leasingRateOverride?`, `mietsonderzahlung?`.
- `offerLineItems.ts`: explode one copier entry →
  - **Kauf**: device@vk · included options@€0 · UHG@uhg · Install@install · trade-in@−x.
  - **Leasing**: financed base × factor → monthly rate (UHG/install in base, not lines).
  - both: page-rate maintenance block (rendered, not summed).
- `totals.ts`: Kauf → `once`; Leasing rate displayed separately; page rates excluded.
- Tests: Kauf reproduces sample lines + Netto €2.974,73 / Brutto €3.569,68;
  Leasing reproduces €58,90 (with trade-in) and €71,18 (base 3.594,73).

### Phase 3 — PDF copier template ✅ DONE
`OfferPdfDocument` takes a `copierOffer` prop; when `copierOffer.isCopierOffer` it renders
`CopierSection` (device table with €0 included options + UHG + install + trade-in,
Angebotssumme net/USt/gross, `LeasingBlock` with Grenke terms, `MaintenanceBlock` with the
per-page rates + quarterly-meter note) instead of the PoS monthly/once tables; PoS
financing/SEPA pages are suppressed for copier offers. Reuses existing styles (financing
styles → leasing block, notes styles → maintenance). `OfferBuilderPage` builds `copierOffer`
via a memo and passes it to all 3 PDF call sites (no-op for PoS carts). Smoke tests in
`src/pdf/__tests__/copierPdf.test.tsx` render Kauf + Leasing + PoS offers to real PDF blobs.
Builder UI to *create* a Sharp offer comes in Phase 4.

Original spec:
- `OfferPdfDocument.jsx` copier branch: device table (+ spec block from `description`),
  **Leasing-Konditionen** block (60 Mo, Restwert 5 %, Bearbeitungsgebühr €75, Provision,
  Vertragsgebühr 1 %, Bonität) when Leasing, **All-in Kopienpreiswartung** rates block.
- Reuse header/footer/customer/signature unchanged.
- Tests: maintenance block renders; page rates never enter totals.

### Phase 4 — Builder UX ✅ DONE
Offer-type segmented switch (PoS / Sharp MFP) in the builder header drives the product
tabs via `builderTabsFor(offerType)`: PoS keeps Bessa/Melzer/RCH/Hardware; Sharp shows
**Sharp MFP** (copier devices) + **Zubehör** (accessories) + Angebot. New `CopierItemCard.tsx`
(Kauf/Leasing toggle, qty, trade-in checkbox+inputs, Mietsonderzahlung + leasing-rate
override under Leasing; prices computed by the same `buildCopierOffer` engine). New cart
handlers `onAddCopier`/`onCopierField`. `OfferView` gets a `copierOffer` prop and renders a
read-only **CopierSummary** (device lines + Angebotssumme + Grenke leasing + maintenance)
in place of the PoS cost sections when `isCopierOffer`; bottom-bar + `buildOfferText`
(email/copy) also handle copier offers. Search is offer-type-scoped. Tests:
`CopierItemCard.test.tsx` (5), `OfferView.copier.test.tsx` (2).

Original spec:

### Integration gap fixes (post Phase 4) ✅ DONE
- **Pipeline value**: copier carts make `computeTotals` 0, so saved Sharp offers showed €0
  in the list/CRM/accept/email-preview. New `copierPersistTotals(offer)` surfaces Kauf net
  as a one-time amount and the Leasing rate as monthly (rate × term as period); used via a
  `persistTotals` memo at all 4 save sites + passed to `EmailPreviewModal`. Tested.
- **Online acceptance**: the self-serve AcceptPage offers PoS Ratenzahlung/Miete (+8%),
  wrong for a Grenke lease (which needs Bonitätsprüfung). New `acceptEnabled =
  billingEnabled && !isCopierOffer` gates the accept QR + accept-link + `includeAcceptLink`,
  so copier offers never expose self-acceptance. (AcceptPage itself left PoS-only by design.)

### Leasing-conditions override (post Phase 4) ✅ DONE
A dedicated `LeasingConditionsModal` lets the rep override the Grenke conditions per offer
(all defaulted from the `GRENKE` config): **Laufzeit** 36/60 (each with its validated factor —
36mo = 3,15%, 60mo = 1,98%), **Leasingfaktor**, **Restwert %**, **Bearbeitungsgebühr**,
**Mietsonderzahlung**, and the absolute **rate override**. Live rate preview via the same
engine. Opened from the CopierItemCard (replaces the inline leasing inputs) and from the
CopierSummary leasing block in the Angebot tab. Engine reads the overrides off the primary
device with `GRENKE` fallback; only deviations are persisted (config defaults keep
propagating). Design rule: we only compute where we know the factor (36/60) — other
condition combos require the rep to set the factor or the absolute rate explicitly.
Device + accessory **price editing** also added (pencil → `EditItemModal` → `priceOverride`,
honored by the engine for both device VK and accessory unit price).

### Phase 5 — Brother
- Add `BROTHER` catalog + one config entry; reuse copier kind, expansion, PDF, type.
