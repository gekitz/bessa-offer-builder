import { describe, it, expect, vi } from 'vitest';
import {
  offerInternalUrl,
  buildOfferCrmFields,
  parseCrmKey,
  postOfferCrmNote,
  decideCrmAction,
  OFFER_CRM_WORKFLOW,
  OFFER_LINK_BASE,
} from './offerCrmNote';

describe('offerInternalUrl', () => {
  it('builds the internal offer deep-link from the offer id', () => {
    expect(offerInternalUrl('off-123')).toBe(`${OFFER_LINK_BASE}/?offer=off-123`);
  });
  it('returns null when there is no id', () => {
    expect(offerInternalUrl(null)).toBeNull();
    expect(offerInternalUrl(undefined)).toBeNull();
    expect(offerInternalUrl('')).toBeNull();
  });
});

describe('buildOfferCrmFields', () => {
  it('builds the WebCRM fields with label + internal link', () => {
    const fields = buildOfferCrmFields(
      { id: 'off-123', customer_company: 'Firma GmbH', customer_name: 'Max' },
      '24998',
    );
    expect(fields).toEqual({
      workflowNummer: OFFER_CRM_WORKFLOW,
      zeilennummer: 1,
      kundenkonto: '24998',
      kurzbeschreibung: 'Angebot Firma GmbH',
      langbeschreibungIntern: `Angebot-Link: ${OFFER_LINK_BASE}/?offer=off-123`,
    });
  });

  it('falls back company → name → Kunde for the label', () => {
    expect(buildOfferCrmFields({ id: 'a', customer_name: 'Max' }, '1')!.kurzbeschreibung)
      .toBe('Angebot Max');
    expect(buildOfferCrmFields({ id: 'a' }, '1')!.kurzbeschreibung)
      .toBe('Angebot Kunde');
  });

  it('coerces the Kd.-Nr. to a string', () => {
    const fields = buildOfferCrmFields({ id: 'a', customer_company: 'F' }, 24998 as unknown as string);
    expect(fields!.kundenkonto).toBe('24998');
  });

  it('returns null (skip) when the offer has no id', () => {
    expect(buildOfferCrmFields({ customer_company: 'F' }, '1')).toBeNull();
  });
});

describe('parseCrmKey', () => {
  it('extracts the <KeyValue> Aktion key', () => {
    expect(parseCrmKey('<x><KeyValue>CRM0-33490</KeyValue></x>')).toBe('CRM0-33490');
  });
  it('returns null when absent', () => {
    expect(parseCrmKey('<OverallSuccess>true</OverallSuccess>')).toBeNull();
    expect(parseCrmKey(null)).toBeNull();
  });
});

describe('decideCrmAction', () => {
  it('skips when the note was already posted (mesonic_crm_key)', () => {
    expect(decideCrmAction({ id: '1', mesonic_crm_key: 'CRM0-1', mesonic_customer_id: '24998' }))
      .toBe('skip');
  });
  it('posts directly when a Kd.-Nr. is known', () => {
    expect(decideCrmAction({ id: '1', mesonic_customer_id: '24998' })).toBe('post');
  });
  it('resolves (dialog) when neither key nor Kd.-Nr. is set', () => {
    expect(decideCrmAction({ id: '1' })).toBe('resolve');
  });
  it('skips when the offer was dismissed this session', () => {
    expect(decideCrmAction({ id: '1' }, new Set(['1']))).toBe('skip');
  });
  it('skips when there is no offer / id', () => {
    expect(decideCrmAction(null)).toBe('skip');
    expect(decideCrmAction({})).toBe('skip');
  });
});

describe('postOfferCrmNote', () => {
  it('posts the note and returns the parsed key on success', async () => {
    const importCrm = vi.fn().mockResolvedValue({
      success: true,
      raw: '<r><KeyValue>CRM0-42</KeyValue></r>',
    });
    const res = await postOfferCrmNote(
      { kundenkonto: '24998', offer: { id: 'off-1', customer_company: 'Firma' } },
      { importCrm },
    );
    expect(res).toEqual({ success: true, key: 'CRM0-42' });
    expect(importCrm).toHaveBeenCalledTimes(1);
    // The XML passed carries the internal link + label + Kd.-Nr.
    const xml = importCrm.mock.calls[0][0] as string;
    expect(xml).toContain('<Kundenkonto>24998</Kundenkonto>');
    expect(xml).toContain('Angebot-Link: ');
    expect(xml).toContain('?offer=off-1');
  });

  it('returns {success:false} without throwing when the import fails', async () => {
    const importCrm = vi.fn().mockResolvedValue({ success: false, error: 'boom', raw: '' });
    const res = await postOfferCrmNote(
      { kundenkonto: '1', offer: { id: 'off-2', customer_company: 'F' } },
      { importCrm },
    );
    expect(res.success).toBe(false);
    expect(res.key).toBeNull();
    expect(res.error).toBe('boom');
  });

  it('returns {success:false} without throwing when the import rejects', async () => {
    const importCrm = vi.fn().mockRejectedValue(new Error('network hang'));
    const res = await postOfferCrmNote(
      { kundenkonto: '1', offer: { id: 'off-3', customer_company: 'F' } },
      { importCrm },
    );
    expect(res.success).toBe(false);
    expect(res.error).toBe('network hang');
  });

  it('skips (no post) when the offer has no id', async () => {
    const importCrm = vi.fn();
    const res = await postOfferCrmNote(
      { kundenkonto: '1', offer: { customer_company: 'F' } },
      { importCrm },
    );
    expect(res.skipped).toBe(true);
    expect(res.success).toBe(false);
    expect(importCrm).not.toHaveBeenCalled();
  });
});
