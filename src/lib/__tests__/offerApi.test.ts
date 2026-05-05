import { describe, it, expect, vi, beforeEach } from 'vitest';

// Builder mock: every chain method returns the same builder, awaiting it
// resolves to the configured response. Mirrors how supabase-js postgrest
// queries behave (the builder is itself a thenable).
function makeChain(response: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'insert', 'update', 'delete', 'eq', 'order'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve(response));
  builder.then = (resolve: (v: unknown) => void) => Promise.resolve(response).then(resolve);
  return builder as { [key: string]: ReturnType<typeof vi.fn> } & PromiseLike<unknown>;
}

type AnyFn = (...args: unknown[]) => unknown;

const fromMock = vi.fn<AnyFn>();
const invokeMock = vi.fn<AnyFn>();
const uploadMock = vi.fn<AnyFn>();
const getPublicUrlMock = vi.fn<AnyFn>();
const storageFromMock = vi.fn<AnyFn>(() => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock }));

vi.mock('../supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    storage: { from: (...args: unknown[]) => storageFromMock(...args) },
  },
}));

// Import AFTER vi.mock so the mock is wired in.
import {
  saveOffer,
  listOffers,
  getOffer,
  deleteOffer,
  updateOfferStage,
  sendOffer,
  setShareCode,
  getOfferByShareCode,
  signOffer,
  getSignedPdfUrl,
  getEmailEvents,
  listActivities,
  logActivity,
  deleteActivity,
} from '../offerApi';

beforeEach(() => {
  fromMock.mockReset();
  invokeMock.mockReset();
  uploadMock.mockReset();
  getPublicUrlMock.mockReset();
  storageFromMock.mockClear();
});

const baseOfferArgs = {
  id: undefined as string | undefined,
  customer: { name: 'Max', company: 'ACME', email: 'm@a.at', phone: '+43 1', address: '' },
  creator: 'gk',
  creatorName: 'Georg Kitz',
  cart: { kassa: { qty: 1, tier: '12mo' } },
  globalTier: '12mo',
  notes: '',
  raten: false,
  finanzOpen: false,
  totalMonthly: 30,
  totalOnce: 0,
  totalPeriod: 360,
  mandatsRef: '',
  customItems: {},
  cartOrder: [],
  serviceStartDate: null,
};

describe('saveOffer', () => {
  it('inserts a new row when no id is given', async () => {
    const chain = makeChain({ data: { id: 'new-uuid' }, error: null });
    fromMock.mockReturnValue(chain);

    const result = await saveOffer(baseOfferArgs);

    expect(fromMock).toHaveBeenCalledWith('offers');
    expect(chain.insert).toHaveBeenCalledTimes(1);
    expect(chain.update).not.toHaveBeenCalled();
    const inserted = chain.insert.mock.calls[0][0];
    expect(inserted.creator_id).toBe('gk');
    expect(inserted.customer_company).toBe('ACME');
    expect(inserted.total_monthly).toBe(30);
    expect(inserted.offer_data.cart).toEqual({ kassa: { qty: 1, tier: '12mo' } });
    expect(result).toEqual({ id: 'new-uuid' });
  });

  it('updates an existing row when id is given', async () => {
    const chain = makeChain({ data: { id: 'existing-uuid' }, error: null });
    fromMock.mockReturnValue(chain);

    await saveOffer({ ...baseOfferArgs, id: 'existing-uuid' });

    expect(chain.update).toHaveBeenCalledTimes(1);
    expect(chain.eq).toHaveBeenCalledWith('id', 'existing-uuid');
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('throws when supabase returns an error', async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: new Error('rls denied') }));
    await expect(saveOffer(baseOfferArgs)).rejects.toThrow('rls denied');
  });
});

describe('listOffers', () => {
  it('queries the offers table ordered by updated_at desc', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const chain = makeChain({ data: rows, error: null });
    fromMock.mockReturnValue(chain);

    const result = await listOffers();

    expect(fromMock).toHaveBeenCalledWith('offers');
    expect(chain.order).toHaveBeenCalledWith('updated_at', { ascending: false });
    expect(result).toEqual(rows);
  });
});

