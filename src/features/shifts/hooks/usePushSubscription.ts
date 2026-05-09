import { useCallback, useEffect, useState } from 'react';
import {
  registerPushSubscription,
  unregisterPushSubscription,
} from '../api/pushApi';

// Web Push subscription state machine for a logged-in employee.
// Returned status discriminates how the opt-in UI should behave:
//
//   'unsupported'    — browser has no push/notification API at all
//                      (private browsing, ancient builds).
//   'ios-needs-pwa'  — iOS Safari without home-screen install. The
//                      Notification API exists but permission
//                      requests silently fail unless the user has
//                      added the app to home screen first.
//   'denied'         — user (or a previous session) denied. Cannot
//                      ask again from JS — they have to flip it in
//                      browser settings.
//   'prompt'         — permission is 'default'; safe to show the
//                      opt-in CTA.
//   'subscribed'     — there's a live PushSubscription registered
//                      for this device and the server has it.
//   'permission-granted-no-sub' — permission is 'granted' but
//                      pushManager has no subscription yet (rare:
//                      install state was reset). Calling request()
//                      will subscribe without a permission prompt.

export type PushStatus =
  | 'idle'
  | 'unsupported'
  | 'ios-needs-pwa'
  | 'denied'
  | 'prompt'
  | 'subscribed'
  | 'permission-granted-no-sub';

interface UsePushSubscriptionResult {
  status: PushStatus;
  // Trigger the permission prompt + subscription. Idempotent.
  request: () => Promise<void>;
  // Tear down the subscription on this device. Idempotent.
  revoke: () => Promise<void>;
  // Last error from request/revoke, surfaced for UI inline display.
  error: string | null;
  // True while a request/revoke call is in flight.
  busy: boolean;
}

const VAPID_PUBLIC_KEY = (import.meta as { env?: Record<string, string> }).env?.VITE_VAPID_PUBLIC_KEY ?? '';

// urlBase64 → Uint8Array per the Push API spec; pushManager.subscribe
// requires the applicationServerKey in this exact form.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

function b64FromArrayBuffer(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function isiOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS 13+ identifies as Mac; the touch check disambiguates.
  const ua = navigator.userAgent || '';
  const iOSish = /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document);
  return iOSish;
}

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const m = window.matchMedia?.('(display-mode: standalone)');
  // iOS-specific legacy flag.
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return (m?.matches ?? false) || iosStandalone;
}

function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export function usePushSubscription(employeeId: string | null | undefined): UsePushSubscriptionResult {
  const [status, setStatus] = useState<PushStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reconcile = useCallback(async () => {
    if (!employeeId) {
      setStatus('idle');
      return;
    }
    if (!isPushSupported()) {
      // iOS without PWA install: Notification API is missing entirely
      // unless installed; that lands here. But "iOS in browser, not
      // installed" is the actionable state to surface to the user.
      if (isiOS() && !isStandalonePwa()) {
        setStatus('ios-needs-pwa');
        return;
      }
      setStatus('unsupported');
      return;
    }
    if (isiOS() && !isStandalonePwa()) {
      setStatus('ios-needs-pwa');
      return;
    }

    const perm = Notification.permission;
    if (perm === 'denied') {
      setStatus('denied');
      return;
    }
    if (perm === 'default') {
      setStatus('prompt');
      return;
    }

    // Permission granted: check whether a subscription exists in
    // the SW. We don't ping the server here — the client truth is
    // authoritative, and the upsert on register handles drift.
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? 'subscribed' : 'permission-granted-no-sub');
    } catch {
      setStatus('permission-granted-no-sub');
    }
  }, [employeeId]);

  useEffect(() => {
    void reconcile();
  }, [reconcile]);

  // Listen for endpoint rotation messages from the SW and re-register
  // server-side. Best-effort — never throws into the UI.
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !employeeId) return;
    function handler(e: MessageEvent) {
      if (!e.data || e.data.type !== 'kitz:subscription-rotated') return;
      const { subscription, oldEndpoint } = e.data;
      (async () => {
        try {
          if (oldEndpoint) {
            await unregisterPushSubscription(oldEndpoint).catch(() => {});
          }
          if (subscription?.endpoint && subscription?.keys) {
            await registerPushSubscription({
              employeeId: employeeId!,
              endpoint: subscription.endpoint,
              p256dh: subscription.keys.p256dh,
              authToken: subscription.keys.auth,
              userAgent: navigator.userAgent,
            });
          }
        } catch (err) {
          console.warn('subscription-rotated reconcile failed:', err);
        }
      })();
    }
    navigator.serviceWorker.addEventListener('message', handler);
    return () => {
      // Defensive: jsdom-based tests may tear down navigator.serviceWorker
      // before this cleanup fires. In real browsers this branch is dead.
      if ('serviceWorker' in navigator && navigator.serviceWorker?.removeEventListener) {
        navigator.serviceWorker.removeEventListener('message', handler);
      }
    };
  }, [employeeId]);

  const request = useCallback(async () => {
    if (!employeeId) return;
    setError(null);
    setBusy(true);
    try {
      if (!isPushSupported()) {
        if (isiOS() && !isStandalonePwa()) {
          throw new Error('iOS: zuerst zum Home-Bildschirm hinzufügen, dann erneut versuchen.');
        }
        throw new Error('Push wird in diesem Browser nicht unterstützt.');
      }
      if (!VAPID_PUBLIC_KEY) {
        throw new Error('VAPID Public Key fehlt in der Konfiguration.');
      }
      // Permission prompt. Once denied here, we cannot ask again
      // from JS — the user has to fix it in browser settings.
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'prompt');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      // Reuse an existing subscription if present (e.g. permission
      // was granted in a previous session; same browser, same key).
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          // Cast: TS lib wants BufferSource; the Uint8Array view we
          // return is a valid BufferSource at runtime.
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
        });
      }
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const p256dh = json.keys?.p256dh ?? b64FromArrayBuffer(sub.getKey('p256dh') as unknown as ArrayBuffer);
      const auth   = json.keys?.auth   ?? b64FromArrayBuffer(sub.getKey('auth')   as unknown as ArrayBuffer);
      if (!sub.endpoint || !p256dh || !auth) {
        throw new Error('Subscription unvollständig — bitte erneut versuchen.');
      }
      await registerPushSubscription({
        employeeId,
        endpoint: sub.endpoint,
        p256dh,
        authToken: auth,
        userAgent: navigator.userAgent,
      });
      setStatus('subscribed');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [employeeId]);

  const revoke = useCallback(async () => {
    if (!employeeId) return;
    setError(null);
    setBusy(true);
    try {
      if (!('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unregisterPushSubscription(sub.endpoint).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setStatus(Notification.permission === 'granted' ? 'permission-granted-no-sub' : 'prompt');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [employeeId]);

  return { status, request, revoke, error, busy };
}
