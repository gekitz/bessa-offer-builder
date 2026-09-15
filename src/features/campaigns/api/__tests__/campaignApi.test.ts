import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-table chainable Supabase mock (same style as viertlApi.test.ts /
// procurementApi.test.ts). Passthrough extended for the campaign API:
// upsert (enroll), not/is (funnel + list filters), limit (token lookup),
// gte/lte (not_opened cutoff).
type AnyFn = (...args: unknown[]) => unknown;
interface ChainResponse { data: unknown; error: unknown; count?: number }

function makeChain(response: ChainResponse) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  const passthrough = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'in', 'order', 'not', 'is', 'limit', 'gte', 'lte',
  ];
  for (const m of passthrough) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    });
  }
  builder.single = vi.fn(() => Promise.resolve(response));
  builder.maybeSingle = vi.fn(() => Promise.resolve(response));
  builder.then = (resolve: (v: unknown) => void) => Promise.resolve(response).then(resolve);
  return Object.assign(builder, { _calls: calls }) as Record<string, ReturnType<typeof vi.fn>> & {
    _calls: typeof calls;
  };
}

const chains: Record<string, ReturnType<typeof makeChain>> = {};
// getFunnelCounts issues many sequential queries against the same table;
// return a FRESH chain each .from() call so per-query .not()/.eq() args
// don't accumulate, but resolve to the same count response.
let funnelMode = false;
let funnelResponse: ChainResponse = { data: null, error: null, count: 0 };
const fromMock = vi.fn<AnyFn>((table: unknown) => {
  if (funnelMode && table === 'campaign_recipients') return makeChain(funnelResponse);
  return chains[table as string];
});
const invokeMock = vi.fn<AnyFn>();

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import {
  createCampaign,
  dryRunSend,
  enrollRecipients,
  getFunnelCounts,
  getRecipientByToken,
  listRecipients,
  recordOutcome,
  saveRecipientPayload,
  sendCampaign,
  submitOutcome,
} from '../campaignApi';
import type { CampaignRecipient } from '../../types';

const ACTOR = { id: 'u1', name: 'Georg' };

function recipientRow(over: Record<string, unknown> = {}) {
  return {
    id: 'r1', campaign_id: 'c1', subject_type: 'viertl_license', subject_id: 'l1',
    name: 'Haus am Wald', email: 'a@b.at', batch: 'w1', resend_count: 0, token: 'tok',
    sent_at: null, delivered_at: null, opened_at: null, clicked_at: null,
    landed_at: null, started_at: null, outcome: null, outcome_at: null, bounced_at: null,
    payload: {}, ticket_id: null, offer_id: null, resend_id: null,
    created_at: 't0', updated_at: 't1', ...over,
  };
}

beforeEach(() => {
  for (const k of Object.keys(chains)) delete chains[k];
  fromMock.mockClear();
  invokeMock.mockReset();
  funnelMode = false;
});

describe('rowToRecipient mapping', () => {
  it('maps every snake_case column to camelCase incl. payload passthrough', async () => {
    chains.campaign_recipients = makeChain({
      data: recipientRow({
        subject_type: 'viertl_license', resend_id: 're_123', landed_at: 'L',
        payload: { hasWin10: 'nein', setupSize: 'mehrplatz' }, resend_count: 2,
      }),
      error: null,
    });
    const r = await getRecipientByToken('tok') as CampaignRecipient;
    expect(r).toMatchObject({
      subjectType: 'viertl_license',
      subjectId: 'l1',
      resendId: 're_123',
      landedAt: 'L',
      resendCount: 2,
      payload: { hasWin10: 'nein', setupSize: 'mehrplatz' },
    });
  });
});

describe('createCampaign', () => {
  it('sends created_by_* from the actor and the CHECK-valid type', async () => {
    chains.campaigns = makeChain({
      data: { id: 'c1', type: 'rksv_signature', key: '2026-acos', title: 'RKSV',
        email_subject: null, email_template: null, status: 'draft',
        created_by_id: 'u1', created_by_name: 'Georg', created_at: '', updated_at: '' },
      error: null,
    });
    await createCampaign({ type: 'rksv_signature', key: '2026-acos', title: 'RKSV' }, ACTOR);
    const insert = chains.campaigns._calls.find((c) => c.method === 'insert')!.args[0] as Record<string, unknown>;
    expect(insert.type).toBe('rksv_signature');
    expect(insert.key).toBe('2026-acos');
    expect(insert.created_by_id).toBe('u1');
    expect(insert.created_by_name).toBe('Georg');
  });
});

