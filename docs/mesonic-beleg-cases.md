# Wann legen wir einen Beleg im Mesonic (WinLine) an?

Dieses Dokument fasst zusammen, in welchen Fällen die BESSA-App einen **Beleg in
Mesonic/WinLine** erzeugt, welche **Belegart** dabei verwendet wird, was der
Auslöser ist und ob der Export blockierend oder „fire-and-forget" läuft.

> Stand: 2026-09-22. Quelle: Code in `src/features/**` und
> `supabase/functions/export-offer-angebot/`. Bei Widersprüchen gilt der Code.

---

## Überblick: unsere Import-Belegarten

Seit Heri (2026-09) haben wir eigene, **standortübergreifende** Import-Belegarten.
Der Standort (Klagenfurt/Wolfsberg) steckt nicht mehr in der Belegart, sondern
im **KL/WO-Suffix der Artikelnummer** (steuert die Lagerbuchung).

| Belegart | Name              | Wofür                                    |
|:--------:|-------------------|------------------------------------------|
| **17**   | Angebot           | Angenommenes Offert → WinLine-Angebot    |
| **18**   | Reparaturauftrag  | Reparaturschein-Verrechnung eines Tickets|
| **19**   | Lieferschein      | Gelieferte Ware (Ticket) **und** Leihstellung |

Definiert in `src/features/offers/lib/angebotImport.ts`
(`BELEGART`, `REPARATUR_BELEGART`, `LIEFERSCHEIN_BELEGART`).

**Gemeinsame Technik (alle vier Fälle):**
- Schnittstelle: `WEBBelegImport` (Type 30, `WEBAngebot`), `MESOWebService`-Envelope
  mit Pflicht-Attribut `option="0"` (= neuen Beleg anlegen).
- Weg: über den **`mesonic-proxy`** Edge-Function (mit Staff-JWT bzw. Service-Role
  bei der Server-Automatik). Kein Mesonic-Secret im Client.
- **Laufnummer**: eindeutig pro Konto, wir vergeben `max(vorhandene) + 1`
  (`readMaxLaufnummer` scannt die bestehenden Belege des Kontos).
- **Einzelpreis = netto**, `Zeilenrabatt1` = Prozent negativ (z. B. `-10` für 10 %).
- **Datentyp**: `1` = Artikel folgt, `3` = Text (Artikelnummer = `TEXT`).

---

## Fall 1 — Angenommenes Angebot → WinLine-Angebot (Belegart 17)

**Auslöser:** Ein Kunde **nimmt ein Angebot an** (beide Wege: Unterschrift ODER
Stripe-Zahlung).

**Was passiert:**
- **Automatik (Standardpfad):** Der DB-Trigger auf Angebotsannahme feuert per
  `pg_net` die Edge-Function **`export-offer-angebot`** — genau wie
  `notify-offer-accepted`. Diese baut aus dem eingefrorenen `lineSnapshot` des
  Angebots **Freitext-Positionen** und importiert sie über den `mesonic-proxy`,
  damit die Buchhaltung das Angebot in WinLine findet.
- **Manueller Fallback:** Im Angebots-Detail (`OfferListPage`) gibt es einen
  Button, der `runOfferAngebotExport` im Browser ausführt — z. B. für alte
  Angebote, die bei der Annahme noch keinen verknüpften Mesonic-Kunden hatten
  und erst später einen bekamen.

**Blockierend?** Nein — die Automatik ist **fire-and-forget** und blockiert die
Angebotsannahme nie.

**Bedingungen / Guards:**
- **Idempotent:** Angebote mit bereits gesetztem `mesonic_beleg_key` werden
  übersprungen.
- **Kein verknüpfter WinLine-Kunde** → Status `skipped_no_customer`, kein Export.
  Staff kann den Kunden verknüpfen und aus dem Angebots-Detail neu anstoßen.

> ⚠️ Bekannte Lücke: Der `pg_net`-POST ist fire-and-forget — landet er nie
> (z. B. Netzwerk), wird **kein** Fehlerstatus vermerkt (silent). Eine
> Reconciliation-Cron ist bewusst zurückgestellt.
> Siehe `project_offer_angebot_export_gap`.

