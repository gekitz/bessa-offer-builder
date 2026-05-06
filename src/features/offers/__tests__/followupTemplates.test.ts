import { describe, expect, it } from 'vitest';
import {
  FOLLOWUP_TEMPLATES,
  daysSince,
  getTemplate,
  suggestTemplate,
  type TemplateOfferShape,
} from '../data/followupTemplates';

const NOW = new Date('2026-05-06T08:00:00+02:00');

function offer(p: Partial<TemplateOfferShape> = {}): TemplateOfferShape {
  return {
    id: 'off-1',
    customer_name: 'Max Mustermann',
    customer_company: 'ACME GmbH',
    creator_name: 'Georg Kitz',
    creator_email: 'g.kitz@kitz.co.at',
    total_monthly: 60,
    total_period: 720,
    total_once: 1500,
    sent_at: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    email_subject: 'Ihr Angebot von Kitz Computer & Office GmbH – ACME GmbH',
    ...p,
  };
}

describe('daysSince', () => {
  it('returns null for null input', () => {
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince(undefined, NOW)).toBeNull();
  });
  it('returns null for invalid input', () => {
    expect(daysSince('not a date', NOW)).toBeNull();
  });
  it('returns whole days difference', () => {
    const five = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysSince(five, NOW)).toBe(5);
  });
});

describe('FOLLOWUP_TEMPLATES', () => {
  it('exposes the five templates in canonical order', () => {
    expect(FOLLOWUP_TEMPLATES.map((t) => t.id)).toEqual([
      'sanity_check',
      'soft_nudge',
      'value_reframe',
      'breakup',
      'free_form',
    ]);
  });

  it('every template renders a non-empty subject and body', () => {
    for (const t of FOLLOWUP_TEMPLATES) {
      const r = t.render(offer(), { now: NOW });
      expect(r.subject.length).toBeGreaterThan(0);
      expect(r.body.length).toBeGreaterThan(10);
    }
  });

  it('subjects are prefixed with "Re:" except when the source already has it', () => {
    const r1 = getTemplate('soft_nudge').render(offer(), { now: NOW });
    expect(r1.subject.startsWith('Re: ')).toBe(true);

    const r2 = getTemplate('soft_nudge').render(
      offer({ email_subject: 'Re: Ihr Angebot' }),
      { now: NOW },
    );
    // Should not double-prefix
    expect(r2.subject).toBe('Re: Ihr Angebot');
  });

  it('uses the persisted email_subject when present (handles rep customization)', () => {
    const o = offer({ email_subject: 'Sonderkonditionen für ACME — Q2' });
    const r = getTemplate('breakup').render(o, { now: NOW });
    expect(r.subject).toBe('Re: Sonderkonditionen für ACME — Q2');
  });

  it('falls back to default subject when email_subject is missing (legacy offers)', () => {
    const o = offer({ email_subject: null });
    const r = getTemplate('soft_nudge').render(o, { now: NOW });
    expect(r.subject).toContain('Re: Ihr Angebot von Kitz');
    expect(r.subject).toContain('ACME GmbH');
  });

  it('signature uses the creator name', () => {
    const r = getTemplate('soft_nudge').render(offer({ creator_name: 'Helmut Bauer' }), { now: NOW });
    expect(r.body).toContain('Helmut Bauer');
  });

  it('signature falls back when creator is missing', () => {
    const r = getTemplate('breakup').render(offer({ creator_name: null }), { now: NOW });
    expect(r.body).toContain('Ihr Kitz Team');
  });

  it('soft_nudge mentions the deal value when total_monthly > 0', () => {
    const r = getTemplate('soft_nudge').render(offer({ total_monthly: 89 }), { now: NOW });
    expect(r.body).toMatch(/€ 89/);
  });

  it('soft_nudge omits the value line when no monetary fields are set', () => {
    const r = getTemplate('soft_nudge').render(offer({ total_monthly: 0, total_once: 0, total_period: 0 }), { now: NOW });
    expect(r.body).not.toMatch(/€\s+0/);
  });

  it('value_reframe references monthly amount in its hook', () => {
    const r = getTemplate('value_reframe').render(offer({ total_monthly: 120 }), { now: NOW });
    expect(r.body).toMatch(/€ 120/);
  });

  it('value_reframe falls back gracefully when monthly is zero', () => {
    const r = getTemplate('value_reframe').render(offer({ total_monthly: 0 }), { now: NOW });
    expect(r.body).toMatch(/Bestandskunden/);
  });

  it('greeting prefers customer_name over company', () => {
    const r = getTemplate('sanity_check').render(
      offer({ customer_name: 'Maria Müller', customer_company: 'Whatever GmbH' }),
      { now: NOW },
    );
    expect(r.body).toMatch(/Sehr geehrte\/r Frau \/ Herr Maria Müller/);
  });

  it('greeting falls back to "Sehr geehrte Damen und Herren bei <company>"', () => {
    const r = getTemplate('sanity_check').render(
      offer({ customer_name: null, customer_company: 'ACME GmbH' }),
      { now: NOW },
    );
    expect(r.body).toMatch(/bei ACME GmbH/);
  });

  it('greeting falls back to generic when nothing is set', () => {
    const r = getTemplate('sanity_check').render(
      offer({ customer_name: null, customer_company: null }),
      { now: NOW },
    );
    expect(r.body).toMatch(/^Sehr geehrte Damen und Herren,/);
  });
});

describe('suggestTemplate', () => {
  it('suggests sanity_check for a fresh send (3-6 days) with no opens', () => {
    const o = offer({ sent_at: new Date(NOW.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString() });
    expect(suggestTemplate(o, { now: NOW, recentOpens: 0 })).toBe('sanity_check');
  });

  it('suggests soft_nudge for a fresh send with at least one open', () => {
    const o = offer({ sent_at: new Date(NOW.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString() });
    expect(suggestTemplate(o, { now: NOW, recentOpens: 2 })).toBe('soft_nudge');
  });

  it('suggests soft_nudge after 7-13 days', () => {
    const o = offer({ sent_at: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() });
    expect(suggestTemplate(o, { now: NOW, recentOpens: 0 })).toBe('soft_nudge');
  });

  it('suggests value_reframe after 14-20 days', () => {
    const o = offer({ sent_at: new Date(NOW.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString() });
    expect(suggestTemplate(o, { now: NOW, recentOpens: 0 })).toBe('value_reframe');
  });

  it('suggests breakup after 21+ days', () => {
    const o = offer({ sent_at: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString() });
    expect(suggestTemplate(o, { now: NOW, recentOpens: 5 })).toBe('breakup');
  });

  it('never auto-suggests free_form', () => {
    for (let days = 0; days < 60; days++) {
      const o = offer({ sent_at: new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString() });
      const id = suggestTemplate(o, { now: NOW, recentOpens: 0 });
      expect(id).not.toBe('free_form');
    }
  });

  it('handles offers with no sent_at by treating days as 0', () => {
    const o = offer({ sent_at: null });
    expect(suggestTemplate(o, { now: NOW, recentOpens: 0 })).toBe('sanity_check');
  });
});

describe('getTemplate', () => {
  it('returns the template with the matching id', () => {
    expect(getTemplate('breakup').id).toBe('breakup');
  });
  it('throws on unknown id', () => {
    expect(() => getTemplate('does-not-exist' as never)).toThrow(/Unknown template id/);
  });
});
