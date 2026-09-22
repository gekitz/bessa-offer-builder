import { describe, it, expect, vi } from 'vitest';

// The campaign-outcome write-back helper is pure TS (no Deno-only imports)
// and is imported directly from the edge function so it can be unit-tested —
// there is no edge-function test harness in the repo (mirrors how
// campaignAttribution.test.ts imports its subject cross-tree).
import {
  applyOutcome,
  noteForOutcome,
  isRksvOutcome,
  CAMPAIGN_ACTOR,
  type OutcomeClient,
  type RecipientRow,
} from '../../../../supabase/functions/campaign-outcome/outcomeWriteBack.ts';

// Minimal chainable mock of the supabase client shape applyOutcome uses.
// - campaign_recipients: update(...).eq('token').is('outcome', null).select()
//   → returns `stampRows` (the compare-and-set result).
// - viertl_licenses:     update(...).eq('id')  → thenable terminal.
// - viertl_events:       insert(...)           → thenable.
type Patch = Record<string, unknown>;

function makeClient(stampRows: RecipientRow[] | null) {
  const recipientSelect = vi.fn(() => Promise.resolve({ data: stampRows, error: null }));
  const recipientUpdate = vi.fn((_patch: Patch) => ({
    eq: () => ({ is: () => ({ select: recipientSelect }) }),
  }));

  const licenseEqResult = { then: (r: (v: unknown) => void) => Promise.resolve({ error: null }).then(r) };
  const licenseUpdate = vi.fn((_patch: Patch) => ({ eq: vi.fn(() => licenseEqResult) }));

  const eventInsert = vi.fn((_row: Patch) => Promise.resolve({ error: null }));

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'campaign_recipients') return { update: recipientUpdate };
      if (table === 'viertl_licenses') return { update: licenseUpdate };
      if (table === 'viertl_events') return { insert: eventInsert };
      throw new Error('unexpected table ' + table);
    }),
  } as unknown as OutcomeClient;

  return { client, recipientUpdate, licenseUpdate, eventInsert };
}

function recip(over: Partial<RecipientRow> = {}): RecipientRow {
  return {
    id: 'r1',
    token: 'tok',
    subject_type: 'viertl_license',
    subject_id: 'lic-1',
    started_at: null,
    outcome: null,
    payload: {},
    ...over,
  };
}

describe('isRksvOutcome — only the 3-value Type-A terminal set (C4)', () => {
  it('accepts the three Type-A outcomes', () => {
    expect(isRksvOutcome('authorized')).toBe(true);
    expect(isRksvOutcome('quote_requested')).toBe(true);
    expect(isRksvOutcome('soft_check')).toBe(true);
  });
  it('rejects Type-B offer_accepted and junk', () => {
    expect(isRksvOutcome('offer_accepted')).toBe(false);
    expect(isRksvOutcome('nonsense')).toBe(false);
    expect(isRksvOutcome(undefined)).toBe(false);
  });
});

describe('noteForOutcome', () => {
  it('authorized', () => {
    expect(noteForOutcome('authorized', {})).toContain('Auftrag erteilt');
  });
  it('quote_requested → setup-size label', () => {
    expect(noteForOutcome('quote_requested', { setupSize: 'mehrplatz' })).toContain('Mehrplatz');
    expect(noteForOutcome('quote_requested', { setupSize: 'einzelplatz' })).toContain('Einzelplatz');
  });
  it('soft_check', () => {
    expect(noteForOutcome('soft_check', {})).toContain('Remote-OS-Check');
  });
});

describe('applyOutcome — M3 idempotency guard', () => {
  it('short-circuits when the outcome is already set (no update, no note, no license write)', async () => {
    const { client, recipientUpdate, licenseUpdate, eventInsert } = makeClient(null);
    const res = await applyOutcome(client, recip({ outcome: 'authorized' }), 'authorized', {});
    expect(res).toEqual({ recorded: false, wroteBack: false, idempotent: true });
    expect(recipientUpdate).not.toHaveBeenCalled();
    expect(licenseUpdate).not.toHaveBeenCalled();
    expect(eventInsert).not.toHaveBeenCalled();
  });

  it('short-circuits on a DIFFERENT already-terminal outcome (first terminal wins)', async () => {
    const { client, recipientUpdate, eventInsert } = makeClient(null);
    const res = await applyOutcome(client, recip({ outcome: 'soft_check' }), 'quote_requested', {});
    expect(res.idempotent).toBe(true);
    expect(recipientUpdate).not.toHaveBeenCalled();
    expect(eventInsert).not.toHaveBeenCalled();
  });

  it('compare-and-set race: stamp returns 0 rows → treat as already terminalized, skip write-back', async () => {
    const { client, eventInsert } = makeClient([]); // update matched no row
    const res = await applyOutcome(client, recip(), 'authorized', {});
    expect(res).toEqual({ recorded: false, wroteBack: false, idempotent: true });
    expect(eventInsert).not.toHaveBeenCalled();
  });
});

describe('applyOutcome — fresh terminal write-backs', () => {
  it('authorize: records outcome + exactly one viertl_events note (sentinel actor), no license update', async () => {
    const { client, recipientUpdate, licenseUpdate, eventInsert } = makeClient([recip()]);
    const res = await applyOutcome(client, recip(), 'authorized', { signedByName: 'Max' });
    expect(res).toEqual({ recorded: true, wroteBack: true, idempotent: false });
    expect(recipientUpdate).toHaveBeenCalledTimes(1);
    expect(licenseUpdate).not.toHaveBeenCalled();
    expect(eventInsert).toHaveBeenCalledTimes(1);
    const note = eventInsert.mock.calls[0]![0];
    expect(note.license_id).toBe('lic-1');
    expect(note.message).toContain('Auftrag erteilt');
    expect(note.actor_id).toBe(CAMPAIGN_ACTOR.id);
    expect(note.actor_name).toBe(CAMPAIGN_ACTOR.name);
  });

  it('quote_requested: sets hardware_needed=true WITH updated_by_* (C6) + one note with the label', async () => {
    const { client, licenseUpdate, eventInsert } = makeClient([recip()]);
    await applyOutcome(client, recip(), 'quote_requested', { setupSize: 'mehrplatz' });
    expect(licenseUpdate).toHaveBeenCalledTimes(1);
    const patch = licenseUpdate.mock.calls[0]![0];
    expect(patch.hardware_needed).toBe(true);
    expect(patch.updated_by_id).toBe(CAMPAIGN_ACTOR.id);
    expect(patch.updated_by_name).toBe(CAMPAIGN_ACTOR.name);
    const note = eventInsert.mock.calls[0]![0];
    expect(note.message).toContain('Mehrplatz');
  });

  it('soft_check: one note, no license update', async () => {
    const { client, licenseUpdate, eventInsert } = makeClient([recip()]);
    await applyOutcome(client, recip(), 'soft_check', {});
    expect(licenseUpdate).not.toHaveBeenCalled();
    expect(eventInsert).toHaveBeenCalledTimes(1);
  });

  it('non-viertl subject: records outcome but performs no Viertl write-back', async () => {
    const { client, licenseUpdate, eventInsert } = makeClient([recip({ subject_type: 'mesonic_customer' })]);
    const res = await applyOutcome(client, recip({ subject_type: 'mesonic_customer' }), 'authorized', {});
    expect(res).toEqual({ recorded: true, wroteBack: false, idempotent: false });
    expect(licenseUpdate).not.toHaveBeenCalled();
    expect(eventInsert).not.toHaveBeenCalled();
  });
});