**Code:** `supabase/functions/export-offer-angebot/index.ts`,
`src/lib/offerAngebot.ts` (reine Mapping-Logik, geteilt),
`src/features/offers/lib/runOfferAngebotExport.ts` (Browser-Fallback).

---

## Fall 2 — Reparaturschein-Verrechnung → Reparaturauftrag (Belegart 18)

**Auslöser:** Staff exportiert ein **Ticket zur Verrechnung** (Button in der
`TicketBillingPreview` im Ticket-Detail).

**Was passiert:** Pro **Reparaturschein** des Tickets wird **ein** Beleg
(Belegart 18) angelegt. Die Billing-Positionen werden auf Mesonic-Artikel
gemappt:

| Billing-Art        | Mesonic-Artikel                       | Suffix folgt … |
|--------------------|---------------------------------------|----------------|
| Arbeitszeit / Wegzeit / km | Mitarbeiter-Artikel `300000` + 2-stellige Vertreternummer | **Heimat-Standort des Mitarbeiters** |
| Anfahrtspauschale  | Zonen-Artikel `31000xxx`              | –              |
| Material           | echte Artikelnummer                   | Ticket-Standort |
| Pauschale / Korrektur / labor_floor | Pseudoartikel `99991234` | Ticket-Standort |

> ⚠️ Wichtig: Beim **Mitarbeiter-Artikel** (Arbeitszeit) folgt das KL/WO-Suffix
> dem **Heimat-Standort des Mitarbeiters** (z. B. Vertreter 9/Heri in Wolfsberg
> → `30000009WO`), NICHT dem Ticket-Standort. Material und Pseudoartikel folgen
> dagegen dem **Ticket-Standort**.

**Blockierend?** Ja — der Export wird in der UI `await`-et; Teilerfolg und
Idempotenz sind pro Schein abgesichert (Laufnummer + Key persistiert).

