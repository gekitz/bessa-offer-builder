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

  it('emits fields in the XSD xs:sequence order', () => {
    const order = ['WorkflowNummer', 'Zeilennummer', 'Kundenkonto', 'Kurzbeschreibung'];
    const positions = order.map((t) => xml.indexOf(`<${t}>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(xml).toContain('<WorkflowNummer>10241</WorkflowNummer>');
    expect(xml).toContain('<Zeilennummer>1</Zeilennummer>'); // default 1
    expect(xml).toContain('<Kundenkonto>24998</Kundenkonto>');
    expect(xml).toContain('<Kurzbeschreibung>Angebot erstellt</Kurzbeschreibung>');
  });

  it('never emits elements outside the WebCRM XSD', () => {
    const x = buildCrmNoteXml({
      workflowNummer: 10241,
      kundenkonto: '24998',
      kurzbeschreibung: 'x',
      langbeschreibungIntern: 'y',
    });
    // Only the 5 XSD elements may appear (plus the MESOWebService/WebCRM wrappers).
    const allowed = new Set(['MESOWebService', 'WebCRM', 'WorkflowNummer', 'Zeilennummer', 'Kundenkonto', 'Kurzbeschreibung', 'Langbeschreibungintern']);
    const tags = [...x.matchAll(/<([A-Za-z]+)[ >]/g)].map((m) => m[1]);
    for (const t of tags) expect(allowed.has(t)).toBe(true);
  });

  it('places Langbeschreibungintern last (after Kurzbeschreibung) per XSD', () => {
    const x = buildCrmNoteXml({
      workflowNummer: 10241,
      kundenkonto: '24998',
      kurzbeschreibung: 'label',
      langbeschreibungIntern: 'Angebot-Link: https://…',
    });
    expect(x).toContain('<Langbeschreibungintern>Angebot-Link: https://…</Langbeschreibungintern>');
    expect(x.indexOf('<Langbeschreibungintern>')).toBeGreaterThan(x.indexOf('<Kurzbeschreibung>'));
  });

  it('omits Langbeschreibungintern when not provided', () => {
    expect(xml).not.toContain('<Langbeschreibungintern>');
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