describe('enrollRecipients', () => {
  it('upserts with the idempotency onConflict + ignoreDuplicates and computes skipped', async () => {
    // Requested 2 subjects; only 1 row comes back (the other was a dup).
    chains.campaign_recipients = makeChain({
      data: [recipientRow({ id: 'r1', subject_id: 'l1' })],
      error: null,
    });
    const res = await enrollRecipients('c1', [
      { subjectType: 'viertl_license', subjectId: 'l1', name: 'A', email: 'a@b.at', batch: 'w1' },
      { subjectType: 'viertl_license', subjectId: 'l2', name: 'B', email: null, batch: 'w1' },
    ]);
    const upsert = chains.campaign_recipients._calls.find((c) => c.method === 'upsert')!;
    const rows = upsert.args[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0].campaign_id).toBe('c1');
    expect(typeof rows[0].token).toBe('string');
    const opts = upsert.args[1] as Record<string, unknown>;
    expect(opts.onConflict).toBe('campaign_id,subject_type,subject_id');
    expect(opts.ignoreDuplicates).toBe(true);
    expect(res.enrolled).toHaveLength(1);
    expect(res.skipped).toBe(1);
  });

  it('short-circuits on empty input without touching the client', async () => {
    const res = await enrollRecipients('c1', []);
    expect(res).toEqual({ enrolled: [], skipped: 0 });
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('saveRecipientPayload', () => {
  it('shallow-merges into payload and sets started_at only when null', async () => {
    chains.campaign_recipients = makeChain({
      data: recipientRow({ payload: { knownHardwareNeeded: false }, started_at: null }),
      error: null,
    });
    await saveRecipientPayload('tok', { hasWin10: 'nein' });
    const update = chains.campaign_recipients._calls.find((c) => c.method === 'update')!.args[0] as Record<string, unknown>;
    expect(update.payload).toEqual({ knownHardwareNeeded: false, hasWin10: 'nein' });
    expect(typeof update.started_at).toBe('string');
  });

  it('does NOT re-stamp started_at when already set', async () => {
    chains.campaign_recipients = makeChain({
      data: recipientRow({ started_at: 'already', payload: {} }),
      error: null,
    });
    await saveRecipientPayload('tok', { setupSize: 'einzelplatz' });
    const update = chains.campaign_recipients._calls.find((c) => c.method === 'update')!.args[0] as Record<string, unknown>;
    expect(update).not.toHaveProperty('started_at');
  });
});

describe('recordOutcome', () => {
  it('writes outcome + outcome_at, merges the terminal patch, stamps started_at if null', async () => {
    chains.campaign_recipients = makeChain({
      data: recipientRow({ started_at: null, payload: { hasWin10: 'ja' } }),
      error: null,
    });
    await recordOutcome('tok', 'authorized', { signatureData: 'data:...', signedByName: 'Max' });
    const update = chains.campaign_recipients._calls.find((c) => c.method === 'update')!.args[0] as Record<string, unknown>;
    expect(update.outcome).toBe('authorized');
    expect(typeof update.outcome_at).toBe('string');
    expect(update.payload).toMatchObject({ hasWin10: 'ja', signatureData: 'data:...', signedByName: 'Max' });
    expect(typeof update.started_at).toBe('string');
  });

  it('rejects an outcome outside the known set', async () => {
    await expect(recordOutcome('tok', 'nonsense' as never)).rejects.toThrow(/Ungültiges Outcome/);
  });
});

describe('getRecipientByToken', () => {
  it('filters by token and limits to 1', async () => {
    chains.campaign_recipients = makeChain({ data: recipientRow(), error: null });
    await getRecipientByToken('tok');
    const calls = chains.campaign_recipients._calls;
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'token' && c.args[1] === 'tok')).toBe(true);
    expect(calls.some((c) => c.method === 'limit' && c.args[0] === 1)).toBe(true);
  });
});

describe('listRecipients filter buckets', () => {
  it('opened_not_acted → opened_at not null AND outcome is null', async () => {
    chains.campaign_recipients = makeChain({ data: [], error: null });
    await listRecipients('c1', { filter: 'opened_not_acted' });
    const calls = chains.campaign_recipients._calls;
    expect(calls.some((c) => c.method === 'not' && c.args[0] === 'opened_at')).toBe(true);
    expect(calls.some((c) => c.method === 'is' && c.args[0] === 'outcome' && c.args[1] === null)).toBe(true);
  });

  it('started_unfinished → started_at not null AND outcome is null', async () => {
    chains.campaign_recipients = makeChain({ data: [], error: null });
    await listRecipients('c1', { filter: 'started_unfinished' });
    const calls = chains.campaign_recipients._calls;
    expect(calls.some((c) => c.method === 'not' && c.args[0] === 'started_at')).toBe(true);
    expect(calls.some((c) => c.method === 'is' && c.args[0] === 'outcome' && c.args[1] === null)).toBe(true);
  });

  it('not_opened → opened_at is null, sent_at not null, sent_at <= cutoff, sliced per batch', async () => {
    chains.campaign_recipients = makeChain({ data: [], error: null });
    await listRecipients('c1', { filter: 'not_opened', notOpenedDays: 7, batch: 'w1' });
    const calls = chains.campaign_recipients._calls;
    expect(calls.some((c) => c.method === 'is' && c.args[0] === 'opened_at' && c.args[1] === null)).toBe(true);
    expect(calls.some((c) => c.method === 'not' && c.args[0] === 'sent_at')).toBe(true);
    expect(calls.some((c) => c.method === 'lte' && c.args[0] === 'sent_at')).toBe(true);
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'batch' && c.args[1] === 'w1')).toBe(true);
  });
});

