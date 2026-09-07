import { describe, expect, it, vi } from 'vitest';
import {
  ticketDeepLink,
  buildTicketCrmFields,
  buildRepairOrderCrmFields,
  postTicketCrmNote,
  postRepairOrderCrmNote,
  TICKET_CRM_WORKFLOW,
} from './ticketCrmNote';
import { decideCrmAction } from '../../offers/lib/crmNoteImport';
import type { RepairOrder, Ticket } from '../types';

// ─── Fixtures ───

const ticket: Ticket = {
  id: 't-abc',
  ticketNumber: '26-0000042',
  shareCode: 'sc-1',
  title: 'Drucker streikt',
  description: null,
  kind: 'reparatur',
  priority: 'normal',
  status: 'open',
  poolAbteilungId: null,
  assignedTo: null,
  mesonicCustomerId: '24998',
  customerName: 'Müller GmbH',
  customerPhone: null,
  customerEmail: null,
  customerAddress: null,
  customerHasWartungsvertrag: false,
  standortId: null,
  billable: true,
  closedAt: null,
  closedBy: null,
  resolutionNote: null,
  offerId: null,
  mesonicBelegId: null,
  mesonicCrmKey: null,
  offerLaborMinutes: 0,
  offerLaborRate: null,
  offerLaborFloorBilledMinutes: 0,
  createdBy: null,
  createdAt: '2026-09-01T08:00:00Z',
  updatedAt: '2026-09-01T08:00:00Z',
};

const ro: RepairOrder = {
  id: 'ro-1',
  ticketId: 't-abc',
  appointmentId: null,
  seqNumber: 2,
  status: 'draft',
  workDescription: 'Toner getauscht',
  gpsTravelNote: null,
  signatureData: null,
  signedAt: null,
  signedByName: null,
  performedAt: '2026-09-02',
  billable: true,
  mesonicBelegLaufnummer: null,
  mesonicBelegKey: null,
  mesonicBelegCreatedAt: null,
  mesonicCrmKey: null,
  createdBy: null,
  createdAt: '',
  updatedAt: '',
};

// ─── ticketDeepLink ───

describe('ticketDeepLink', () => {
  it('builds an internal HashRouter deep-link', () => {
    expect(ticketDeepLink('t-abc')).toBe('https://bessa.kitz.co.at/#/tickets/t-abc');
  });
});

// ─── buildTicketCrmFields ───

describe('buildTicketCrmFields', () => {
  it('builds the WebCRM field set with the deep-link', () => {
    const f = buildTicketCrmFields(ticket)!;
    expect(f.workflowNummer).toBe(TICKET_CRM_WORKFLOW);
    expect(f.zeilennummer).toBe(1);
    expect(f.kundenkonto).toBe('24998');
    expect(f.kurzbeschreibung).toBe('Ticket 26-0000042');
    expect(f.langbeschreibungIntern).toBe('Drucker streikt\nhttps://bessa.kitz.co.at/#/tickets/t-abc');
  });

  it('returns null when the ticket has no Kd.-Nr.', () => {
    expect(buildTicketCrmFields({ ...ticket, mesonicCustomerId: null })).toBeNull();
  });

  it('omits the title line when there is no title', () => {
    const f = buildTicketCrmFields({ ...ticket, title: '' })!;
    expect(f.langbeschreibungIntern).toBe('https://bessa.kitz.co.at/#/tickets/t-abc');
  });
});

// ─── buildRepairOrderCrmFields ───

describe('buildRepairOrderCrmFields', () => {
  it('labels the Schein and links to the parent ticket', () => {
    const f = buildRepairOrderCrmFields(ro, ticket)!;
    expect(f.workflowNummer).toBe(TICKET_CRM_WORKFLOW);
    expect(f.kundenkonto).toBe('24998');
    expect(f.kurzbeschreibung).toBe('Reparaturschein 26-0000042 #2');
    expect(f.langbeschreibungIntern).toBe(
      'am 2026-09-02 — Toner getauscht\nhttps://bessa.kitz.co.at/#/tickets/t-abc',
    );
  });

  it('returns null when the parent ticket has no Kd.-Nr.', () => {
    expect(buildRepairOrderCrmFields(ro, { ...ticket, mesonicCustomerId: null })).toBeNull();
  });

  it('falls back to just the link when there is no description', () => {
    const f = buildRepairOrderCrmFields({ ...ro, workDescription: null, performedAt: '' }, ticket)!;
    expect(f.langbeschreibungIntern).toBe('https://bessa.kitz.co.at/#/tickets/t-abc');
  });
});

