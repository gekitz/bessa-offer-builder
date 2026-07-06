import { lazy } from 'react';
import type { ComponentType } from 'react';

// Recovering from stale chunks after a redeploy.
//
// Vite gives every code-split chunk a content-hash in its filename
// (e.g. OfferPdfDocument-C23LG-eD.js). When we redeploy, those hashes
// change and the old files are purged from the server. Any tab that
// was already open before the deploy still holds the *old* module
// graph — so the moment it lazy-loads a chunk it never fetched yet
// (the PDF renderer, a route, ...) the browser requests a filename
// that now 404s and throws "Failed to fetch dynamically imported
// module".
//
// The fix: when a dynamic import fails with that specific error,
// force a one-time reload so the tab picks up the fresh index.html
// and the current chunk names. A sessionStorage guard prevents a
// reload loop if the chunk is genuinely broken on the server (not
// just stale).

const RELOAD_GUARD_KEY = 'kitz:chunk-reload';

function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
    msg,
  );
}

// sessionStorage can throw in locked-down privacy modes — never let
// the guard itself break the import path.
function readGuard(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_GUARD_KEY) !== null;
  } catch {
    return false;
  }
}
function setGuard(): void {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
  } catch {
    /* ignore */
  }
}
function clearGuard(): void {
  try {
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Run a dynamic-import factory, reloading the page once if it fails
 * because a hashed chunk went missing after a redeploy. On success the
 * reload guard is reset so a *second* redeploy later in the same
 * long-lived session can still recover.
 */
export async function importWithReload<T>(factory: () => Promise<T>): Promise<T> {
  try {
    const mod = await factory();
    clearGuard();
    return mod;
  } catch (err) {
    if (isChunkLoadError(err) && typeof window !== 'undefined' && !readGuard()) {
      setGuard();
      window.location.reload();
      // Never resolve: the reload is imminent and we don't want the
      // caller to flash an error toast in the meantime.
      return new Promise<T>(() => {});
    }
    throw err;
  }
}

/**
 * Drop-in replacement for React.lazy that recovers from stale chunks.
 */
export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() => importWithReload(factory));
}
