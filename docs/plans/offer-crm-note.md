# Plan: Auto-post a CRM Aktion (offer link) to Mesonic on offer save

## Goal
When an offer is saved, post a WinLine **CRM Aktion** (WebCRM, workflow 10241)
to the customer's Mesonic account containing a link to the offer. Because most
offers have no Mesonic Kd.-Nr., resolve the customer **with a human-in-the-loop
dialog** (pick an existing WinLine customer or create one) rather than
auto-matching. Post **once per offer**, best-effort (never block saving).

## Confirmed facts (from code scan)
- `saveOffer(...)` in `src/lib/offerApi.js` returns the full offers row incl.
  `id`, `share_code`, `mesonic_customer_id`, `status`. Called from
  `OfferBuilderPage.jsx`: `handleSave()` (~L969, "Speichern"), `handleSend()`
  (~L1021, saves then sends), `handlePrint()` (~L816), `handleCopyLink()` (~L916).
- Public offer link: `https://bessa.kitz.co.at/?a=<share_code>` (query param,
  HashRouter app; same URL the send-offer edge fn builds as `${PUBLIC_APP_URL}/?a=<code>`).
- `offers` has `mesonic_customer_id TEXT` (nullable, indexed) — set only if the
  frontend passes `customer.mesonicId`, which the builder does NOT today → almost
  always null.
- CRM primitives ready: `buildCrmNoteXml()` (`src/features/offers/lib/crmNoteImport.ts`,
  WebCRM XSD-exact) + `mesonicImport(TYPES.CRM /*34*/, 'WebCRM', xml, {actionCode:1})`.
  A successful import returns `<KeyValue>CRM0-…</KeyValue>` (parse from `.raw`).
- Customer API (`src/lib/mesonicApi.js`): `searchCustomers(query)` (digits →
  by Kd.-Nr.; else `WHERE T055.C003 LIKE '%name%'`), `saveCustomer(fields,{actionCode})`
  (Kontonummer omitted → '+' → WinLine assigns; returns new Kd.-Nr. in `.raw`
  `<Kontonummer>`), `validateCustomer`.
- Builder `customer` state shape: `{ name, company, email, phone, address }`.

## Steps

### 1. Migration — idempotency anchor
`supabase/migrations/<ts>_offer_mesonic_crm_key.sql`:
- `ALTER TABLE offers ADD COLUMN mesonic_crm_key TEXT;`
- `CREATE INDEX idx_offers_mesonic_crm_key ON offers(mesonic_crm_key) WHERE mesonic_crm_key IS NOT NULL;`
- Stores the created Aktion key (e.g. `CRM0-33490`); its presence = "already posted".

### 2. offerApi — read/write the new fields
- Ensure `saveOffer`'s `select()` returns `mesonic_crm_key` (it selects `*` → fine; verify).
- Add `export async function updateOfferMesonic(id, { mesonicCustomerId?, mesonicCrmKey? })`
  → patches only the provided columns. Used to persist the resolved Kd.-Nr. and
  the CRM key back onto the offer.

### 3. Pure CRM-note orchestration — `src/features/offers/lib/offerCrmNote.ts`
- `buildOfferCrmFields(offer, shareUrl)` → `{ workflowNummer: 10241, zeilennummer: 1,
  kundenkonto, kurzbeschreibung: 'Angebot ' + (company||name||'Kunde'),
  langbeschreibungIntern: 'Angebot-Link: ' + shareUrl }`.
- `offerShareUrl(shareCode)` → `https://bessa.kitz.co.at/?a=<code>` (use a base
  const; mirror send-offer). Guard: no share_code → no post.
- `parseCrmKey(rawXml)` → `<KeyValue>…</KeyValue>` or null.
- `postOfferCrmNote({ kundenkonto, offer }, deps)` where `deps = { importCrm }`:
  builds xml via `buildCrmNoteXml`, calls `importCrm(xml)`, returns
  `{ success, key }`. Pure/injected for tests (no direct supabase/mesonic import).
- Unit tests: correct fields/label/link; key parsed; no share_code → skip.

