# Ticket → Lieferschein (gelieferte Ware als WinLine-Beleg)

Status: **Planung** (2026-09-09). Ergänzt den bestehenden Reparaturschein-Flow
(`docs/ticket-mesonic-verrechnung.md`) um die **gelieferte Ware**. Die
Write-Back-Mechanik (WEBAngebot-Import, Laufnummer, Idempotenz) ist
live-verifiziert und wird 1:1 wiederverwendet.

## Warum (die Lücke)

Heute erreicht **nur die Arbeit** Mesonic: pro Ticket werden Reparaturscheine
zu WinLine-Belegen, Mesonic bündelt sie zur Sammel-Faktura. Die **verkaufte
Ware** aus dem angenommenen Angebot fließt **nirgends** in diese Rechnung ein —
der Trigger `create_ticket_for_accepted_offer()` übernimmt nur Kundendaten +
den Arbeitszeit-Floor-Snapshot; die Angebotspositionen bleiben in
`offers.offer_data` liegen.

Der **Lieferschein ist der fehlende Kanal**, der die gelieferten Güter neben die
Reparaturscheine auf dieselbe Rechnung bringt. Wie der Reparaturschein wird er
vom Kunden **unterschrieben**.

## Ablauf (fachlich)

1. Techniker legt pro Ticket einen oder mehrere **Lieferscheine** an
   (`delivery_notes` + `delivery_note_items`), vorbefüllt aus dem angenommenen
   Angebot (ohne Arbeitszeit/Dienstleistung), **voll editierbar** — der
   Lieferschein zeigt, was **tatsächlich übergeben** wurde (Teillieferung,
   Ersatz, Rückstand).
2. Bei Übergabe: Kunde **unterschreibt** (gleiche Signatur-Mechanik wie
   Reparaturschein). Unterschrift kann **vor** Ticket-Abschluss passieren.
3. **Georg + Herbert** prüfen das Ticket im Workspace (alles noch **mutable**).
4. Ticket **abschließen** (Status `closed`) → **genau in diesem Moment**: über
   alle nicht-stornierten Lieferscheine **und** Reparaturscheine iterieren und
   je einen WinLine-Beleg anlegen (immutable).
5. Mesonic fasst die Belege eines Kontos zur **Sammel-Faktura** zusammen
   (Heri/Mesonic-seitig).

Leitprinzip unverändert: **Alles Veränderliche bleibt im Workspace; erst beim
Abschluss entsteht das Unveränderliche in Mesonic.**

## Regeln (fixiert 2026-09-09)

- **Mehrere Lieferscheine pro Ticket** (Teillieferungen) — spiegelt
  `repair_orders` 1:1.
- **Export unabhängig von der Unterschrift** — alle nicht-stornierten
  Lieferscheine gehen beim Abschluss über (wie Reparaturscheine). Unterschrift
  dringend empfohlen, aber nicht blockierend.
- **Vorbefüllung aus dem Angebot ohne Arbeitszeit/Dienstleistung** — Arbeit
  läuft über Reparaturschein + Floor. Alles andere (Hardware, Küchenmonitore,
  Kiosk, Orderman, Module/Lizenzen) kommt rein und wird kuratiert.
- **Seriennummern** je physischer Einheit: eine Zeile mit Menge 4 hat bis zu 4
  Seriennummern. Erfasst pro Einheit, mit **Scan-Button** (Handy-Kamera →
  Barcode). Serialisiert = Produkt-Flag `products.is_serialized` (Fallback:
  Kategorie Hardware/Küchenmonitor/Kiosk/Orderman).
- **Admin-Guard + Konto-Pflicht** wie beim Reparaturschein-Export.

## Position → Mesonic-Zeile (Mapping)

Reiner Datentransform `deliveryNoteToBelegPositions()` (Spiegel zu
`repairOrderToBelegPositions()`), Ergebnis = `AngebotPosition[]` für
`buildAngebotImportXml`.

| Lieferschein-Zeile | Artikelnummer | Datentyp | Menge | Einzelpreis (netto) | Bezeichnung |
|--------------------|---------------|----------|-------|---------------------|-------------|
| echtes Produkt     | `products.mesonic_artikel_nr` | `1` | Stk | Netto-Stückpreis | siehe unten |
| Freitext/Custom    | `TEXT`        | `3` | Stk | Netto | Freitext |

