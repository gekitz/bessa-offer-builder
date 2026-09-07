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
// OFFEN (empirisch am Kunden 24998 zu klären, Heri 2026-09):
//  - Exakter Vorlagen-/Root-Element-Name von Heris Vorlage "CRM Notiz
//    Verbindung" (Leerzeichen sind als XML-Tag unzulässig → RootElement ggf.
//    ohne Leerzeichen, Vorlage evtl. "WEBCRM").
//  - Genaue Feldreihenfolge/-menge der Vorlage. Heris Vorlage nutzt lt.
//    Screenshot: Kundenkonto, Startdatum, Kurzbeschreibung, Langbeschreibung
//    intern; WorkflowNummer = 10241 (die "Aktion").
// Deshalb sind Vorlage, RootElement und Felder bewusst parametrierbar.

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
  startdatum?: string;             // YYYY-MM-DD
  kurzbeschreibung?: string;       // Betreff der Aktion
  langbeschreibungIntern?: string; // interner Notiztext (z. B. Angebot-Link)
  langbeschreibungExtern?: string;
  kontaktKunde?: string | number;  // Ansprechpartner-ID, Default 0
}

export interface CrmNoteXmlOpts {
  template?: string;    // URL-Vorlage + Template-Attribut. Default 'WEBCRM'.
  rootElement?: string; // XML-Wurzelelement. Default = template (ohne Leerzeichen).
}

// Baut den vollständigen WEBCRM-Import-Envelope (inkl. <?xml?>-Prolog).
// Nur nicht-leere Felder werden emittiert; WorkflowNummer + Kundenkonto sind
// Pflicht. Reihenfolge folgt dem Whitepaper-Beispiel, ergänzt um Startdatum.
export function buildCrmNoteXml(fields: CrmNoteFields, opts: CrmNoteXmlOpts = {}): string {
  const template = opts.template ?? 'WEBCRM';
  const root = (opts.rootElement ?? template).replace(/\s+/g, '');

  const inner =
    el('WorkflowNummer', fields.workflowNummer) +
    el('Kundenkonto', fields.kundenkonto) +
    el('KontaktKunde', fields.kontaktKunde ?? 0) +
    el('Startdatum', fields.startdatum) +
    el('Kurzbeschreibung', fields.kurzbeschreibung) +
    el('Langbeschreibungintern', fields.langbeschreibungIntern) +
    el('Langbeschreibungextern', fields.langbeschreibungExtern);

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<MESOWebService TemplateType="34" Template="${esc(template)}">\n` +
    `<${root}>\n${inner}</${root}>\n` +
    `</MESOWebService>`
  );
}
