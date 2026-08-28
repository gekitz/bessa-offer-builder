# Mesonic WinLine MDP WebService — LIST-Befehl (benannte Listen)

Quelle: **White Paper "WinLine MDP-WebServices"** (mesonic, 01/2026), §3.8
(im Firmenbestand: `webServices.zip`). Die früheren Repo-Docs
(`Mesonic_API_Abfrage.md`) deckten nur login/export/import ab — LIST/CRM
stehen ausschließlich in diesem White Paper.

## LIST — eine benannte WinLine-Liste ausgeben

```
GET http://<WinLineServer>/ewlservice/LIST?Session=<SID>&Name=<Listenname>&OutputFormat=json
```

**Parameter (§3.8):**

| Parameter | Zweck |
|-----------|-------|
| `Session=` | Session-ID (oder `User`/`Password`/`Company` ohne Session) |
| `Name=` | Name der Liste |
| `OutputFormat=` | `json` oder `pdf` |
| `CompanyYear=` | Wirtschaftsjahr, optional (z. B. `2023` oder `2023(5)`) |
| `OutputFile=` | optionaler Serverpfad; dann keine Datenrückgabe |
| `Filter=` | Filtername. Kein Filter → Standardfilter der Liste; `NOFILTER` → ohne |
| `DatasourceSel1..4=` | **Selektionswerte**: Sel1+Sel2 = Text, Sel3+Sel4 = numerisch |
| `Where=` | roher SQL-Where, z. B. `WHERE(LIST_40007.C007='10002')` |

**`Where=` Voraussetzung:** in `server.config` muss
`AllowWhereStatementInWebService=1` gesetzt sein (Sicherheitsschalter). Nur
ASCII < 127, keine Leerzeichen/`<`/`>` — im Proxy werden Leerzeichen→`%20`,
`'`→`%27` ersetzt (nicht voll URL-encodet, sonst frisst WinLine den Ausdruck).

## Unsere Liste `KundenArtikel`

Filter (Filter-Assistent) mit drei **"Fragen"** (Laufzeitparameter) + einer
festen Bedingung — liest Beleg-Positionen (Type-30-Daten, vgl. XSD im White
Paper S. 11: `Kontonummer`, `DatumFaktura`, `Einzelpreis`, `Artikelnummer`,
`Bezeichnung`):

- `Kontonummer =` (Text)
- `Datum Faktura >` (Datum)
- `Einzelpreis >` (numerisch)
- `Belegart = 8` (fest verdrahtet, keine Frage)

Zweck: pro Viertl-Kunde die zuletzt gekaufte Hardware ermitteln (neuester
Beleg) → Upgrade-Bedarf einschätzen.

**Werteübergabe:** über `DatasourceSel1..4`. Welche Frage in welchen Slot
gehört (und ob das Datum als Text `TT.MM.JJJJ` oder numerisch übergeben
wird), ist im White Paper NICHT eindeutig — **empirisch bestätigen** über
den `#test`-KundenArtikel-Tester (die Variante, die genau die Belege EINES
Kunden liefert, ist korrekt). Danach hier festhalten.

Bestätigte Zuordnung: _TODO nach erstem erfolgreichen Testlauf._

## Umsetzung im Code

- Edge-Proxy `mesonic-proxy`: Action `list` → `mesonicList({ name, filter,
  where, datasourceSel1..4, companyYear, outputFormat })`. Nutzt den
  geteilten Session-Cache + Session-Error-Retry wie `export`.
- Client: `mesonicList(name, opts)` in `src/lib/mesonicApi.js`.
- Test-UI: `#test` → „KundenArtikel — LIST-Tester" (Varianten-Buttons + Where).

## Bonus: CRM (für „CRM-Ticket in Mesonic anlegen")

Dasselbe White Paper dokumentiert:
- **§3.6.4 Import - CRM** (S. 41) — Feldschema für WEBCRM-Import (Type 34).
- **§3.5.19 Export - Key 34 - CRM** (S. 23).

Import-Mechanik identisch zu `WebKontenImport` (Envelope, `data`-Formularfeld,
XSD-Reihenfolge, `CRM_API` braucht (2) bearbeiten auf der Vorlage). Siehe
`project_mesonic_import`.