**Bezeichnung mit Seriennummern** (fix): `{menge}x {bezeichnung} <s1>, <s2>, …`
— z. B. `4x Sunmi L3 SN-A1, SN-A2, SN-A3, SN-A4`. `Mengegeliefert` bleibt die
numerische Menge, `Einzelpreis` der Netto-Stückpreis. **Kein** eigenes
Seriennummer-Feld im Beleg nötig.

## Datenmodell (neu)

Spiegelt `repair_orders` / `repair_order_materials`.

```sql
CREATE TABLE delivery_notes (
  id                       UUID PK,
  ticket_id                UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  seq_number               SMALLINT NOT NULL DEFAULT 1,   -- Trigger wie repair_orders
  status                   TEXT DEFAULT 'draft'
                           CHECK (status IN ('draft','signed','cancelled')),
  delivery_note            TEXT,                          -- Freitext-Kopfnotiz
  signature_data           TEXT,                          -- base64 PNG (SignaturePad)
  signed_at                TIMESTAMPTZ,
  signed_by_name           TEXT,
  performed_at             DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Mesonic-Beleg-Tracking (Idempotenz, wie repair_orders)
  mesonic_beleg_laufnummer INTEGER,
  mesonic_beleg_key        TEXT,                          -- '<konto>-<laufnummer>'
  mesonic_beleg_created_at TIMESTAMPTZ,
  created_by               UUID REFERENCES employees(id),
  created_at / updated_at  TIMESTAMPTZ
);

CREATE TABLE delivery_note_items (
  id                 UUID PK,
  delivery_note_id   UUID NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  mesonic_artikel_nr TEXT,                 -- NULL/TEXT = Freitext
  bezeichnung        TEXT NOT NULL,
  quantity           NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  is_freetext        BOOLEAN NOT NULL DEFAULT FALSE,
  serial_numbers     TEXT[]  NOT NULL DEFAULT '{}',   -- eine je Einheit
  created_at         TIMESTAMPTZ
);

ALTER TABLE products ADD COLUMN is_serialized BOOLEAN NOT NULL DEFAULT FALSE;
```

RLS/Storage/Public-Share: gleiche Policies wie `repair_orders` (permissiv
intern; anon nur `status='signed'` über `share_code`).

## Build-Phasen

**Status:** Phase 1–4 gebaut (2026-09-09). Lieferschein-Belegart = **19**
(fixiert mit Georg). Belege werden beim Ticket-Abschluss neben den
Reparaturschein-Belegen (17/18) angelegt und teilen sich die Konto-Laufnummer-
Sequenz. Noch nicht live end-to-end auf einem Wegwerf-Ticket verifiziert (wie
seinerzeit beim Reparaturschein) — vor Scharfschaltung einmal echt durchspielen.

**Phase 1 — Daten + Seeding (app-seitig, ungeblockt) ✅**
Migration (Tabellen + `is_serialized` + Seed-Flag pro Produkt); `deliveryNoteApi`
(CRUD, `signDeliveryNote` ~ `signRepairOrder`); Seed-Helper aus `offer_data`
(filtert Arbeitszeit/Dienstleistung/Abo). Tests auf Transform + Seed-Filter.

**Phase 2 — UI (ungeblockt) ✅**
Lieferschein-Abschnitt im Ticket-Detail (spiegelt Reparaturschein-Liste);
Positions-Editor mit Menge/Preis + `quantity` Seriennummer-Feldern je Zeile;
`<BarcodeScanButton>`; `SignatureCapture` unverändert wiederverwenden.

