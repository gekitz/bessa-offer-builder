import { describe, expect, it } from 'vitest';
import {
  buildDigest,
  classifyOffer,
  digestSubject,
  renderDigestHtml,
  type DigestOffer,
} from '../../../../supabase/functions/daily-followup-digest/digest';

const NOW = new Date('2026-05-06T08:00:00+02:00');
const MS = 24 * 60 * 60 * 1000;

function offer(partial: Partial<DigestOffer> & { id: string }): DigestOffer {
  return {
    stage: 'offer_sent',
    sent_at: null,
    last_activity_at: null,
    next_followup_at: null,
    total_period: 0,
    total_monthly: 0,
    customer_name: null,
    customer_company: null,
    creator_id: 'gkitz',
    creator_name: 'Georg Kitz',
    ...partial,
  };
}

describe('classifyOffer', () => {
  it('skips offers not in offer_sent stage', () => {
    const o = offer({ id: 'a', stage: 'new', next_followup_at: new Date(NOW.getTime() - MS).toISOString() });
    expect(classifyOffer(o, NOW, 0)).toBeNull();
  });

  it('skips offers without a follow-up date AND without enough opens', () => {
    const o = offer({ id: 'a', sent_at: new Date(NOW.getTime() - 10 * MS).toISOString() });
    expect(classifyOffer(o, NOW, 1)).toBeNull();
  });

  it('classifies as hot when recent opens >= threshold even without a follow-up date', () => {
    const o = offer({ id: 'a', sent_at: new Date(NOW.getTime() - 10 * MS).toISOString() });
    expect(classifyOffer(o, NOW, 3)).toBe('hot');
  });

  it('hot takes precedence over overdue (3+ opens beats yesterday\'s due date)', () => {
    const o = offer({ id: 'a', next_followup_at: new Date(NOW.getTime() - MS).toISOString() });
    expect(classifyOffer(o, NOW, 5)).toBe('hot');
  });

  it('classifies a yesterday follow-up as overdue when opens are below threshold', () => {
    const o = offer({ id: 'a', next_followup_at: new Date(NOW.getTime() - MS).toISOString() });
    expect(classifyOffer(o, NOW, 2)).toBe('overdue');
  });

  it('classifies a same-day follow-up earlier today as dueToday (still actionable)', () => {
    const earlier = new Date(NOW.getTime() - 2 * 60 * 60 * 1000); // 2h ago, same date
    const o = offer({ id: 'a', next_followup_at: earlier.toISOString() });
    expect(classifyOffer(o, NOW, 0)).toBe('dueToday');
  });

  it('classifies a same-day follow-up later today as dueToday', () => {
    const later = new Date(NOW.getTime() + 4 * 60 * 60 * 1000);
    const o = offer({ id: 'a', next_followup_at: later.toISOString() });
    expect(classifyOffer(o, NOW, 0)).toBe('dueToday');
  });

  it('skips a future follow-up (not today) when opens are low', () => {
    const o = offer({ id: 'a', next_followup_at: new Date(NOW.getTime() + 3 * MS).toISOString() });
    expect(classifyOffer(o, NOW, 0)).toBeNull();
  });

  it('handles invalid date strings gracefully', () => {
    const o = offer({ id: 'a', next_followup_at: 'not a date' });
    expect(classifyOffer(o, NOW, 0)).toBeNull();
  });
});

