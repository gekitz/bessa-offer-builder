import { describe, it, expect, beforeEach, vi } from 'vitest';

// The bus holds module-level state, so re-import a fresh copy per test.
async function freshBus() {
  vi.resetModules();
  return import('../reloadPrompt');
}

describe('reloadPrompt bus', () => {
  let bus: typeof import('../reloadPrompt');

  beforeEach(async () => {
    bus = await freshBus();
  });

  it('starts not stale', () => {
    expect(bus.isStaleChunk()).toBe(false);
  });

  it('flips to stale and wakes subscribers on notify', () => {
    const listener = vi.fn();
    bus.subscribeStaleChunk(listener);
    bus.notifyStaleChunk();
    expect(bus.isStaleChunk()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — a second notify does not re-fire subscribers', () => {
    const listener = vi.fn();
    bus.subscribeStaleChunk(listener);
    bus.notifyStaleChunk();
    bus.notifyStaleChunk();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = bus.subscribeStaleChunk(listener);
    unsubscribe();
    bus.notifyStaleChunk();
    expect(listener).not.toHaveBeenCalled();
  });

  it('one broken subscriber does not starve the others', () => {
    const good = vi.fn();
    bus.subscribeStaleChunk(() => {
      throw new Error('boom');
    });
    bus.subscribeStaleChunk(good);
    expect(() => bus.notifyStaleChunk()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});
