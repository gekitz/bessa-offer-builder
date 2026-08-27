import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-table chainable Supabase mock (same style as procurementApi.test.ts).
type AnyFn = (...args: unknown[]) => unknown;
interface ChainResponse { data: unknown; error: unknown; count?: number }

function makeChain(response: ChainResponse) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order'];
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
const fromMock = vi.fn<AnyFn>((table: unknown) => chains[table as string]);
const invokeMock = vi.fn<AnyFn>();

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import { addNote, linkOffer, listEvents, listLicenses, notifyViertlClosure, unlinkOffer, updateLicense } from '../viertlApi';

const ACTOR = { id: 'u1', name: 'Georg' };

beforeEach(() => {
  for (const k of Object.keys(chains)) delete chains[k];
  fromMock.mockClear();
  invokeMock.mockReset();
});

describe('listLicenses', () => {
  it('maps snake_case rows to camelCase domain objects', async () => {
    chains.viertl_licenses = makeChain({
      data: [{
        id: 'l1', mesonic_kdnr: '236000', name: 'Haus am Wald', contact: 'Martina',
        street: 'Weg 1', plz: '9081', ort: 'Reifnitz', email: null,
        gastrotouch_version: '67.24', last_update: '2026-03-10', hardware_model: 'Pulse P40',
        hardware_needed: true, wartung: 'sww', status: 'done', customer_status: 'active',
        closed_reason: null, closed_at: null, notes: null, linked_offer_id: null,
        created_at: 't0', updated_at: 't1',
      }],
      error: null,
    });

    const rows = await listLicenses();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      mesonicKdnr: '236000',
      gastrotouchVersion: '67.24',
      lastUpdate: '2026-03-10',
      hardwareNeeded: true,
      wartung: 'sww',
      status: 'done',
      customerStatus: 'active',
    });
  });
});

describe('updateLicense', () => {
  it('maps camelCase patch to snake_case and always sends the actor', async () => {
    chains.viertl_licenses = makeChain({
      data: { id: 'l1', mesonic_kdnr: '1', name: 'X', wartung: 'none', status: 'replied',
        customer_status: 'active', hardware_needed: false, created_at: '', updated_at: '' },
      error: null,
    });

    await updateLicense('l1', { status: 'replied', hardwareNeeded: true }, ACTOR);

    const update = chains.viertl_licenses._calls.find((c) => c.method === 'update');
    const payload = update!.args[0] as Record<string, unknown>;
    expect(payload.status).toBe('replied');
    expect(payload.hardware_needed).toBe(true);
    expect(payload.updated_by_id).toBe('u1');
    expect(payload.updated_by_name).toBe('Georg');
    // untouched fields are not in the patch
    expect(payload).not.toHaveProperty('notes');
  });

  it('sets closed_at when the customer is closed and clears it otherwise', async () => {
    chains.viertl_licenses = makeChain({ data: { id: 'l1', mesonic_kdnr: '1', name: 'X', wartung: 'none', status: 'new', customer_status: 'closed', hardware_needed: false, created_at: '', updated_at: '' }, error: null });
    await updateLicense('l1', { customerStatus: 'closed' }, ACTOR);
    let payload = chains.viertl_licenses._calls.find((c) => c.method === 'update')!.args[0] as Record<string, unknown>;
    expect(payload.customer_status).toBe('closed');
    expect(typeof payload.closed_at).toBe('string');

    chains.viertl_licenses = makeChain({ data: { id: 'l1', mesonic_kdnr: '1', name: 'X', wartung: 'none', status: 'new', customer_status: 'active', hardware_needed: false, created_at: '', updated_at: '' }, error: null });
    await updateLicense('l1', { customerStatus: 'active' }, ACTOR);
    payload = chains.viertl_licenses._calls.find((c) => c.method === 'update')!.args[0] as Record<string, unknown>;
    expect(payload.closed_at).toBeNull();
  });

  it('maps null-able free-text fields through', async () => {
    chains.viertl_licenses = makeChain({ data: { id: 'l1', mesonic_kdnr: '1', name: 'X', wartung: 'none', status: 'new', customer_status: 'active', hardware_needed: false, created_at: '', updated_at: '' }, error: null });
    await updateLicense('l1', { email: null, hardwareModel: 'CX7' }, ACTOR);
    const payload = chains.viertl_licenses._calls.find((c) => c.method === 'update')!.args[0] as Record<string, unknown>;
    expect(payload.email).toBeNull();
    expect(payload.hardware_model).toBe('CX7');
  });
});