**Bedingungen / Guards:**
- Idempotent pro Reparaturschein (bereits exportierte Scheine werden übersprungen).
- Angebot-Arbeitszeit-**Untergrenze** („labor_floor") wird in den letzten neuen
  Schein eingemischt und danach am Ticket hochgezählt, damit ein späterer
  Teil-Export nicht doppelt aufschlägt.

**Code:** `src/features/tickets/lib/ticketBelegExport.ts`,
`ticketBelegPlan.ts`, `repairOrderBeleg.ts`, `runTicketBelegExport.ts`.
Details: `docs/ticket-mesonic-verrechnung.md`.

---

## Fall 3 — Gelieferte Ware (Ticket) → Lieferschein (Belegart 19)

**Auslöser:** Selber Ticket-Export wie Fall 2. Hat ein Ticket **Lieferscheine**
(gelieferte Ware), werden diese **gemeinsam** mit den Reparaturschein-Belegen
exportiert (`runTicketBelegExport`) und teilen sich die **Laufnummer-Sequenz**
des Kontos.

**Was passiert:** Pro Lieferschein ein Beleg (Belegart 19). Positionen mit
hinterlegter `mesonic_artikel_nr` → **echte Artikelnummer** (KL/WO nach
Ticket-Standort, Datentyp 1) → Mesonic bucht das richtige Lager ab;
Freitext-Positionen → `TEXT` (Datentyp 3). **Seriennummern** werden in die
Bezeichnung gefaltet (`4x Sunmi L3  SN-A1, SN-A2, …`). Schließt die Lücke, dass
verkaufte Ware bisher nie in die Verrechnung kam; landet neben den
Rep-Schein-Belegen auf der Sammel-Faktura des Kontos.

**Wichtig:** Unterschrift ist **nicht** Voraussetzung — alle nicht-stornierten
Lieferscheine werden exportiert. Die Laufnummern schließen an die
Rep-Schein-Belege desselben Exports an (keine Lücken/Kollisionen).

**Blockierend?** Ja (Teil des Ticket-Exports).

**Bedingungen / Guards:** Idempotent pro Lieferschein (Key persistiert).

**Code:** `src/features/tickets/lib/deliveryNoteBelegPlan.ts`,
`deliveryNoteBeleg.ts`. Details: `docs/ticket-lieferschein.md`.

---

## Fall 4 — Leihstellung (Leihgerät) → Lieferschein (Belegart 19)

**Auslöser:** **Check-out einer Leihstellung** im „Leihgeräte"-Tab
(`CheckOutModal`). Zusätzlich manueller Retry aus dem `DeviceDetailModal`.

**Was passiert:** Ein Leih-Lieferschein (Belegart 19) mit **TEXT-Positionen**
(Datentyp 3): eine **Kopfzeile** mit dem Leihzeitraum („Leihstellung: Von
`<Leihbeginn>` bis `<Rückgabe>`/`offen`"), darunter je Gerät eine **schlanke
Zeile** nur mit Bezeichnung + Seriennummer (der Zeitraum steht nicht mehr
redundant auf jeder Gerätezeile).

**Blockierend?** Nein — nach dem Check-out **fire-and-forget** (wirft nie);
teilt die Primitive `readMaxLaufnummer` / `importBeleg` mit dem Reparaturschein-Export.

**Bedingungen / Guards:**
- Idempotent: Leihstellung mit gesetztem `mesonicBelegKey` wird übersprungen.
- Kein WinLine-Konto (`customerKdnr`, nur Bestandskunden) oder keine Geräte →
  Fehler, kein Export.
- `Einzelpreis = 0` (Leihstellungen sind nicht verrechenbar), eine TEXT-Position
  je Gerät.
- **Rückgabe (Check-in) erzeugt KEINEN Beleg** — nur einen CRM-Kommentar. Es
  gibt keinen Rücknahme-Lieferschein.

**Guardrail gegen Beleg-Wildwuchs (seit 2026-09):** Legt ein Mitarbeiter mehrere
Leihstellungen für denselben Kunden an (statt alle Geräte auf eine), entsteht je
Leihstellung ein eigener Lieferschein — der Kunde sammelt so viele Belege an.
Deshalb prüft der Check-out, ob der gewählte Kunde bereits eine **offene
Leihstellung** hat, und bietet an, die Geräte **dort anzuhängen**. In dem Fall
wird der bestehende Leih-Lieferschein per **`option="3"` (Beleg editieren)** unter
derselben Laufnummer erweitert — kein zweiter Beleg. Voraussetzung: die Vorlage
`WEBAngebot` trägt das Feld `Zeilennummerintern` (Heri 2026-09), über das WinLine
bestehende Zeilen eindeutig wiederfindet und nur die neuen ergänzt.

**Code:** `src/features/loaners/lib/loanBeleg.ts`, `runLoanBelegExport.ts`.
Details: `docs/leihstellungen.md`.

---

## Nicht (noch nicht) beleg-erzeugend

- **Feld-Inkasso / Field cash collection** — *geplant*, noch nicht gebaut:
  Techniker kassieren vor Ort über die BESSA-Kassa als Mesonic-Zahlungsterminal
  (Mesonic-Beleg → Push-Order → Cron-Matching → OP-Ausgleich).
  Siehe `docs/field-cash-collection.md`.
- **CRM-Import / Kontakte / Artikelpreise / Kundenanlage** — nutzen andere
  Mesonic-Schnittstellen (WebKontenImport, WEBKontakt, WEBArtikelPreise), das
  sind **keine Belege**.

---

## Zusammenfassung als Tabelle

| # | Auslöser | Belegart | Blockierend | Idempotenz-Anker |
|---|----------|:--------:|:-----------:|------------------|
| 1 | Angebot angenommen (Unterschrift/Stripe) | 17 Angebot | Nein (fire-and-forget, Server) | `mesonic_beleg_key` am Angebot |
| 2 | Ticket zur Verrechnung exportiert | 18 Reparaturauftrag | Ja | Key am Reparaturschein |
| 3 | Ticket-Export mit gelieferter Ware | 19 Lieferschein | Ja | Key am Lieferschein |
| 4 | Leihstellung Check-out | 19 Lieferschein | Nein (fire-and-forget) | `mesonicBelegKey` an der Leihstellung |