// ─── postTicketCrmNote ───

describe('postTicketCrmNote', () => {
  it('posts and returns the parsed key on success', async () => {
    const importCrm = vi.fn().mockResolvedValue({
      success: true,
      raw: '<x><KeyValue>CRM0-99</KeyValue></x>',
    });
    const res = await postTicketCrmNote(ticket, { importCrm });
    expect(res.success).toBe(true);
    expect(res.key).toBe('CRM0-99');
    // The built XML must carry the deep-link + WebCRM envelope.
    const xml = importCrm.mock.calls[0][0] as string;
    expect(xml).toContain('TemplateType="34"');
    expect(xml).toContain('Template="WebCRM"');
    expect(xml).toContain('https://bessa.kitz.co.at/#/tickets/t-abc');
  });

  it('skips silently when the ticket has no Kd.-Nr.', async () => {
    const importCrm = vi.fn();
    const res = await postTicketCrmNote({ ...ticket, mesonicCustomerId: null }, { importCrm });
    expect(res.skipped).toBe(true);
    expect(res.success).toBe(false);
    expect(importCrm).not.toHaveBeenCalled();
  });

  it('never throws when the import fails', async () => {
    const importCrm = vi.fn().mockResolvedValue({ success: false, error: 'boom' });
    const res = await postTicketCrmNote(ticket, { importCrm });
    expect(res.success).toBe(false);
    expect(res.key).toBeNull();
    expect(res.error).toBe('boom');
  });

  it('never throws when the import rejects/hangs', async () => {
    const importCrm = vi.fn().mockRejectedValue(new Error('timeout'));
    const res = await postTicketCrmNote(ticket, { importCrm });
    expect(res.success).toBe(false);
    expect(res.error).toBe('timeout');
  });
});

// ─── postRepairOrderCrmNote ───

describe('postRepairOrderCrmNote', () => {
  it('posts and returns the parsed key on success', async () => {
    const importCrm = vi.fn().mockResolvedValue({
      success: true,
      raw: '<x><KeyValue>CRM0-100</KeyValue></x>',
    });
    const res = await postRepairOrderCrmNote(ro, ticket, { importCrm });
    expect(res.success).toBe(true);
    expect(res.key).toBe('CRM0-100');
    const xml = importCrm.mock.calls[0][0] as string;
    expect(xml).toContain('Reparaturschein 26-0000042 #2');
  });

  it('skips silently when the parent ticket has no Kd.-Nr.', async () => {
    const importCrm = vi.fn();
    const res = await postRepairOrderCrmNote(ro, { ...ticket, mesonicCustomerId: null }, { importCrm });
    expect(res.skipped).toBe(true);
    expect(importCrm).not.toHaveBeenCalled();
  });

  it('never throws when the import fails', async () => {
    const importCrm = vi.fn().mockResolvedValue({ success: false, error: 'nope' });
    const res = await postRepairOrderCrmNote(ro, ticket, { importCrm });
    expect(res.success).toBe(false);
    expect(res.error).toBe('nope');
  });
});

// ─── decideCrmAction reuse ───

describe('decideCrmAction (reused for tickets)', () => {
  it('skips when already posted', () => {
    expect(
      decideCrmAction({ id: 't', mesonic_crm_key: 'CRM0-1', mesonic_customer_id: '24998' }),
    ).toBe('skip');
  });
  it('posts when a Kd.-Nr. is present', () => {
    expect(decideCrmAction({ id: 't', mesonic_customer_id: '24998' })).toBe('post');
  });
  it('resolves when the Kd.-Nr. is missing', () => {
    expect(decideCrmAction({ id: 't' })).toBe('resolve');
  });
  it('skips when the id was dismissed this session', () => {
    expect(decideCrmAction({ id: 't' }, new Set(['t']))).toBe('skip');
  });
});
