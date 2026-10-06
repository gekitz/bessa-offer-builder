import { describe, it, expect } from 'vitest';

import { pickTemplateFields } from '../templatePick';
import type { Campaign } from '../../types';

function campaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: 'c1', type: 'rksv_signature', key: '2026-acos', title: 'RKSV 2026 (intern)',
    publicTitle: 'RKSV-Signaturkartentausch', emailSubject: 'Ihre Karte muss getauscht werden',
    emailTemplate: '<p>Guten Tag {name},</p>', status: 'draft',
    createdById: 'u1', createdByName: 'Georg', createdAt: 't0', updatedAt: 't1', ...over,
  };
}

describe('pickTemplateFields', () => {
  it('copies only the reusable content (public title, subject, body)', () => {
    expect(pickTemplateFields(campaign())).toEqual({
      publicTitle: 'RKSV-Signaturkartentausch',
      emailSubject: 'Ihre Karte muss getauscht werden',
      emailTemplate: '<p>Guten Tag {name},</p>',
    });
  });

  it('never carries identity fields (key/title/id/type)', () => {
    const t = pickTemplateFields(campaign()) as unknown as Record<string, unknown>;
    expect(t).not.toHaveProperty('key');
    expect(t).not.toHaveProperty('title');
    expect(t).not.toHaveProperty('id');
    expect(t).not.toHaveProperty('type');
  });

  it('normalises null content to empty strings (form-friendly)', () => {
    expect(pickTemplateFields(campaign({ publicTitle: null, emailSubject: null, emailTemplate: null }))).toEqual({
      publicTitle: '', emailSubject: '', emailTemplate: '',
    });
  });
});
