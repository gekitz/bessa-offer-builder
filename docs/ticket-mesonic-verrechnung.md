# Ticket → Mesonic Verrechnung (Reparaturscheine als WinLine-Belege)

Status: **Planung** (2026-09-01). Mesonic-Write-Back-Mechanik ist live-verifiziert
(siehe `src/features/offers/lib/angebotImport.ts`), hier geht es um die
Verdrahtung mit dem Ticket-System.

## Ablauf (fachlich)

1. Techniker legt pro Ticket einen oder mehrere **Reparaturscheine** an
   (`repair_orders`), erfasst Arbeitszeit/Anfahrt (`repair_order_entries`) +
   Material (`repair_order_materials`), markiert jeden als `completed`.
2. Sobald ein Reparaturschein `completed` ist, wandert das Ticket automatisch in
   den Status **`review`** (Prüfung) — heute schon so (`ticketApi.updateRepairOrder`).
3. **Georg + Herbert** prüfen das Ticket im Workspace (alles noch **mutable**).
4. Sind sie zufrieden → Ticket **abschließen** (Status `closed`, die bestehende
   „Ticket abschließen"-Aktion). **Genau in diesem Moment**: über **alle**
   Reparaturscheine iterieren und je einen WinLine-Beleg anlegen (immutable).
5. Mesonic fasst die Belege eines Kontos automatisch zu **einer Sammel-Faktura**
   zusammen und schickt sie an den Kunden (Heri/Mesonic-seitig, nicht unser Teil).

Leitprinzip: **Alles Veränderliche bleibt im Workspace; erst beim Abschluss
entsteht das Unveränderliche in Mesonic.** Spätere Korrekturen = manuelle
Gutschrift in Mesonic.

## Regeln (mit Georg/Heri fixiert)

- **Alle** Reparaturscheine eines Tickets gehen über — **kein** Filter auf
  `billable` oder Unterschrift.
- **Ein WinLine-Beleg pro Reparaturschein**, Belegart **12 (WO) / 16 (KL)**
  (künftig beide 17), Belegstufe 1 (Angebot), Vorlage `WEBAngebot`.
- **Idempotent**: ein Reparaturschein mit bereits vergebenem Beleg-Key wird
  übersprungen → erneutes Abschließen legt nichts doppelt an.
- **Admin-only** (Georg + Herbert).
- **Konto-Pflicht**: ohne `tickets.mesonic_customer_id` kein Export → klare
  Meldung „Kunde erst mit WinLine verknüpfen".

## Position → Mesonic-Zeile (Mapping)

Ausgangsbasis ist die bestehende Billing-Engine (`billing.ts`,
`calcTicketBilling`) — sie liefert je Reparaturschein `BillingPosition[]`.

| Billing-`kind`   | Mesonic-Artikel | Menge | Einzelpreis (netto) |
|------------------|-----------------|-------|---------------------|
| `labor`          | Mitarbeiter-Artikel `30000XX{WO/KL}` | Stunden | Satz |
| `travel_wegzeit` | Mitarbeiter-Artikel `30000XX{WO/KL}` | Stunden | Satz |
| `travel_km`      | Mitarbeiter-Artikel `30000XX{WO/KL}` | km | €/km |
| `travel_flat`    | **Zonen-Artikel** `travel_zones.mesonic_artikel_nr` (31000xxx) | 1 | Zonenpreis |
| `material`       | **echte** Artikelnummer (`repair_order_materials.mesonic_artikel_nr`) | Stk | Preis |
| `service_flat`   | **Pseudoartikel** `99991234{KL/WO}` | 1 | Pauschale |
| `adjustment`     | **Pseudoartikel** `99991234{KL/WO}` | 1 | signierter Betrag |

Merke: Anfahrt ist **entweder** Zonen-Pauschale (`travelMode='pauschale'` →
Zonen-Artikel) **oder** km+Wegzeit (`km_plus_wegzeit`/`km_inkl_wegzeit` →
Mitarbeiter-Artikel). Nie beides. Die 31000xxx-Zonen-Artikel bleiben also
in Gebrauch; nur die km/Wegzeit-Welt läuft über den Mitarbeiter-Artikel.

## Mitarbeiter-Artikel `30000XX{WO/KL}`

`300000` + 2-stellige Vertreternummer (führende Null) + `WO`/`KL`.
Code: `laborArtikelnummer(vertreternummer, standort)` in `angebotImport.ts`
(getestet). Belegart nach **Ticket-Standort** (WO 12 / KL 16).

### Vertreternummern (aus „Telefonverzeichnis Mitarbeiter 2025", Spalte V)

Techniker/EDV (die Reparaturscheine schreiben):

| V | Mitarbeiter | E-Mail | Standort |
|---|-------------|--------|----------|
| 9  | Scheiber Heribert (Heri) | sh@kitz.co.at | Wolfsberg |
| 12 | Graf Mario | gm@kitz.co.at | Wolfsberg |
| 15 | Oberlerchner Christian | oc@kitz.co.at | Wolfsberg |
| 17 | Kumpusch Sandro | s.kumpusch@kitz.co.at | Wolfsberg |
| 19 | Maier Marc | mm@kitz.co.at | Wolfsberg |
| 21 | Buchbauer Marco | bm@kitz.co.at | Wolfsberg |
| 28 | Bauer Stefan | bs@kitz.co.at | Wolfsberg |
| 33 | Russnig Heimo | rh@kitz.co.at | Klagenfurt |
| 34 | Flagel Alexander | fa@kitz.co.at | Klagenfurt |
| 37 | Huber Anton | ha@kitz.co.at | Klagenfurt |
| 44 | Filipovic Pavo | fp@kitz.co.at | Klagenfurt |
| 46 | Klein Marcel | kma@kitz.co.at | Klagenfurt |
| 26 | Kitz Georg | kg@kitz.co.at | Klagenfurt |
| 10 / 35 | Kitz Herbert | kh@kitz.co.at | Wolfsberg **10** / Klagenfurt **35** |

Weitere (Verkauf/Büro, schreiben i. d. R. keine Reparaturscheine): Bauer
Helmut 2, Scharf-Kraxner Daniel 16, Nowak Andreas 36, Triebelnig Gudrun 30,
Kitz Dorothea 7; Büro-Sammel-V **22** (Thorer/Zmug/Kriegl/Riedl — **nicht
eindeutig!**).

Seed-Weg: `UPDATE employees SET mesonic_rep_id = … WHERE email = …`
(E-Mail ist der verlässliche Join-Key; `mesonic_rep_id` NICHT als Unique
anlegen — V22 ist mehrfach vergeben).

### Fixiert (2026-09-01)

1. **Herbert → 10** (Wolfsberg). Die KL-Nummer 35 bleibt ungenutzt.
2. **Suffix = Heimat-Standort des Technikers.** Das `WO/KL` am Mitarbeiter-
   Artikel folgt dem Standort des Mitarbeiters (`employees.standort_id`), der
   Artikel ist damit eine feste Eigenschaft des Mitarbeiters. **Belegart** (12/16)
   und **Pseudoartikel**-Suffix folgen weiterhin dem **Ticket-Standort**. D. h.
   eine `…WO`-Arbeitszeile darf auf einem Belegart-16-(KL-)Beleg stehen.

## Status 2026-09-01 — Steps 1–4 gebaut, live-validiert

- **Verrechnet wird = die Abrechnungs-Vorschau**: verrechenbare (`billable`),
  nicht stornierte Scheine. Nicht-verrechenbare (Garantie/Kulanz) lösen KEINE
  Faktura aus — WYSIWYG statt „alle" wörtlich.
- **readMaxLaufnummer live verifiziert** (Konto 272765: reale Belege 1..25
  fortlaufend → nächste = 26). Scannt `<konto>-<n>` (fetchCustomerBelege).
- **Cross-Standort-Arbeitsartikel bestätigt**: ein `…WO`-Artikel (30000009WO)
  auf einem Belegart-16-(KL-)Beleg validiert mit `OverallSuccess=true`. Der
  Heimat-Standort-Suffix ist also auch bei standortfremden Tickets ok.
- **UI**: Button „Belege in WinLine anlegen" im Abschluss-Dialog
  (`TicketBillingPreview`), admin-only, Konto-Guard, zeigt angelegte Beleg-Keys.
  Idempotent (bereits exportierte Scheine werden übersprungen).
- **Offen**: die zwei Test-Belege 272765-998/999 stornieren; ein echter
  End-to-End-Create auf einem Wegwerf-Ticket, bevor es „scharf" genutzt wird.

## Was fehlt (Build) — erledigt, Referenz

### 1. Schema + Seed
- `employees.mesonic_rep_id` (TEXT) hinzufügen + aus obiger Tabelle seeden
  (per E-Mail).
- `repair_orders`: Beleg-Tracking-Spalten — `mesonic_beleg_laufnummer` (INT),
  `mesonic_beleg_key` (TEXT, `<konto>-<laufnummer>`), `mesonic_beleg_created_at`
  (TIMESTAMPTZ). (`tickets.mesonic_beleg_id` bleibt, reicht aber nicht — 1 Beleg
  je Reparaturschein.)

### 2. Transform (pure, getestet)
`repairOrderToBelegPositions(billing, { standort, repIdByEmployeeId })`
→ `AngebotPosition[]` gemäß Mapping oben. Reiner Datentransform, voll testbar
(mirror zu `angebotImport.test.ts`).

### 3. Edge-Function (Orchestrierung)
Neue Funktion (Vorbild `send-offer` / `daily-offer-nag`), server-seitig:
- Mesonic-Session (Proxy/Session-Cache).
- Je Konto: bestehende Belege lesen → **Laufnummer = max+1** (fortlaufend,
  eindeutig pro Konto), kleines Kollisionsfenster → Retry.
- Je Reparaturschein: XML bauen (`buildAngebotImportXml`, Belegart 12/16),
  Beleg anlegen (ActionCode 1), zurückgegebene VoucherNumber + Key auf
  `repair_orders` schreiben.
- Bereits exportierte Reparaturscheine überspringen (Idempotenz).
- Teil-Erfolg sauber zurückmelden (welche Scheine ok, welche nicht).

### 4. UI
- Den bereits vorhandenen, deaktivierten Button „Mesonic-Beleg erstellen"
  (`TicketBillingPreview.tsx`) aktivieren — als Teil des Abschlusses aus
  `review`.
- Konto-Guard, Fortschritt/Ergebnis („3 Belege angelegt: 272765-101/102/103"),
  Fehleranzeige, Doppel-Klick-Schutz.

## Reviewer-Dashboard (separat, danach)

Eigener Admin-Tab für Georg + Herbert (nicht die Leitstelle), aggregiert
bestehende „braucht Aufmerksamkeit"-Queues:
- Tickets `status = 'review'` (→ Freigabe → Mesonic)
- Urlaub/Krank `status = 'pending'` (`useApproverPendingCount`)
- Beschaffung (offene Bestell-Requests)
- (später) Angebote „Aktion nötig", unzustellbare Mails

Dünne Aggregationsschicht über vorhandene Hooks; jede Zeile verlinkt in das
Feature. Unabhängig vom Mesonic-Flow (der funktioniert aus dem Ticket-Detail).
</content>
