# Mesonic-Setup: `WebBelegImport` — angenommene Angebote als Beleg zurückschreiben

**Ziel:** Wenn ein Angebot in der bessa-App angenommen wird, soll es in der WinLine
als **Beleg der Belegart "Angebot"** beim Kunden auftauchen.

**Status:** Die App-Seite (Proxy, Session, Import-Mechanik) ist fertig — sie kann
Type 30 bereits senden. Was noch **fehlt, ist die Vorlage `WebBelegImport` (Type 30)
in der WinLine** plus Schreibrecht für den Benutzer `CRM_API`. Genau derselbe
Zustand wie bei `WebKontenImport` vor dem 22.07. Solange die Vorlage fehlt bzw.
kein Schreibrecht hat, hängt jeder Import bis zum 30-Sekunden-Timeout (kein
sauberer Fehler — das ist das Erkennungszeichen).

Dieses Dokument ist die Schritt-für-Schritt-Anleitung für **die Mesonic-Seite**.
Du hast das für Kunden (`WebKontenImport`) schon einmal gemacht — hier ist das
Gegenstück für Belege.

---

## Die goldene Abkürzung

Die Vorlage **`WebKontenImport` funktioniert bereits** und ist im Grunde die
Blaupause. Der schnellste, fehlerärmste Weg:

1. Öffne die bestehende `WebKontenImport`-Vorlage und schau sie dir an, damit du
   die Klicks wiedererkennst.
2. Lege die neue Vorlage `WebBelegImport` **auf genau dieselbe Art** an — nur mit
   **Type 30 (Belege)** statt Type 1 (Konten) und den unten genannten Feldern.
3. Vergib **dasselbe Schreibrecht** für `CRM_API` wie bei `WebKontenImport`.

Wenn du bei einem Schritt unsicher bist: so wie bei `WebKontenImport`, nur für Belege.

---

## Teil A — Import-Vorlage anlegen

**Menü:** WinLine START → **Vorlagen** → **Vorlagen Anlage**
(dieselbe Stelle, an der `WebKontenImport` liegt).

1. **Neue Vorlage** anlegen.
2. **Typ / Bereich:** **Belege** (das ist Type **30** in der WebService-URL).
3. **Richtung:** **Import**.
4. **Treiber:** **`XML (Webservice)`** auswählen — *nicht* "XML (Export)".
   Nur "XML (Webservice)" erzeugt eine Vorlage, die der WebService
   (`/ewlservice/import`) nutzen kann.
5. **Name der Vorlage:** exakt **`WebBelegImport`** (genau so geschrieben — die App
   ruft diesen Namen fix auf).
6. **Belegart fest auf "Angebot" setzen.** ⚠️ Wichtig: Bei Belegen wird die
   **Belegart über die Vorlage/den Kontext bestimmt, nicht pro Datensatz im XML**
   (WinLine ignoriert eine Belegart, die im Import-Datensatz mitgeschickt wird).
   Deshalb muss die Vorlage `WebBelegImport` **fix an die Belegart "Angebot"
   gebunden** sein. Falls sich in *einer* Vorlage keine Belegart fix hinterlegen
   lässt, brauchen wir eine Angebots-spezifische Import-Vorlage — bitte kurz
   Rückmeldung, dann passe ich den Namen in der App an.

---

## Teil B — Diese Felder muss die Vorlage enthalten

Wir schicken **Freitext-Positionen** (kein Artikelstamm-Bezug) — unsere Angebote
enthalten Staffelpreise, Sonderkonditionen und Dienstleistungen, die sich nicht
1:1 auf Mesonic-Artikel abbilden lassen. WinLine erlaubt das: Textzeilen ohne
Artikelnummer werden als Belegzeilen übernommen.

### Belegkopf (Header) — einmal pro Beleg

| Feld | Beschreibung | Pflicht |
|------|--------------|---------|
| `Kontonummer` | Kundennummer (existierender WinLine-Kunde) | Ja |
| `Belegdatum` | Datum (Annahmedatum des Angebots) | Ja |
| `Bemerkung` / Belegtext | Freitext-Kopfzeile (Angebots-Referenz, z.B. bessa-ID) | Nein |

*(Belegart nicht als Feld — siehe Teil A, Punkt 6: sie steckt in der Vorlage.)*

### Belegpositionen (Zeilen) — mehrere pro Beleg, als Freitext