**Phase 3 — PDF + Portal (ungeblockt) ✅**
`DeliveryNotePdfDocument` (EIN Dokument für Staff + Portal, da der Lieferschein
keine internen Daten trägt) + `generateDeliveryNotePdf`; Download-Button im
Detail; Portal: RLS für anon-signed, `getPublicSignedDeliveryNote`,
`PublicSignedDeliveryNoteModal`, Timeline-Meilenstein zeigt jetzt
Reparaturschein UND Lieferschein („Beleg ansehen"). Seriennummern als S/N-Zeile
unter der Position.

**Phase 4 — Mesonic-Export ✅ (Belegart 19)**
`deliveryNoteToBelegPositions()` + `planDeliveryNoteBelege()` (Belegart 19) +
Einbindung in `exportTicketBelege` beim Abschluss. Lieferschein-Laufnummern
starten NACH den Reparaturschein-Belegen (max + Anzahl Rep-toCreate), damit die
Konto-Sequenz kollisionsfrei geteilt wird. Idempotenz über
`delivery_notes.mesonic_beleg_key`. Serials in die Bezeichnung gefaltet
(`4x Sunmi L3 <s1>, …`). UI: der bestehende „Belege in WinLine anlegen"-Button
legt jetzt Rep- UND Lieferschein-Belege an (auch bei reiner Warenlieferung ohne
Reparaturschein) und zeigt beide Ergebnis-Gruppen.

**Offen:** einmal live end-to-end auf einem Wegwerf-Ticket verifizieren (Beleg
19 wird angelegt + landet auf der Sammel-Faktura); bei Bedarf die 19-Belege
danach in Mesonic stornieren.

### Barcode-Scanner (`<BarcodeScanButton>`)
Native `BarcodeDetector`-API (Android/Chrome) + `@zxing/wasm`-Fallback (iOS
Safari). Rückkamera via `getUserMedia({ video: { facingMode: 'environment' } })`
in einem Modal; dekodierter Wert → Seriennummer-Feld. HTTPS ist über GitHub
Pages gegeben. Wiederverwendbar (später Beschaffung/Viertl).

## Seed-Annahmen (Phase 1 — später zu prüfen/korrigieren)

Beim Vorbefüllen aus dem Angebot (`buildDeliveryItemsFromOffer`,
`src/features/tickets/lib/deliveryNoteSeed.ts`) wurden aus „alles außer
Arbeitszeit" drei konkrete Annahmen getroffen. **Georg erwartet, dass wir das
später anpassen müssen** — hier festgehalten, damit klar ist, wo geschraubt wird:

1. **Monats-Positionen (`t:'m'`, z. B. Kassa-Software/Module) werden mit-
   geseedet**, bepreist mit dem gewählten Tarif (Tier). Literale Lesart von
   „alles außer Arbeitszeit". Falls Abos NICHT auf den Lieferschein sollen:
   ein Filter in `deliveryNoteSeed.ts` (z. B. `isMonthly` überspringen).
2. **Kopierer/MFP (`t:'copier'`) als eine Zeile zum Netto-VK** (`item.vk`),
   ohne Leasing-Expansion. Das gelieferte Gerät + Seriennummer; die Leasing-
   Rechnung bleibt am Angebot. Ggf. später feiner abbilden.
3. **Gelieferte Menge = `qty + discountQty`** (auch rabattierte/Gratis-Stück
   werden physisch übergeben). Einzelpreis = voller Netto-Stückpreis.

Alles ist im UI editierbar — die Annahmen betreffen nur den Startzustand.

## Offen — an Heri/Mesonic (blockt NUR Phase 4)

1. **Belegart + Belegstufe** eines echten Lieferscheins beim `WEBAngebot`- bzw.
   passenden Import (analog 17=Angebot / 18=Reparaturauftrag).
2. Bündelt Mesonic den Lieferschein-Beleg mit den Angebot-stufigen
   Reparaturschein-Belegen (17/18) zur **selben Sammel-Faktura**? Falls nicht:
   welche Stufe/welcher Belegtyp bringt Ware + Arbeit auf eine Rechnung?
3. Bestätigen, dass Seriennummern in der Positions-**Bezeichnung** fachlich ok
   sind (kein separates Feld nötig).

## Referenz (wiederverwendete Bausteine)

| Zweck | Datei |
|-------|-------|
| Beleg-XML + Import | `src/features/offers/lib/angebotImport.ts` (`buildAngebotImportXml`) |
| Export-Orchestrierung | `src/features/tickets/lib/ticketBelegExport.ts`, `runTicketBelegExport.ts` |
| Reparaturschein-Transform (Vorbild) | `src/features/tickets/lib/repairOrderBeleg.ts` |
| Signatur | `src/features/tickets/components/SignatureCapture.tsx`, `offers/components/SignaturePad.tsx` |
| PDF (Vorbild) | `src/pdf/RepairOrderPdfDocument.jsx`, `PublicRepairOrderPdfDocument.jsx`, `pdfStyles.js` |
| Ticket-Schema (Vorbild) | `supabase/migrations/20260512120000_create_tickets.sql` |
| Offer→Ticket-Trigger | `supabase/migrations/20260710160000_offer_accepted_creates_ticket.sql` |
