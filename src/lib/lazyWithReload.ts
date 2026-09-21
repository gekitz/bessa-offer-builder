import { lazy } from 'react';
import type { ComponentType } from 'react';
import { notifyStaleChunk } from './reloadPrompt';

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
// The fix: when a dynamic import fails with that specific error, ask
// the UI to show a "new version — please reload" banner (ReloadBanner)
// and let the user reload when it suits them. We used to reload the
// tab automatically, but doing so mid-action silently discarded
// whatever the user was in the middle of (e.g. an offer got saved but
// the send was dropped, and the view reset to the list). The chunk
// can't load without a reload, so the import promise never resolves —
// deliberately, so the caller hangs instead of flashing an error toast
// while the banner is up.

function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
    msg,
  );
}

/**
 * Run a dynamic-import factory. If it fails because a hashed chunk went
 * missing after a redeploy, surface the reload banner and hang; any other
 * error propagates to the caller as usual.
 */
export async function importWithReload<T>(factory: () => Promise<T>): Promise<T> {
  try {
    return await factory();
  } catch (err) {
    if (isChunkLoadError(err) && typeof window !== 'undefined') {
      notifyStaleChunk();
      // Never resolve: the chunk can't load without a reload, and we don't
      // want the caller to flash an error while the banner asks the user to.
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
