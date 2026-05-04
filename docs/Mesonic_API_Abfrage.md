# Mesonic WinLine MDP WebService — API-Abfrage Dokumentation

## Überblick

Wir greifen über die MDP WebServices (HTTP REST API) auf die WinLine-Daten zu. Die Abfragen laufen über eine Supabase Edge Function (Deno/TypeScript), die als Proxy zwischen unserem React-Frontend und dem Mesonic-Server dient.

## Verbindungsdaten

| Parameter | Wert |
|-----------|------|
| **URL** | `https://mesonic.kitz.co.at` |
| **Benutzer** | `CRM_API` |
| **Mandant** | `2KCO` |

## 1. Login

**URL:**
```
GET https://mesonic.kitz.co.at/ewlservice/login?user=CRM_API&password=***&company=2KCO
```

**Antwort (Erfolg):**
```
Session=4bc09c84-2376-xxxx-xxxx-xxxxxxxxxxxx
```

Die Session-ID wird aus der Antwort extrahiert (Prefix `Session=` wird entfernt) und für alle weiteren Abfragen verwendet.

## 2. Export (Daten lesen)

**URL-Format:**
```
GET https://mesonic.kitz.co.at/ewlservice/export?Session={SESSION_ID}&Type={TYPE}&Vorlage={TEMPLATE}&Key={KEY}&Format=1&byref=1
```

**Parameter:**
| Parameter | Beschreibung |
|-----------|-------------|
| `Session` | Session-ID vom Login (UUID ohne Prefix) |
| `Type` | 1=Konten, 4=Artikel, 5=Preise, 7=Kontakte, 30=Belege |
| `Vorlage` | Template-Name (z.B. `WebKontenExport`) |
| `Key` | Suchschlüssel (siehe unten) |
| `Format` | 1 = UTF-8 XML |
| `byref` | 1 = Referenz |

### Verwendete Vorlagen (Templates)

| Type | Template | Zweck |
|------|----------|-------|
| 1 | `WebKontenExport` | Kundendaten exportieren (Detail) |
| 1 | `WebKontenImport` | Kundendaten importieren |
| 4 | `WebArtikelExport` | Artikeldaten exportieren |
| 4 | `WebArtikelImport` | Artikeldaten importieren |
| 7 | `WebKontakteExport` | Kontaktdaten exportieren |
| 7 | `WebKontakteImport` | Kontaktdaten importieren |
| 30 | `WebBelegExport` | Belege exportieren |
| 30 | `WebBelegImport` | Belege importieren |

### Key-Formate die wir verwenden möchten

**a) Einzelner Datensatz (funktioniert bereits):**
```
Key=29385
```

**b) WHERE-Abfrage (bisher Fehler 000161):**
```
Key=where T055.C003 LIKE '%ALTHOFEN%'
Key=where T055.C003 LIKE '%KLAGENFURT%'
Key=where T055.C003 <> ''
```

**c) Wildcard / Alle Datensätze (bisher Fehler 000161):**
```
Key=*
```

**d) Bereich (bisher Fehler 000161):**
```
Key=29385++29400
```

## 3. Konkretes Beispiel — Einzelabfrage (funktioniert)

**Request:**
```
GET https://mesonic.kitz.co.at/ewlservice/export
    ?Session=4bc09c84-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    &Type=1
    &Vorlage=WebKontenExport
    &Key=29385
    &Format=1
    &byref=1
```

**Response (XML):**
```xml
<MESOWebService TemplateType="1" Template="WebKontenExport">
  <WebKontenExport>
    <T055_C003>Stadtgemeinde Althofen</T055_C003>
    <!-- ... weitere Felder ... -->
  </WebKontenExport>
</MESOWebService>
```

## 4. Konkretes Beispiel — WHERE-Abfrage (bisher Fehler)

**Request:**
```
GET https://mesonic.kitz.co.at/ewlservice/export
    ?Session=4bc09c84-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    &Type=1
    &Vorlage=WebKontenExport
    &Key=where%20T055.C003%20LIKE%20%27%25ALTHOFEN%25%27
    &Format=1
    &byref=1
```

Hinweis: Der Key-Parameter wird URL-encoded übertragen (Leerzeichen → `%20`, `%` → `%25`, `'` → `%27`).

**Bisherige Antwort (Fehler):**
```xml
<MESOWebServiceResult>
  <OverallSuccess>false</OverallSuccess>
  <ResultDetails>
    <ErrorCode>000161</ErrorCode>
    <ErrorText>Kein Datensatz für den Export vorhanden</ErrorText>
  </ResultDetails>
</MESOWebServiceResult>
```

Wir haben auch versucht den Key NICHT zu URL-encoden (raw im URL), gleiches Ergebnis.

## 5. Code — Export-Funktion

Der relevante Code-Abschnitt unserer Proxy-Funktion (TypeScript/Deno):

```typescript
async function mesonicExport(params: {
  type: number;
  template: string;
  key: string;
  format?: number;
  byref?: number;
}): Promise<string> {
  const cfg = getMesonicConfig();

  const queryParams = new URLSearchParams({
    Session: session,
    Type: String(params.type),
    Vorlage: params.template,
    Key: params.key,
    Format: String(params.format ?? 1),
    byref: String(params.byref ?? 1),
  });

  const url = `${cfg.url}/ewlservice/export?${queryParams.toString()}`;
  const res = await fetch(url);
  return await res.text();
}
```

`URLSearchParams` encoded den Key automatisch. D.h. aus `where T055.C003 LIKE '%ALTHOFEN%'` wird `where%20T055.C003%20LIKE%20%27%25ALTHOFEN%25%27`.

## 6. Was wir brauchen

Damit unser CRM-Frontend funktioniert, brauchen wir die Möglichkeit:

1. **WHERE-Abfragen** auf Vorlagen: `Key=where T055.C003 LIKE '%SUCHTEXT%'` → um Kunden nach Name zu suchen
2. **Wildcard / Alle Datensätze**: `Key=*` → um Kundenlisten zu laden
3. **Bereichsabfragen**: `Key=29385++29400` → optional, aber hilfreich

Diese Key-Formate müssen im **Exportparameter** der jeweiligen Vorlage (WebKontenExport, WebArtikelExport, etc.) aktiviert sein.

## 7. Frage an Mesonic

Muss in den Vorlagen der **Exportparameter** konfiguriert/erweitert werden, damit WHERE-Abfragen und Wildcards funktionieren? Aktuell gibt jede Abfrage außer einzelnen Schlüsseln (z.B. `Key=29385`) den Fehler **000161** ("Kein Datensatz für den Export vorhanden") zurück.
