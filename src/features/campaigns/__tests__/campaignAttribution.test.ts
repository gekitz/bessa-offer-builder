import { describe, it, expect, vi } from 'vitest';

// The webhook attribution helper is pure TS (no Deno-only imports) and is
// imported directly from the edge function so it can be unit-tested — there
// is no edge-function test harness in the repo, so extracting the logic is
// the only way to satisfy the regression guard.
import {
  attributeCampaignEvent,
  type AttributionClient,
} from '../../../../supabase/functions/resend-webhook/campaignAttribution.ts';

// Minimal chainable mock of the supabase client shape the helper uses.
function makeClient(recip: unknown) {
  const updateEq = vi.fn(() => Promise.resolve({ error: null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const maybeSingle = vi.fn(() => Promise.resolve({ data: recip, error: null }));
  const client = {
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ limit: () => ({ maybeSingle }) }) }),
      update,
    })),
  } as unknown as AttributionClient;
  return { client, update, updateEq };
}

describe('attributeCampaignEvent', () => {
  it('campaign hit: stamps opened_at and reports matched+updated (never touches offers)', async () => {
    const { client, update, updateEq } = makeClient({
      id: 'r1', delivered_at: null, opened_at: null, clicked_at: null, bounced_at: null,
    });
    const res = await attributeCampaignEvent(client, 're_123', 'opened', '2026-09-15T10:00:00Z');
    expect(res).toEqual({ matched: true, updated: true });
    expect(update).toHaveBeenCalledWith({ opened_at: '2026-09-15T10:00:00Z' });
    expect(updateEq).toHaveBeenCalledWith('id', 'r1');
  });

  it('campaign miss: reports matched=false so the offer path runs unchanged', async () => {
    const { client, update } = makeClient(null);
    const res = await attributeCampaignEvent(client, 're_absent', 'opened', 'now');
    expect(res).toEqual({ matched: false });
    expect(update).not.toHaveBeenCalled();
  });

  it('idempotent: an already-stamped column is not re-written (matched, not updated)', async () => {
    const { client, update } = makeClient({
      id: 'r1', delivered_at: null, opened_at: 'already', clicked_at: null, bounced_at: null,
    });
    const res = await attributeCampaignEvent(client, 're_123', 'opened', 'now');
    expect(res).toEqual({ matched: true, updated: false });
    expect(update).not.toHaveBeenCalled();
  });

  it('maps each event type to its funnel column', async () => {
    for (const [evt, col] of [
      ['delivered', 'delivered_at'],
      ['clicked', 'clicked_at'],
      ['bounced', 'bounced_at'],
    ] as const) {
      const { client, update } = makeClient({
        id: 'r1', delivered_at: null, opened_at: null, clicked_at: null, bounced_at: null,
      });
      await attributeCampaignEvent(client, 're_1', evt, 'ts');
      expect(update).toHaveBeenCalledWith({ [col]: 'ts' });
    }
  });
});
