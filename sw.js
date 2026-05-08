// KITZ Workspace service worker.
//
// Scope: web push only. We deliberately do NOT cache app assets here
// — the SPA already updates fresh on every visit and adding caching
// without a versioning story is a recipe for "users stuck on stale
// build" tickets.
//
// Three handlers:
//   * push                    — show the notification.
//   * notificationclick       — focus existing tab or open one,
//                               navigating to the supplied URL.
//   * pushsubscriptionchange  — best-effort re-subscribe; the next
//                               time the user opens the app the
//                               client-side hook will reconcile.

self.addEventListener('install', () => {
  // Activate as soon as the install finishes — we don't have any
  // pre-cache step that needs to settle.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  // Default payload if the push arrives without a body (rare —
  // happens when the sender uses a "wakeup" push, which Apple does
  // for some test paths). Without a body the user still gets a
  // generic notification rather than a silent ping.
  let payload = {
    title: 'KITZ',
    body: 'Du hast eine neue Benachrichtigung',
    url: '/',
    tag: 'kitz-default',
  };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      const text = event.data.text();
      if (text) payload.body = text;
    }
  }

  const { title, body, url, tag, icon, badge } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: icon || '/favicon.svg',
      badge: badge || '/favicon.svg',
      // Default URL is stashed on the notification for the click
      // handler to retrieve via event.notification.data.
      data: { url },
      // iOS supports requireInteraction = false (auto-dismiss).
      // Leave it default so the user can flick away the banner.
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Reuse an existing tab if the same origin is already open —
    // less disruptive than always opening a new tab. We then post
    // a message so the SPA can navigate without a full reload.
    for (const client of allClients) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          client.postMessage({ type: 'kitz:navigate', url: targetUrl });
          return client.focus();
        }
      } catch {
        // Ignore URL parse failures.
      }
    }
    // No existing tab — open a new one.
    return self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // Best-effort: try to re-subscribe with the same VAPID public key.
  // The new endpoint won't reach the server until the user opens
  // the app again, where the client-side hook reconciles.
  event.waitUntil((async () => {
    try {
      const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint;
      const newSub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: event.oldSubscription
          ? event.oldSubscription.options.applicationServerKey
          : null,
      });
      // Stash both endpoints in IndexedDB or postMessage to all
      // clients so the SPA can replace the old endpoint server-
      // side. We use postMessage; the old endpoint may already be
      // gone from the DB if the previous browser sent
      // unsubscribe — that's fine, the server-side just upserts.
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of allClients) {
        c.postMessage({
          type: 'kitz:subscription-rotated',
          oldEndpoint,
          subscription: newSub.toJSON(),
        });
      }
    } catch (err) {
      console.warn('[sw] pushsubscriptionchange re-subscribe failed:', err);
    }
  })());
});
