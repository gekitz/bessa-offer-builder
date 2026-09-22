import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importWithReload } from '../lazyWithReload';
import { notifyStaleChunk } from '../reloadPrompt';

vi.mock('../reloadPrompt', () => ({ notifyStaleChunk: vi.fn() }));

// Resolves to `pending` iff the promise hasn't settled within a tick — used
// to assert importWithReload deliberately hangs after a stale-chunk error.
function settledWithin<T>(p: Promise<T>): Promise<T | 'pending'> {
  return Promise.race([
    p,
    new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 20)),
  ]);
}

describe('importWithReload', () => {
  beforeEach(() => {
    vi.mocked(notifyStaleChunk).mockClear();
  });

  it('returns the module on success without touching the bus', async () => {
    const mod = { default: 'ok' };
    await expect(importWithReload(() => Promise.resolve(mod))).resolves.toBe(mod);
    expect(notifyStaleChunk).not.toHaveBeenCalled();
  });

  it('rethrows a non-chunk error and does not signal a reload', async () => {
    const err = new Error('offer save failed: 500');
    await expect(importWithReload(() => Promise.reject(err))).rejects.toThrow('offer save failed');
    expect(notifyStaleChunk).not.toHaveBeenCalled();
  });

  it('on a stale-chunk error, signals the banner and hangs instead of rejecting', async () => {
    const err = new Error('Failed to fetch dynamically imported module: /assets/OfferPdfDocument-abc123.js');
    const result = await settledWithin(importWithReload(() => Promise.reject(err)));
    expect(result).toBe('pending');
    expect(notifyStaleChunk).toHaveBeenCalledTimes(1);
  });
});