describe('addNote', () => {
  it('inserts a note event with the actor', async () => {
    chains.viertl_events = makeChain({ data: { id: 'e1', license_id: 'l1', type: 'note', message: 'angerufen', actor_id: 'u1', actor_name: 'Georg', created_at: 't' }, error: null });
    const ev = await addNote('l1', 'angerufen', ACTOR);
    const insert = chains.viertl_events._calls.find((c) => c.method === 'insert');
    const payload = insert!.args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ license_id: 'l1', type: 'note', message: 'angerufen', actor_id: 'u1' });
    expect(ev.type).toBe('note');
  });
});

describe('listEvents', () => {
  it('filters by license and maps rows', async () => {
    chains.viertl_events = makeChain({ data: [{ id: 'e1', license_id: 'l1', type: 'field_change', field: 'status', old_value: 'new', new_value: 'mailed', message: null, actor_id: null, actor_name: null, created_at: 't' }], error: null });
    const events = await listEvents('l1');
    expect(chains.viertl_events._calls.some((c) => c.method === 'eq' && c.args[0] === 'license_id' && c.args[1] === 'l1')).toBe(true);
    expect(events[0]).toMatchObject({ type: 'field_change', field: 'status', oldValue: 'new', newValue: 'mailed' });
  });
});

describe('linkOffer', () => {
  it('sets linked_offer_id + status and logs an offer_attached event', async () => {
    chains.viertl_licenses = makeChain({ data: { id: 'l1', mesonic_kdnr: '1', name: 'X', wartung: 'none', status: 'offer_created', customer_status: 'active', hardware_needed: false, linked_offer_id: 'o1', created_at: '', updated_at: '' }, error: null });
    chains.viertl_events = makeChain({ data: null, error: null });

    await linkOffer('l1', 'o1', ACTOR, 'offer_created');

    const upd = chains.viertl_licenses._calls.find((c) => c.method === 'update')!.args[0] as Record<string, unknown>;
    expect(upd.linked_offer_id).toBe('o1');
    expect(upd.status).toBe('offer_created');
    const evt = chains.viertl_events._calls.find((c) => c.method === 'insert')!.args[0] as Record<string, unknown>;
    expect(evt).toMatchObject({ license_id: 'l1', type: 'offer_attached', message: 'o1', actor_id: 'u1' });
  });
});

describe('unlinkOffer', () => {
  it('clears the link and records a note', async () => {
    chains.viertl_licenses = makeChain({ data: { id: 'l1', mesonic_kdnr: '1', name: 'X', wartung: 'none', status: 'offer_created', customer_status: 'active', hardware_needed: false, linked_offer_id: null, created_at: '', updated_at: '' }, error: null });
    chains.viertl_events = makeChain({ data: null, error: null });
    await unlinkOffer('l1', ACTOR);
    const upd = chains.viertl_licenses._calls.find((c) => c.method === 'update')!.args[0] as Record<string, unknown>;
    expect(upd.linked_offer_id).toBeNull();
    const evt = chains.viertl_events._calls.find((c) => c.method === 'insert')!.args[0] as Record<string, unknown>;
    expect(evt).toMatchObject({ type: 'note' });
  });
});

describe('notifyViertlClosure', () => {
  it('invokes the edge function with licenseId + reason and returns the recipient', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, to: 'viertl@example.at' }, error: null });
    const res = await notifyViertlClosure('l1', 'Konkurs');
    expect(invokeMock).toHaveBeenCalledWith('notify-viertl-closure', { body: { licenseId: 'l1', reason: 'Konkurs' } });
    expect(res).toEqual({ ok: true, to: 'viertl@example.at' });
  });

  it('unwraps the error text from the edge-function response body', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: { body: JSON.stringify({ error: 'Secret VIERTL_NOTIFY_EMAIL fehlt' }) } },
    });
    await expect(notifyViertlClosure('l1', 'x')).rejects.toThrow('Secret VIERTL_NOTIFY_EMAIL fehlt');
  });
});
