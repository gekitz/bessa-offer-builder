# Sharp PoS replacement — import source data

Durable record of the Sharp "Signaturtausch" (Type B / `vendor=sharp`) owner list, so it can't be
lost to ephemeral scratchpad cleanup again. Feeds `viertl_licenses` (the Signaturtausch register).

## Where the data came from
- **Sales data:** WinLine **Verkaufsstatistik → XLSX**, one export per Sharp article number
  (`04000207KL`, `04000421KL`, `04003500KL`, `04003515KL`, `04100217KL`; `04102171KL` export was never
  delivered — only its PDF). Columns include Konto Kontonummer/Name, Menge, Fakturendatum, Einzelpreis.
  No OCR / no WinLine LIST-API needed for the *data*.
- **Triage state:** 6 scanned "Artikelstatistik" PDFs with handwritten staff marks.

## Reconciliation logic
1. **Net `Menge` per customer per article** (returns/credits cancel) → current owners (net > 0).
2. **Dedupe per customer across articles/models** → one target per Kontonummer (models listed).
3. **Score existence from the PDF marks** (confirmed by Huber Toni 2026-10-19):
   - **✓ checkmark = customer still exists** → `confirmed`
   - **• dot / unclear = existence unsure** → `unsure`
   - **strikethrough (all lines) = gone** → `GONE` (excluded)
   - name matches a leasing company → `leasing` (operator unknown, excluded)

## Result (399 unique owners)
- `confirmed` 138 · `unsure` 138 · `GONE` 117 · `leasing` 6 → **276 mailable** (confirmed + unsure).
- Imported as `vendor=sharp`, `hardware_needed=true`, `source=sharp_verkaufsstatistik`, status `new`,
  existence noted. GONE + leasing **not** imported.

## ⚠️ Leasing blind spot (unresolved)
7 leasing accounts (Grenke / Leasfinanz / F&S / VB) hold ~77 devices — the real operators are invisible
in the Konto-based data. Resolve separately: KITZ install/delivery records, the Beleg Lieferadresse, or a
lessee list from the leasing companies.

## Files
- `sharp_pdf_state.json` — raw per-line struck/mark state extracted from the 6 PDFs (LLM vision; best-effort).
- `sharp_owners_final.csv` — the scored, deduped owner list (one row per customer).
