import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importWithReload } from './lazyWithReload';

// jsdom's location.reload is non-configurable; stub it so we can assert
// on it without navigating the test runner.
const reloadSpy = vi.fn();

beforeEach(() => {
  reloadSpy.mockClear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: reloadSpy },
  });
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

const chunkError = () =>
  new TypeError(
    'Failed to fetch dynamically imported module: https://x/assets/OfferPdfDocument-abc.js',
  );

describe('importWithReload', () => {
  it('returns the module on success', async () => {
    const mod = { default: 'ok' };
    await expect(importWithReload(() => Promise.resolve(mod))).resolves.toBe(mod);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('reloads once when a chunk 404s after a redeploy', async () => {
    // The returned promise intentionally never resolves (reload is
    // imminent), so we only assert the side effect.
    importWithReload(() => Promise.reject(chunkError()));
    await Promise.resolve();
    await Promise.resolve();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('kitz:chunk-reload')).toBe('1');
  });

  it('does not reload twice in a row (loop guard)', async () => {
    importWithReload(() => Promise.reject(chunkError()));
    await Promise.resolve();
    await Promise.resolve();
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // A second failure while the guard is set must rethrow, not reload.
    await expect(importWithReload(() => Promise.reject(chunkError()))).rejects.toThrow(
      /Failed to fetch/,
    );
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('clears the guard after a later successful load', async () => {
    sessionStorage.setItem('kitz:chunk-reload', '1');
    await importWithReload(() => Promise.resolve({ default: 'ok' }));
    expect(sessionStorage.getItem('kitz:chunk-reload')).toBeNull();
  });

  it('rethrows non-chunk errors without reloading', async () => {
    await expect(
      importWithReload(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
