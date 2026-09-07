import { describe, it, expect } from 'vitest';
import { buildCrmNoteXml } from '../crmNoteImport';

describe('buildCrmNoteXml (WebCRM, confirmed 4-field contract)', () => {
  const xml = buildCrmNoteXml({
    workflowNummer: 10241,
    kundenkonto: '24998',
    kurzbeschreibung: 'Angebot erstellt',
  });

  it('defaults to the WebCRM template with the <?xml?> prolog (unlike Belege)', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<MESOWebService TemplateType="34" Template="WebCRM">');
    expect(xml).toContain('<WebCRM>');
    expect(xml).toContain('</WebCRM>');
    expect(xml.trim().endsWith('</MESOWebService>')).toBe(true);
  });

  it('emits exactly the 4 template fields in definition order', () => {
    const order = ['WorkflowNummer', 'Zeilennummer', 'Kundenkonto', 'Kurzbeschreibung'];
    const positions = order.map((t) => xml.indexOf(`<${t}>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(xml).toContain('<WorkflowNummer>10241</WorkflowNummer>');
    expect(xml).toContain('<Zeilennummer>1</Zeilennummer>'); // default 1
    expect(xml).toContain('<Kundenkonto>24998</Kundenkonto>');
    expect(xml).toContain('<Kurzbeschreibung>Angebot erstellt</Kurzbeschreibung>');
  });

  it('does NOT emit fields absent from the WebCRM template by default', () => {
    expect(xml).not.toContain('<KontaktKunde>');
    expect(xml).not.toContain('<Startdatum>');
    expect(xml).not.toContain('<Langbeschreibungintern>');
  });

  it('appends optional extra fields only when explicitly provided (for extended templates)', () => {
    const x = buildCrmNoteXml({
      workflowNummer: 10241,
      kundenkonto: '24998',
      kurzbeschreibung: 'x',
      startdatum: '2026-09-07',
      langbeschreibungIntern: 'Details',
    });
    expect(x).toContain('<Startdatum>2026-09-07</Startdatum>');
    expect(x).toContain('<Langbeschreibungintern>Details</Langbeschreibungintern>');
    // extras come after the core 4 fields
    expect(x.indexOf('<Startdatum>')).toBeGreaterThan(x.indexOf('<Kurzbeschreibung>'));
  });

  it('honours a custom template/root and strips spaces from the XML tag', () => {
    const x = buildCrmNoteXml(
      { workflowNummer: 10241, kundenkonto: '24998' },
      { template: 'CRM Notiz Verbindung' },
    );
    expect(x).toContain('Template="CRM Notiz Verbindung"'); // attr keeps the real name
    expect(x).toContain('<CRMNotizVerbindung>'); // XML tag cannot contain spaces
  });

  it('escapes special characters in text fields', () => {
    const x = buildCrmNoteXml({
      workflowNummer: 10241,
      kundenkonto: '24998',
      kurzbeschreibung: 'A & B < C',
    });
    expect(x).toContain('A &amp; B &lt; C');
  });
});