describe('buildDigest', () => {
  it('returns an empty digest when nothing is due', () => {
    const d = buildDigest([], NOW);
    expect(d.total).toBe(0);
    expect(d.totalOverdue).toBe(0);
    expect(d.totalDueToday).toBe(0);
    expect(d.groups).toEqual([]);
  });

  it('groups offers by creator with overdue and dueToday split', () => {
    const offers = [
      offer({ id: 'a', creator_id: 'gkitz', creator_name: 'Georg Kitz',
              next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
      offer({ id: 'b', creator_id: 'gkitz', creator_name: 'Georg Kitz',
              next_followup_at: new Date(NOW.getTime() + 3 * 60 * 60 * 1000).toISOString() }),
      offer({ id: 'c', creator_id: 'hbauer', creator_name: 'Helmut Bauer',
              next_followup_at: new Date(NOW.getTime() - 2 * MS).toISOString() }),
    ];
    const d = buildDigest(offers, NOW);
    expect(d.totalOverdue).toBe(2);
    expect(d.totalDueToday).toBe(1);
    expect(d.groups).toHaveLength(2);
    const gk = d.groups.find((g) => g.creatorId === 'gkitz')!;
    expect(gk.overdue.map((o) => o.id)).toEqual(['a']);
    expect(gk.dueToday.map((o) => o.id)).toEqual(['b']);
  });

  it('sorts creators by total open count desc', () => {
    const offers = [
      // hbauer: 1 offer
      offer({ id: 'h1', creator_id: 'hbauer', creator_name: 'Helmut Bauer',
              next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
      // gkitz: 2 offers
      offer({ id: 'g1', creator_id: 'gkitz', creator_name: 'Georg Kitz',
              next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
      offer({ id: 'g2', creator_id: 'gkitz', creator_name: 'Georg Kitz',
              next_followup_at: new Date(NOW.getTime() - 2 * MS).toISOString() }),
    ];
    const d = buildDigest(offers, NOW);
    expect(d.groups.map((g) => g.creatorId)).toEqual(['gkitz', 'hbauer']);
  });

  it('sorts offers within a creator by deal value desc', () => {
    const offers = [
      offer({ id: 'small', total_period: 1000,
              next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
      offer({ id: 'big', total_period: 50000,
              next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
      offer({ id: 'mid', total_period: 5000,
              next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
    ];
    const d = buildDigest(offers, NOW);
    expect(d.groups[0].overdue.map((o) => o.id)).toEqual(['big', 'mid', 'small']);
  });

  it('falls back to total_monthly when total_period is zero', () => {
    const offers = [
      offer({ id: 'a', total_period: 0, total_monthly: 100,
              next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
      offer({ id: 'b', total_period: 0, total_monthly: 500,
              next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
    ];
    const d = buildDigest(offers, NOW);
    expect(d.groups[0].overdue.map((o) => o.id)).toEqual(['b', 'a']);
  });

  it('keeps creators with the same name but different ids in separate groups', () => {
    const offers = [
      offer({ id: 'a', creator_id: 'rep1', creator_name: 'Same Name',
              next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
      offer({ id: 'b', creator_id: 'rep2', creator_name: 'Same Name',
              next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
    ];
    const d = buildDigest(offers, NOW);
    expect(d.groups).toHaveLength(2);
  });

  it('groups offers without creator_id under a fallback bucket', () => {
    const offers = [
      offer({ id: 'a', creator_id: null, creator_name: null,
              next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
    ];
    const d = buildDigest(offers, NOW);
    expect(d.groups).toHaveLength(1);
    expect(d.groups[0].creatorName).toBe('Ohne Ersteller');
  });

  it('ignores offers in non-sent stages even when they have a follow-up date', () => {
    const offers = [
      offer({ id: 'a', stage: 'closed',
              next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
      offer({ id: 'b', stage: 'lost',
              next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
    ];
    const d = buildDigest(offers, NOW);
    expect(d.total).toBe(0);
  });
});

describe('buildDigest — hot bucket', () => {
  it('puts an offer with ≥3 recent opens into the hot bucket', () => {
    const offers = [
      offer({ id: 'hot', sent_at: new Date(NOW.getTime() - 10 * MS).toISOString() }),
    ];
    const opens = new Map([['hot', 4]]);
    const d = buildDigest(offers, NOW, opens);
    expect(d.totalHot).toBe(1);
    expect(d.totalOverdue).toBe(0);
    expect(d.totalDueToday).toBe(0);
    expect(d.groups[0].hot.map((o) => o.id)).toEqual(['hot']);
  });

  it('does not double-count: an overdue+hot offer ends up only in hot', () => {
    const offers = [
      offer({ id: 'a', next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
    ];
    const opens = new Map([['a', 5]]);
    const d = buildDigest(offers, NOW, opens);
    expect(d.totalHot).toBe(1);
    expect(d.totalOverdue).toBe(0);
  });

  it('sorts hot offers by open count desc, then deal value desc', () => {
    const offers = [
      offer({ id: 'small-tied', total_period: 1500,
              sent_at: new Date(NOW.getTime() - 10 * MS).toISOString() }),
      offer({ id: 'most-opens', total_period: 1000,
              sent_at: new Date(NOW.getTime() - 10 * MS).toISOString() }),
      offer({ id: 'big-tied',  total_period: 5000,
              sent_at: new Date(NOW.getTime() - 10 * MS).toISOString() }),
    ];
    const opens = new Map([
      ['small-tied', 3],
      ['most-opens', 7],
      ['big-tied', 3],
    ]);
    const d = buildDigest(offers, NOW, opens);
    expect(d.groups[0].hot.map((o) => o.id)).toEqual([
      'most-opens',  // 7 opens — wins on open count alone
      'big-tied',    // 3 opens, € 5000 — wins the tie on value
      'small-tied',  // 3 opens, € 1500
    ]);
  });

  it('opens map is preserved on the data so the renderer can show counts', () => {
    const offers = [
      offer({ id: 'a', sent_at: new Date(NOW.getTime() - 10 * MS).toISOString() }),
    ];
    const opens = new Map([['a', 4]]);
    const d = buildDigest(offers, NOW, opens);
    expect(d.opensByOfferId.get('a')).toBe(4);
  });
});

describe('renderDigestHtml', () => {
  it('renders an empty-state message when there are no groups', () => {
    const d = buildDigest([], NOW);
    const html = renderDigestHtml(d);
    expect(html).toContain('Keine offenen oder überfälligen Follow-ups');
  });

  it('renders the Heiße Spur section above other buckets when present', () => {
    const offers = [
      offer({ id: 'hot', sent_at: new Date(NOW.getTime() - 10 * MS).toISOString() }),
      offer({ id: 'over', next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
    ];
    const opens = new Map([['hot', 4]]);
    const html = renderDigestHtml(buildDigest(offers, NOW, opens));
    const hotIdx = html.indexOf('Heiße Spur');
    const ueberfaelligIdx = html.indexOf('Überfällig');
    expect(hotIdx).toBeGreaterThan(-1);
    expect(ueberfaelligIdx).toBeGreaterThan(-1);
    expect(hotIdx).toBeLessThan(ueberfaelligIdx);
  });

  it('shows the open count on each hot row', () => {
    const offers = [
      offer({ id: 'h', sent_at: new Date(NOW.getTime() - 10 * MS).toISOString() }),
    ];
    const opens = new Map([['h', 5]]);
    const html = renderDigestHtml(buildDigest(offers, NOW, opens));
    expect(html).toMatch(/5× geöffnet/);
  });

  it('wraps each row in a deep-link when appBaseUrl is provided (Phase 2)', () => {
    const offers = [
      offer({ id: 'abc-123', next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
    ];
    const html = renderDigestHtml(buildDigest(offers, NOW), {
      appBaseUrl: 'https://app.kitz.example',
    });
    expect(html).toContain('https://app.kitz.example/?action=send-followup&amp;offer=abc-123');
    expect(html).toMatch(/utm_source=digest/);
    expect(html).toMatch(/Folgemail senden/);
  });

  it('renders plain rows without links when appBaseUrl is omitted', () => {
    const offers = [
      offer({ id: 'abc-123', next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
    ];
    const html = renderDigestHtml(buildDigest(offers, NOW));
    expect(html).not.toMatch(/<a href/);
    expect(html).not.toMatch(/Folgemail senden/);
  });

  it('strips trailing slashes from appBaseUrl so the URL is well-formed', () => {
    const offers = [
      offer({ id: 'abc', next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
    ];
    const html = renderDigestHtml(buildDigest(offers, NOW), {
      appBaseUrl: 'https://app.kitz.example///',
    });
    expect(html).toContain('https://app.kitz.example/?action=send-followup');
    expect(html).not.toContain('example////?');
  });

  it('hot-bucket rows also get deep-links', () => {
    const offers = [
      offer({ id: 'hot-1', sent_at: new Date(NOW.getTime() - 10 * MS).toISOString() }),
    ];
    const opens = new Map([['hot-1', 4]]);
    const html = renderDigestHtml(buildDigest(offers, NOW, opens), {
      appBaseUrl: 'https://app.kitz.example',
    });
    expect(html).toContain('action=send-followup&amp;offer=hot-1');
  });

  it('escapes HTML in customer and creator names to prevent injection', () => {
    const offers = [
      offer({
        id: 'a',
        creator_id: 'rep',
        creator_name: '<script>bad</script>',
        customer_company: '"><img onerror=1>',
        next_followup_at: new Date(NOW.getTime() - MS).toISOString(),
      }),
    ];
    const html = renderDigestHtml(buildDigest(offers, NOW));
    expect(html).not.toContain('<script>bad</script>');
    expect(html).not.toContain('"><img onerror=1>');
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
  });

  it('shows overdue and dueToday counts in the header', () => {
    const offers = [
      offer({ id: 'a', next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
      offer({ id: 'b', next_followup_at: new Date(NOW.getTime() - 2 * MS).toISOString() }),
      offer({ id: 'c', next_followup_at: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString() }),
    ];
    const html = renderDigestHtml(buildDigest(offers, NOW));
    expect(html).toMatch(/2 überfällig/);
    expect(html).toMatch(/1 heute fällig/);
  });

  it('omits empty bucket sections', () => {
    const offers = [
      offer({ id: 'a', next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
    ];
    const html = renderDigestHtml(buildDigest(offers, NOW));
    expect(html).toContain('Überfällig');
    expect(html).not.toContain('Heute fällig');
  });
});

describe('digestSubject', () => {
  it('summarizes counts in the subject line', () => {
    const offers = [
      offer({ id: 'a', next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
      offer({ id: 'b', next_followup_at: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString() }),
    ];
    const subj = digestSubject(buildDigest(offers, NOW));
    expect(subj).toContain('1 überfällig');
    expect(subj).toContain('1 heute');
  });

  it('prefixes a 🔥 marker when there are hot leads', () => {
    const offers = [
      offer({ id: 'h', sent_at: new Date(NOW.getTime() - 10 * MS).toISOString() }),
    ];
    const opens = new Map([['h', 4]]);
    const subj = digestSubject(buildDigest(offers, NOW, opens));
    expect(subj).toMatch(/🔥 1 heiße Spur/);
  });
});