describe('getFunnelCounts', () => {
  it('issues count queries and returns the rollup shape', async () => {
    funnelMode = true;
    funnelResponse = { data: null, error: null, count: 3 };
    const counts = await getFunnelCounts('c1');
    // 11 count queries → 11 .from() calls in funnel mode.
    expect(counts).toMatchObject({
      total: 3, sent: 3, delivered: 3, opened: 3, clicked: 3, landed: 3, started: 3,
      outcomeAuthorized: 3, outcomeQuoteRequested: 3, outcomeSoftCheck: 3, noEmail: 3,
    });
  });
});

describe('dryRunSend (idempotent send partition)', () => {
  const recips: CampaignRecipient[] = [
    { ...(recipientRowCamel('a', { email: 'a@x.at', sentAt: null })) },
    { ...(recipientRowCamel('b', { email: 'b@x.at', sentAt: '2026-01-01' })) },
    { ...(recipientRowCamel('c', { email: null, sentAt: null })) },
  ];
  function recipientRowCamel(id: string, over: Partial<CampaignRecipient>): CampaignRecipient {
    return {
      id, campaignId: 'c1', subjectType: 'viertl_license', subjectId: 'l', name: null,
      email: null, batch: 'w1', resendCount: 0, token: 't' + id, sentAt: null,
      deliveredAt: null, openedAt: null, clickedAt: null, landedAt: null, startedAt: null,
      outcome: null, outcomeAt: null, bouncedAt: null, payload: {}, ticketId: null,
      offerId: null, resendId: null, createdAt: '', updatedAt: '', ...over,
    };
  }

  it('never-sent with email → toSend; already-sent → skipped; no-email → noEmail', () => {
    const part = dryRunSend(recips, ['a', 'b', 'c'], false);
    expect(part.toSend).toEqual(['a']);
    expect(part.skipped).toEqual(['b']);
    expect(part.noEmail).toEqual(['c']);
  });

  it('resend=true moves an already-sent (with email) row into toSend', () => {
    const part = dryRunSend(recips, ['a', 'b', 'c'], true);
    expect(part.toSend).toEqual(['a', 'b']);
    expect(part.skipped).toEqual([]);
    expect(part.noEmail).toEqual(['c']); // no-email never sends, even on resend
  });

  it('ignores unknown ids in the selection', () => {
    const part = dryRunSend(recips, ['a', 'zzz'], false);
    expect(part.toSend).toEqual(['a']);
  });
});

describe('sendCampaign', () => {
  it('invokes the edge fn with the body and returns the result', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, sent: 2, skipped: 1, noEmail: 0, failed: 0, batch: 'w1' }, error: null });
    const res = await sendCampaign({ campaignId: 'c1', recipientIds: ['a', 'b'], batch: 'w1' });
    expect(invokeMock).toHaveBeenCalledWith('send-campaign', {
      body: { campaignId: 'c1', recipientIds: ['a', 'b'], batch: 'w1', resend: false },
    });
    expect(res).toMatchObject({ ok: true, sent: 2, batch: 'w1' });
  });

  it('unwraps the error text from the edge-function response body', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: { body: JSON.stringify({ error: 'Kampagne archiviert' }) } },
    });
    await expect(sendCampaign({ campaignId: 'c1', recipientIds: ['a'], batch: 'w1' }))
      .rejects.toThrow('Kampagne archiviert');
  });
});

describe('submitOutcome (campaign-outcome edge fn)', () => {
  it('invokes campaign-outcome with the token/outcome/payload body and maps the returned row', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, idempotent: false, recipient: recipientRow({ outcome: 'authorized', outcome_at: 'X' }) },
      error: null,
    });
    const r = await submitOutcome({ token: 'tok', outcome: 'authorized', payload: { signedByName: 'Max' } });
    expect(invokeMock).toHaveBeenCalledWith('campaign-outcome', {
      body: { token: 'tok', outcome: 'authorized', payload: { signedByName: 'Max' } },
    });
    expect(r.outcome).toBe('authorized');
    expect(r.outcomeAt).toBe('X');
  });

  it('defaults an empty payload when none is given', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, recipient: recipientRow() }, error: null });
    await submitOutcome({ token: 'tok', outcome: 'soft_check' });
    expect(invokeMock).toHaveBeenCalledWith('campaign-outcome', {
      body: { token: 'tok', outcome: 'soft_check', payload: {} },
    });
  });

  it('unwraps the error text from the edge-function response body', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: { body: JSON.stringify({ error: 'Empfänger nicht gefunden.' }) } },
    });
    await expect(submitOutcome({ token: 'nope', outcome: 'authorized' }))
      .rejects.toThrow('Empfänger nicht gefunden.');
  });
});
