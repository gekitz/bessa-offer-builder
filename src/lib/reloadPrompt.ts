import { useEffect, useState } from 'react';

// A tiny event bus so the low-level dynamic-import layer (importWithReload)
// can ask the UI to show a "new version — please reload" banner without
// itself depending on React. It flips to stale exactly once — the only cure
// for a missing chunk is a reload, so there's no "un-stale" transition.

let stale = false;
const listeners = new Set<() => void>();

// Signal that a hashed chunk went missing (almost always a redeploy while
// this tab was open). Idempotent: the first call flips the flag and wakes
// every subscriber; later calls are no-ops.
export function notifyStaleChunk(): void {
  if (stale) return;
  stale = true;
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* a broken subscriber must not swallow the signal for the others */
    }
  });
}

export function isStaleChunk(): boolean {
  return stale;
}

export function subscribeStaleChunk(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// React binding: re-renders the caller once a stale chunk is detected.
export function useStaleChunk(): boolean {
  const [value, setValue] = useState(isStaleChunk);
  useEffect(() => subscribeStaleChunk(() => setValue(true)), []);
  return value;
}
