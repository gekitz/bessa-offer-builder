import { describe, it, expect } from 'vitest';
import { buildCrmNoteXml } from '../crmNoteImport';

describe('buildCrmNoteXml', () => {
  const xml = buildCrmNoteXml(
    {
      workflowNummer: 10241,
      kundenkonto: '24998',
      startdatum: '2026-09-07',
      kurzbeschreibung: 'Angebot erstellt',
      langbeschreibungIntern: 'Link: https://example.com/a/ABC',
    },
    { template: 'WEBCRM' },
  );

  it('emits the Type-34 envelope WITH the <?xml?> prolog (unlike Belege)', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<MESOWebService TemplateType="34" Template="WEBCRM">');
    expect(xml.trim().endsWith('</MESOWebService>')).toBe(true);
  });

  it('wraps the fields in a root element named after the template', () => {
    expect(xml).toContain('<WEBCRM>');
    expect(xml).toContain('</WEBCRM>');
  });

  it('emits WorkflowNummer + Kundenkonto and the provided fields', () => {
    expect(xml).toContain('<WorkflowNummer>10241</WorkflowNummer>');
    expect(xml).toContain('<Kundenkonto>24998</Kundenkonto>');
    expect(xml).toContain('<Startdatum>2026-09-07</Startdatum>');
    expect(xml).toContain('<Kurzbeschreibung>Angebot erstellt</Kurzbeschreibung>');
    expect(xml).toContain('<Langbeschreibungintern>Link: https://example.com/a/ABC</Langbeschreibungintern>');
  });

  it('defaults KontaktKunde to 0', () => {
    expect(xml).toContain('<KontaktKunde>0</KontaktKunde>');
  });

  it('keeps whitepaper field order (WorkflowNummer < Kundenkonto < Startdatum < Kurzbeschreibung < Langbeschreibungintern)', () => {
    const order = ['WorkflowNummer', 'Kundenkonto', 'KontaktKunde', 'Startdatum', 'Kurzbeschreibung', 'Langbeschreibungintern'];
    const positions = order.map((t) => xml.indexOf(`<${t}>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('omits empty optional fields', () => {
    const x = buildCrmNoteXml({ workflowNummer: 10241, kundenkonto: '24998' });
    expect(x).not.toContain('<Startdatum>');
    expect(x).not.toContain('<Kurzbeschreibung>');
    expect(x).not.toContain('<Langbeschreibungintern>');
  });

  it('strips spaces from a template name when deriving the root element', () => {
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
      langbeschreibungIntern: 'A & B < C',
    });
    expect(x).toContain('A &amp; B &lt; C');
  });
});
