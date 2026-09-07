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
// Kontrakt bestätigt per WebCRM-XSD (Heri 2026-09-07, live OverallSuccess=true):
//   Vorlage/Bezeichnung: **WebCRM** (WebService-Vorlage, Vorlagentyp CRM).
//   Root-Element = <WebCRM>. xs:sequence (Reihenfolge Pflicht), alle optional:
//     <WorkflowNummer>   xs:integer  (die Aktion, z. B. 10241)
//     <Zeilennummer>     xs:integer  (i. d. R. 1)
//     <Kundenkonto>      xs:string
//     <Kurzbeschreibung> xs:string   (kurzer Betreff/Label)
//     <Langbeschreibungintern> xs:string (langer Notiztext, z. B. Angebot-Link)
// Vorlage/Root bleiben parametrierbar, falls Mesonic die Vorlage umbenennt.

function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}
function el(tag: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  return `  <${tag}>${esc(String(value))}</${tag}>\n`;
}

// Felder = WebCRM-XSD (xs:sequence), alle optional (minOccurs=0):
export interface CrmNoteFields {
  workflowNummer: string | number; // xs:integer — Heri: 10241 (die CRM-Aktion)
  zeilennummer?: string | number;  // xs:integer — Default 1
  kundenkonto: string;             // xs:string — Mesonic Kd.-Nr., z. B. 24998
  kurzbeschreibung?: string;       // xs:string — Betreff/Label der Aktion
  langbeschreibungIntern?: string; // xs:string — interner Notiztext (Angebot-Link)
}

export interface CrmNoteXmlOpts {
  template?: string;    // URL-Vorlage + Template-Attribut. Default 'WebCRM'.
  rootElement?: string; // XML-Wurzelelement. Default = template (ohne Leerzeichen).
}

// Baut den vollständigen WebCRM-Import-Envelope (inkl. <?xml?>-Prolog).
// Feldreihenfolge = XSD xs:sequence (Pflicht bei WinLine-Schemaprüfung). Nur
// nicht-leere Felder werden emittiert; Zeilennummer defaultet auf 1.
export function buildCrmNoteXml(fields: CrmNoteFields, opts: CrmNoteXmlOpts = {}): string {
  const template = opts.template ?? 'WebCRM';
  const root = (opts.rootElement ?? template).replace(/\s+/g, '');

  const inner =
    el('WorkflowNummer', fields.workflowNummer) +
    el('Zeilennummer', fields.zeilennummer ?? 1) +
    el('Kundenkonto', fields.kundenkonto) +
    el('Kurzbeschreibung', fields.kurzbeschreibung) +
    el('Langbeschreibungintern', fields.langbeschreibungIntern);

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<MESOWebService TemplateType="34" Template="${esc(template)}">\n` +
    `<${root}>\n${inner}</${root}>\n` +
    `</MESOWebService>`
  );
}
