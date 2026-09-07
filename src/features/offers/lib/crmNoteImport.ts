// WEBCRM-Import (Type 34) — legt in WinLine eine CRM-Aktion/Notiz an.
// Grundlage: White Paper "WinLine MDP-WebServices" §3.6.4 (Import – CRM).
//
// Anders als der Beleg-Import (WEBAngebot, Type 30) erwartet der CRM-Import den
// `<?xml?>`-Prolog (das Whitepaper-Beispiel enthält ihn). Der Envelope ist
//   <MESOWebService TemplateType="34" Template="<Vorlage>">
//     <<RootElement>> … </<RootElement>>
//   </MESOWebService>
// Der Proxy (mesonicImport) erkennt den fertigen Envelope und wrappt NICHT
// erneut; er setzt Type/Vorlage in der URL.
//
// Kontrakt bestätigt per WinLine-Vorlagendefinition (Screenshot 2026-09-07):
//  - Vorlage/Bezeichnung: **WebCRM** (WebService-Vorlage, Vorlagentyp CRM).
//  - Genau 4 Felder, in DIESER Reihenfolge (Original-Bezeichnung → XML-Tag,
//    Leerzeichen entfallen):
//      Workflow Nummer → <WorkflowNummer>  (die Aktion, z. B. 10241)
//      Zeilennummer    → <Zeilennummer>    (i. d. R. 1)
//      Kundenkonto     → <Kundenkonto>
//      Kurzbeschreibung→ <Kurzbeschreibung>
// Root-Element = Vorlagenname (<WebCRM>). Felder, die die Vorlage NICHT kennt
// (KontaktKunde/Startdatum/Langbeschreibung…), werden nur emittiert, wenn
// explizit gesetzt — Default ist der 4-Felder-Kontrakt. Vorlage/Root bleiben
// parametrierbar, falls Mesonic die Vorlage erweitert.

function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}
function el(tag: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  return `  <${tag}>${esc(String(value))}</${tag}>\n`;
}

export interface CrmNoteFields {
  workflowNummer: string | number; // Heri: 10241 (die CRM-Aktion)
  kundenkonto: string;             // Mesonic Kd.-Nr., z. B. 24998
  kurzbeschreibung?: string;       // Betreff/Text der Aktion (z. B. Angebot-Link)
  zeilennummer?: string | number;  // Default 1
  // Nicht Teil der WebCRM-Vorlage — nur emittiert, wenn gesetzt (für erweiterte
  // Vorlagen). Ungefragt gesendete Felder kann WinLine ablehnen.
  startdatum?: string;             // YYYY-MM-DD
  langbeschreibungIntern?: string;
  langbeschreibungExtern?: string;
  kontaktKunde?: string | number;
}

export interface CrmNoteXmlOpts {
  template?: string;    // URL-Vorlage + Template-Attribut. Default 'WebCRM'.
  rootElement?: string; // XML-Wurzelelement. Default = template (ohne Leerzeichen).
}

// Baut den vollständigen WebCRM-Import-Envelope (inkl. <?xml?>-Prolog).
// Standard = der bestätigte 4-Felder-Kontrakt (WorkflowNummer, Zeilennummer,
// Kundenkonto, Kurzbeschreibung) in Vorlagen-Reihenfolge. Optionale Felder
// werden nur bei explizitem Wert angehängt.
export function buildCrmNoteXml(fields: CrmNoteFields, opts: CrmNoteXmlOpts = {}): string {
  const template = opts.template ?? 'WebCRM';
  const root = (opts.rootElement ?? template).replace(/\s+/g, '');

  const inner =
    el('WorkflowNummer', fields.workflowNummer) +
    el('Zeilennummer', fields.zeilennummer ?? 1) +
    el('Kundenkonto', fields.kundenkonto) +
    el('Kurzbeschreibung', fields.kurzbeschreibung) +
    // Optionale Felder außerhalb der WebCRM-Vorlage (nur wenn gesetzt):
    el('KontaktKunde', fields.kontaktKunde) +
    el('Startdatum', fields.startdatum) +
    el('Langbeschreibungintern', fields.langbeschreibungIntern) +
    el('Langbeschreibungextern', fields.langbeschreibungExtern);

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<MESOWebService TemplateType="34" Template="${esc(template)}">\n` +
    `<${root}>\n${inner}</${root}>\n` +
    `</MESOWebService>`
  );
}
