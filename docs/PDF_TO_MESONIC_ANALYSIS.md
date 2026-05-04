# Analyse: Angebot-PDF an Mesonic-Kunden speichern

**Stand:** April 2026

---

## Fragestellung

Wie kann ein Angebots-PDF, das in der bessa-App erstellt wurde, mit dem zugehörigen Mesonic-Kunden verknüpft werden, damit es im WinLine sichtbar und abrufbar ist?

## Optionen

### Option A: Beleg in Mesonic anlegen (Type 30 — WebBelegImport)

Die sauberste Integration. Das Angebot wird als Mesonic-Beleg (Belegart "Angebot") angelegt. Damit erscheint es in der WinLine unter dem Kunden in der Belegübersicht.

**Vorteile:**
- Angebot ist direkt in WinLine sichtbar und durchsuchbar
- Nutzt den Standard-Workflow (Angebot → Auftrag → Rechnung)
- Belegnummer wird von Mesonic vergeben
- Korrekte Buchhaltungsintegration

**Nachteile:**
- Erfordert exaktes XML-Mapping aller Belegpositionen (Artikelnummer, Menge, Preis, MwSt.)
- Unsere Angebote enthalten teils Freitext-Positionen und Sonderkonditionen, die nicht 1:1 auf Mesonic-Artikel abbildbar sind
- Das PDF selbst wird nicht als Datei in Mesonic gespeichert, nur die strukturierten Daten

**XML-Format (Beispiel):**
```xml
<WebBelegImport>
  <Kontonummer>29385</Kontonummer>
  <Belegart>AN</Belegart>
  <Datum>2026-04-10</Datum>
  <Position>
    <Artikelnummer>1001</Artikelnummer>
    <Menge>1</Menge>
    <Preis>99.00</Preis>
  </Position>
</WebBelegImport>
```

**Aufwand:** Hoch (10-15h). Erfordert Abstimmung mit Mesonic-Techniker zu Belegformat, Pflichtfeldern und Belegarten.

### Option B: CRM-Eintrag in Mesonic (Type 34 — WEBCRM)

Ein CRM-Eintrag wird zum Kunden angelegt, der auf das Angebot verweist. Das PDF bleibt in Supabase Storage, der CRM-Eintrag enthält den Link.

**Vorteile:**
- Einfacher als Beleg-Import (weniger Pflichtfelder)
- CRM-Einträge in WinLine sichtbar
- Kann beliebige Notizen und Referenzen enthalten

**Nachteile:**
- WEBCRM-Template ist vorhanden, aber Import-Felder müssen mit Mesonic-Techniker geklärt werden
- PDF wird nicht direkt in Mesonic gespeichert, nur verlinkt
- CRM-Einträge werden in WinLine möglicherweise weniger genutzt als Belege

**Aufwand:** Mittel (5-8h). Erfordert Template-Analyse mit Mesonic-Techniker.

### Option C: Hybrid — Supabase Storage + Mesonic-Referenz (empfohlen als Zwischenlösung)

Das PDF wird in Supabase Storage gespeichert (bereits implementiert). Die Offers-Tabelle speichert die `mesonic_customer_id` (gerade implementiert). Damit kann man:
- Alle Angebote zu einem Kunden über die Mesonic-Kundennummer abrufen
- Das PDF direkt aus Supabase Storage laden
- Später optional einen Beleg in Mesonic anlegen (Option A), wenn die Artikelzuordnung steht

**Vorteile:**
- Sofort umsetzbar (Migration + Code-Änderung bereits erledigt)
- Kein Mesonic-Techniker nötig
- PDF wird zuverlässig gespeichert und ist über Link abrufbar
- Kann schrittweise zu Option A erweitert werden

**Nachteile:**
- Angebot ist nicht direkt in WinLine sichtbar
- Mitarbeiter müssen die bessa-App nutzen, um Angebote zu sehen

**Aufwand:** Gering (bereits implementiert). Migration `20260410100000_add_mesonic_customer_id.sql` fügt `mesonic_customer_id` zur Offers-Tabelle hinzu.

## Empfehlung

**Kurzfristig (jetzt):** Option C — bereits umgesetzt. Angebote werden mit der Mesonic-Kundennummer verknüpft, PDFs in Supabase Storage gespeichert.

**Mittelfristig (Week 6-7):** Option A — wenn die Artikeldaten aus Mesonic integriert sind (Phase 2, Week 4), können Angebote als strukturierte Belege nach Mesonic geschrieben werden. Das ermöglicht den vollen Workflow Angebot → Auftrag → Rechnung in WinLine.

**Fragen an Mesonic-Techniker für Option A:**
1. Welche Belegart-Codes sind für Angebote verfügbar? (`AN`, `AG`?)
2. Welche Pflichtfelder hat WebBelegImport?
3. Können Freitext-Positionen (ohne Artikelnummer) in einen Beleg importiert werden?
4. Wie werden Ratenzahlungen / Laufzeitmodelle im Beleg abgebildet?
5. Gibt es eine Möglichkeit, ein PDF als Anlage an einen Beleg zu hängen (DMS-Integration)?