### 4. Customer-resolve dialog — `src/features/offers/components/CustomerResolveDialog.jsx`
Modal, opened when an offer needs a Kd.-Nr. Props:
`{ open, customer, offerLabel, onResolved(kdNr), onCancel }`.
- On open: prefill a search box with `customer.company || customer.name`; run
  `searchCustomers` immediately; show a spinner.
- Results list: Kd.-Nr., Name, Ort/Strasse (parse from the export rows). Each row
  → **Auswählen** button → `onResolved(kdNr)`.
- Editable search term + **Suchen** to re-query.
- **"Neu in WinLine anlegen"** button → `saveCustomer({ Name: company||name,
  'E-Mail': email, Telefon: phone, Strasse: address }, {actionCode:1})`, parse the
  new Kd.-Nr., `onResolved(newKdNr)`. Show validate errors inline.
- **Abbrechen** → `onCancel()` (offer saved, note skipped, re-prompt on a later save).
- German UI strings. Use the project's custom Select if any dropdown is needed
  (none expected — it's a list + buttons). No native `<select>`.
- Loading/empty/error states. Never throw to the caller.

### 5. Wire into the save flow — `OfferBuilderPage.jsx`
Add `maybePostOfferCrmNote(savedOffer)` called after `saveOffer` resolves in
`handleSave` and `handleSend` (guarded, so it runs once):
- If `savedOffer.mesonic_crm_key` → return (already posted).
- Else if `savedOffer.mesonic_customer_id` → post directly:
  `postOfferCrmNote` → on success `updateOfferMesonic(id,{mesonicCrmKey:key})` +
  update local `currentOffer`/state. Best-effort: catch + `console.warn` + small
  non-blocking toast; never throw.
- Else → open `CustomerResolveDialog` (store the saved offer in state for the
  dialog's callback). On `onResolved(kdNr)`:
  `updateOfferMesonic(id,{mesonicCustomerId:kdNr})` → `postOfferCrmNote` →
  `updateOfferMesonic(id,{mesonicCrmKey:key})` → close dialog. All best-effort.
- Do NOT re-open the dialog within the same save if the user cancelled (track a
  transient "dismissed for this offer this session" flag to avoid nagging on
  rapid re-saves).
- The CRM work must not delay the "Gespeichert!"/send UX — run it after the
  existing success feedback.

### 6. Tests (mock Mesonic — no live calls)
- `offerCrmNote.test.ts`: field/label/link building; `parseCrmKey`; share-url; the
  `postOfferCrmNote` happy path + import failure (returns `{success:false}` w/o throwing).
- `CustomerResolveDialog.test.tsx`: renders search results from a mocked
  `searchCustomers`; **Auswählen** calls `onResolved` with the Kd.-Nr.;
  **Neu anlegen** calls a mocked `saveCustomer` and resolves with the new Kd.-Nr.;
  cancel calls `onCancel`.
- A wiring test (or logic-extracted helper test) for `maybePostOfferCrmNote`:
  skip when `mesonic_crm_key` set; direct-post when `mesonic_customer_id` set;
  dialog path when neither.

## Explicitly out of scope / decided
- **Trigger:** first save (once per offer) — user-chosen. Guarded by `mesonic_crm_key`.
- **No silent auto-create / fuzzy auto-match** — customer resolution is always
  human-confirmed via the dialog (the whole point).
- **Best-effort:** a Mesonic outage/hang never blocks or fails the offer save.
- Storing the reverse link (offer id) on the WinLine side — not needed; the Aktion
  carries the offer link, and `offers.mesonic_crm_key` carries the Aktion key.
- The WebCRM contract itself (done, live-verified, XSD in `docs/mesonic/WebCRM.xsd`).

## File touch list
- `supabase/migrations/<ts>_offer_mesonic_crm_key.sql` (new)
- `src/lib/offerApi.js` (updateOfferMesonic; verify select includes new col)
- `src/features/offers/lib/offerCrmNote.ts` (new) + test
- `src/features/offers/components/CustomerResolveDialog.jsx` (new) + test
- `src/features/offers/pages/OfferBuilderPage.jsx` (wire maybePostOfferCrmNote + dialog state)
