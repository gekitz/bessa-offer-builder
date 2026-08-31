import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── chainable supabase mock (per-table) ──
function makeChain(response: { data: unknown; error: unknown }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: any = {};
  for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'order']) {
    builder[m] = vi.fn((...args: unknown[]) => { calls.push({ method: m, args }); return builder; });
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(response));
  builder.single = vi.fn(() => Promise.resolve(response));
  builder.then = (res: (v: unknown) => void) => Promise.resolve(response).then(res);
  builder._calls = calls;
  return builder;
}
const chains: Record<string, any> = {};
const fromMock = vi.fn((...a: any[]) => chains[a[0] as string]);
vi.mock('../../../../lib/supabase', () => ({ supabase: { from: (...a: any[]) => fromMock(...a) } }));

// ── mock the network fetch loop ──
const fetchMock = vi.fn();
vi.mock('../../lib/mesonicBelege', () => ({ fetchCustomerBelege: (...a: any[]) => fetchMock(...a) }));

import { syncBelege } from '../belegeApi';

beforeEach(() => {
  for (const k of Object.keys(chains)) delete chains[k];
  fromMock.mockClear();
  fetchMock.mockReset();
});

describe('syncBelege', () => {
  it('resumes from synced_index+1, upserts new belege, and advances the pointer', async () => {
    chains.mesonic_beleg_sync = makeChain({ data: { synced_index: 4, synced_at: 't' }, error: null });
    chains.mesonic_beleg = makeChain({ data: [], error: null });
    fetchMock.mockResolvedValue({
      belege: [{ index: 5, laufnummer: '9', belegart: '4', datumFaktura: '2024-05-01', positions: [{ datentyp: '1', artikelnummer: 'HW', erloeskonto: '8000', bezeichnung: 'x', menge: 1, einzelpreis: 10 }] }],
      scannedTo: 7,
    });

    await syncBelege('272765');

    // fetch resumed at prev(4)+1 = 5
    expect(fetchMock).toHaveBeenCalledWith('272765', expect.objectContaining({ startIndex: 5 }));

    // beleg upsert payload
    const upsertBeleg = chains.mesonic_beleg._calls.find((c: any) => c.method === 'upsert');
    const rows = upsertBeleg.args[0] as any[];
    expect(rows[0]).toMatchObject({ mesonic_kdnr: '272765', beleg_index: 5, belegart: '4', datum_faktura: '2024-05-01' });

    // sync pointer advanced to max(prev=4, scannedTo=7) = 7
    const upsertSync = chains.mesonic_beleg_sync._calls.find((c: any) => c.method === 'upsert');
    expect(upsertSync.args[0]).toMatchObject({ mesonic_kdnr: '272765', synced_index: 7 });
  });

  it('full=true rescans from index 1', async () => {
    chains.mesonic_beleg_sync = makeChain({ data: { synced_index: 20 }, error: null });
    chains.mesonic_beleg = makeChain({ data: [], error: null });
    fetchMock.mockResolvedValue({ belege: [], scannedTo: 3 });

    await syncBelege('272765', { full: true });

    expect(fetchMock).toHaveBeenCalledWith('272765', expect.objectContaining({ startIndex: 1 }));
    // pointer never moves backward: max(20, 3) = 20
    const upsertSync = chains.mesonic_beleg_sync._calls.find((c: any) => c.method === 'upsert');
    expect(upsertSync.args[0]).toMatchObject({ synced_index: 20 });
  });
});