describe('getOffer', () => {
  it('selects the offer by id', async () => {
    const chain = makeChain({ data: { id: 'abc' }, error: null });
    fromMock.mockReturnValue(chain);

    const result = await getOffer('abc');

    expect(chain.eq).toHaveBeenCalledWith('id', 'abc');
    expect(chain.single).toHaveBeenCalled();
    expect(result).toEqual({ id: 'abc' });
  });
});

describe('deleteOffer', () => {
  it('deletes by id', async () => {
    const chain = makeChain({ data: null, error: null });
    fromMock.mockReturnValue(chain);

    await deleteOffer('abc');

    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', 'abc');
  });
});

describe('updateOfferStage', () => {
  it('updates only the stage column', async () => {
    const chain = makeChain({ data: { id: 'a', stage: 'won' }, error: null });
    fromMock.mockReturnValue(chain);

    const result = await updateOfferStage('a', 'won');

    expect(chain.update).toHaveBeenCalledWith({ stage: 'won' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'a');
    expect(result).toEqual({ id: 'a', stage: 'won' });
  });
});

describe('sendOffer', () => {
  it('invokes the send-offer edge function with the pdf payload', async () => {
    invokeMock.mockResolvedValue({ data: { sent: true }, error: null });

    const result = await sendOffer('off-1', 'BASE64', 'angebot.pdf');

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [name, opts] = invokeMock.mock.calls[0] as [string, { body: unknown; headers: { Authorization: string } }];
    expect(name).toBe('send-offer');
    expect(opts.body).toEqual({
      offerId: 'off-1',
      pdfBase64: 'BASE64',
      pdfFilename: 'angebot.pdf',
    });
    expect(opts.headers.Authorization).toMatch(/^Bearer /);
    expect(result).toEqual({ sent: true });
  });

  it('passes through emailText fields and includeAcceptLink option', async () => {
    invokeMock.mockResolvedValue({ data: {}, error: null });
    const emailText = { subject: 'Hi', greeting: 'Sehr', body: 'Body', closing: 'LG' };

    await sendOffer('off-1', 'X', 'a.pdf', emailText, { includeAcceptLink: true });

    const opts = invokeMock.mock.calls[0][1] as { body: Record<string, unknown> };
    expect(opts.body.emailSubject).toBe('Hi');
    expect(opts.body.emailGreeting).toBe('Sehr');
    expect(opts.body.emailBody).toBe('Body');
    expect(opts.body.emailClosing).toBe('LG');
    expect(opts.body.includeAcceptLink).toBe(true);
  });
});

describe('setShareCode / getOfferByShareCode', () => {
  it('updates share_code by id', async () => {
    const chain = makeChain({ data: { id: 'a', share_code: 'XYZ' }, error: null });
    fromMock.mockReturnValue(chain);

    await setShareCode('a', 'XYZ');

    expect(chain.update).toHaveBeenCalledWith({ share_code: 'XYZ' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'a');
  });

  it('looks up an offer by share_code', async () => {
    const chain = makeChain({ data: { id: 'a' }, error: null });
    fromMock.mockReturnValue(chain);

    await getOfferByShareCode('XYZ');

    expect(chain.eq).toHaveBeenCalledWith('share_code', 'XYZ');
    expect(chain.single).toHaveBeenCalled();
  });
});

describe('signOffer', () => {
  it('uploads the signed pdf and updates the offer row', async () => {
    uploadMock.mockResolvedValue({ error: null });
    const chain = makeChain({ data: { id: 'off-1', stage: 'closed' }, error: null });
    fromMock.mockReturnValue(chain);

    const blob = new Blob(['pdf-bytes'], { type: 'application/pdf' });
    const result = await signOffer('off-1', { dataUrl: 'data:image/png;base64,X' }, blob, 'angebot-signed.pdf');

    expect(storageFromMock).toHaveBeenCalledWith('offer-pdfs');
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [path, file, opts] = uploadMock.mock.calls[0];
    expect(path).toBe('offers/off-1/angebot-signed.pdf');
    expect(file).toBe(blob);
    expect(opts).toEqual({ contentType: 'application/pdf', upsert: true });

    const updateArg = chain.update.mock.calls[0][0];
    expect(updateArg.stage).toBe('closed');
    expect(updateArg.signed_pdf_path).toBe('offers/off-1/angebot-signed.pdf');
    expect(updateArg.signature_data).toEqual({ dataUrl: 'data:image/png;base64,X' });
    expect(typeof updateArg.signed_at).toBe('string');
    expect(result).toEqual({ id: 'off-1', stage: 'closed' });
  });

  it('throws if the upload fails (does not touch the offer row)', async () => {
    uploadMock.mockResolvedValue({ error: new Error('upload denied') });

    await expect(
      signOffer('off-1', {}, new Blob(['x']), 'a.pdf'),
    ).rejects.toThrow('upload denied');
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('getSignedPdfUrl', () => {
  it('returns the public URL string', () => {
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://files.example/x.pdf' } });
    expect(getSignedPdfUrl('offers/x/a.pdf')).toBe('https://files.example/x.pdf');
  });

  it('returns null when supabase yields no url', () => {
    getPublicUrlMock.mockReturnValue({ data: null });
    expect(getSignedPdfUrl('offers/x/a.pdf')).toBeNull();
  });
});

describe('getEmailEvents', () => {
  it('queries email_events for the offer in chronological order', async () => {
    const events = [{ id: 1 }, { id: 2 }];
    const chain = makeChain({ data: events, error: null });
    fromMock.mockReturnValue(chain);

    const result = await getEmailEvents('off-1');

    expect(fromMock).toHaveBeenCalledWith('email_events');
    expect(chain.eq).toHaveBeenCalledWith('offer_id', 'off-1');
    expect(chain.order).toHaveBeenCalledWith('occurred_at', { ascending: true });
    expect(result).toEqual(events);
  });
});

describe('listActivities', () => {
  it('queries offer_activities for the offer, newest first', async () => {
    const acts = [{ id: 'a' }, { id: 'b' }];
    const chain = makeChain({ data: acts, error: null });
    fromMock.mockReturnValue(chain);

    const result = await listActivities('off-1');

    expect(fromMock).toHaveBeenCalledWith('offer_activities');
    expect(chain.eq).toHaveBeenCalledWith('offer_id', 'off-1');
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result).toEqual(acts);
  });
});

describe('logActivity', () => {
  it('inserts an activity row and returns the created record', async () => {
    const created = { id: 'act-1', offer_id: 'off-1' };
    const chain = makeChain({ data: created, error: null });
    fromMock.mockReturnValue(chain);

    const result = await logActivity('off-1', {
      kind: 'call',
      outcome: 'no_answer',
      note: 'tried mobile',
      nextFollowupAt: '2026-05-08T08:00:00.000Z',
      createdById: 'gk',
      createdByName: 'Georg',
    });

    expect(fromMock).toHaveBeenCalledWith('offer_activities');
    expect(chain.insert).toHaveBeenCalledTimes(1);
    const inserted = chain.insert.mock.calls[0][0];
    expect(inserted).toEqual({
      offer_id: 'off-1',
      kind: 'call',
      outcome: 'no_answer',
      note: 'tried mobile',
      next_followup_at: '2026-05-08T08:00:00.000Z',
      created_by_id: 'gk',
      created_by_name: 'Georg',
    });
    expect(result).toEqual(created);
  });

  it('coerces empty optional fields to null so the DB sees explicit NULLs', async () => {
    const chain = makeChain({ data: { id: 'x' }, error: null });
    fromMock.mockReturnValue(chain);

    await logActivity('off-1', {
      kind: 'note',
      outcome: '',
      note: '',
      nextFollowupAt: '',
      createdById: '',
      createdByName: '',
    });

    const inserted = chain.insert.mock.calls[0][0];
    expect(inserted.outcome).toBeNull();
    expect(inserted.note).toBeNull();
    expect(inserted.next_followup_at).toBeNull();
    expect(inserted.created_by_id).toBeNull();
    expect(inserted.created_by_name).toBeNull();
    expect(inserted.kind).toBe('note');
  });

  it('throws when supabase returns an error', async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: new Error('rls denied') }));
    await expect(logActivity('off-1', {
      kind: 'call', outcome: undefined, note: undefined,
      nextFollowupAt: undefined, createdById: undefined, createdByName: undefined,
    })).rejects.toThrow('rls denied');
  });
});

describe('deleteActivity', () => {
  it('deletes the activity by id', async () => {
    const chain = makeChain({ data: null, error: null });
    fromMock.mockReturnValue(chain);

    await deleteActivity('act-1');

    expect(fromMock).toHaveBeenCalledWith('offer_activities');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', 'act-1');
  });
});