| Feld | Beschreibung | Pflicht |
|------|--------------|---------|
| `Bezeichnung` / Text | Positionstext (z.B. "BESSA Kassensoftware, 12 Monate") | Ja |
| `Menge` | Menge / Stück | Ja |
| `Einzelpreis` | Netto-Einzelpreis | Ja |
| `Steuercode` / MwStCode | Steuersatz-Kennzeichen (Standard 20 %) | Wenn möglich |

**⚠️ Feldreihenfolge ist entscheidend.** Genau wie bei `WebKontenImport` erzwingt
das XSD eine feste Reihenfolge (`xs:sequence`). Kommen die Felder in falscher
Reihenfolge, lehnt der Parser sie ab. **Bitte schick mir nach dem Anlegen das
XSD / die Feldliste der Vorlage in der exakten Reihenfolge** — dann baue ich den
XML-Generator der App passgenau (bei den Kunden hat uns genau das anfangs Zeit
gekostet).

---

## Teil C — Schreibrecht für `CRM_API` vergeben

**Das war beim Kunden-Import der 30-Sekunden-Hänger-Fehler.** Ohne Schreibrecht
blockiert der Import serverseitig bis zum Timeout — ohne Fehlermeldung.

**Menü:** Objekt-Berechtigungen (dieselbe Stelle, an der du `CRM_API` für
`WebKontenImport` freigeschaltet hast).

1. Benutzer **`CRM_API`** (WinLine-Benutzer #65), Mandant **2KCO**.
2. Vorlage **`WebBelegImport`** auswählen.
3. Berechtigung mindestens **(2) bearbeiten** vergeben (nicht nur (1) lesen).
4. Speichern.

---

## Teil D — Danach: so testen wir (gemeinsam)

Kein Blindflug — wir schreiben **nicht** sofort echt:

1. **Validate-only zuerst:** Die App sendet mit `ActionCode=0` (nur prüfen, kein
   Schreiben). Erwartete Antwort: `<OverallSuccess>true</OverallSuccess>` ohne
   Fehlercode. Das bestätigt, dass Vorlage + Felder + Reihenfolge stimmen.
2. **Erst dann Echt-Import** mit `ActionCode=1` — als Antwort kommt die vergebene
   **Belegnummer** zurück, die wir am Angebot speichern.

Für Schritt 1 gibt es in der App eine Test-Seite (`#test` → Mesonic-Test), analog
zum Kunden-Import — dort können wir einen konkreten Angebots-Beleg
trocken durchspielen, bevor irgendetwas geschrieben wird.

---

## Was ich von dir zurückbrauche (damit ich den App-Teil fertig baue)

1. ✅ Bestätigung, dass die Vorlage **`WebBelegImport`** angelegt und fix auf
   Belegart **"Angebot"** gebunden ist (oder: wie die Angebots-Belegart sonst
   gesetzt wird).
2. 📋 **Die exakte Feldliste / das XSD in Reihenfolge** (Kopf- und Positionsfelder,
   mit den genauen Feldnamen — Groß-/Kleinschreibung zählt).
3. ✅ Bestätigung, dass `CRM_API` **(2) bearbeiten** auf der Vorlage hat.
4. ❓ Wie werden **mehrere Positionen** im XML strukturiert? (Wiederholtes
   `<Position>`-Element? Verschachtelt? Bei `WebKontenImport` gab es nur eine
   Ebene — hier brauchen wir n Zeilen pro Beleg.)
5. ❓ Steuer: Erwartet die Vorlage einen **Steuercode** (Kennziffer) oder einen
   **Prozentsatz**? Welcher Code = 20 %?

Sobald ich (2) und (4) habe, baue ich `buildBelegImportXml()` + `saveBeleg()`
(analog zu `buildKontenImportXml`/`saveCustomer`) und wir testen validate-only.

---

## Offene Design-Punkte (App-Seite, kümmere ich mich drum)

- **Kunde muss in WinLine existieren.** Ein Beleg braucht eine `Kontonummer`. Die
  meisten Angebote haben aktuell keine `mesonic_customer_id`. Der Ablauf wird
  daher: bei Annahme zuerst prüfen/anlegen (via `saveCustomer`, existiert schon)
  → Kontonummer holen → dann Angebots-Beleg anlegen.
- **Auslöser:** DB-Trigger bei Angebots-Annahme (deckt beide Wege ab —
  Unterschrift *und* Zahlung) → Edge Function, die Mesonic aufruft. Neue Spalte
  `offers.mesonic_beleg_id` für die zurückgelieferte Belegnummer.
</content>
</invoke>
