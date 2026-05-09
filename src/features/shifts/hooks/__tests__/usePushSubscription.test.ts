import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const registerMock = vi.fn();
const unregisterMock = vi.fn();
vi.mock('../../api/pushApi', () => ({
  registerPushSubscription: (...args: unknown[]) => registerMock(...args),
  unregisterPushSubscription: (endpoint: string) => unregisterMock(endpoint),
  hasPushSubscription: vi.fn().mockResolvedValue(false),
}));

import { usePushSubscription } from '../usePushSubscription';

// ── Test scaffolding ────────────────────────────────────────────────
//
// jsdom doesn't ship navigator.serviceWorker, window.PushManager, or
// the standalone-display media query — we stub the bits we need on
// each test. Passing `removePushManager: true` lets us simulate
// browsers without push support (Firefox private mode, ancient
// Safari before 16.4 outside PWA).

interface Env {
  ios?: boolean;
  standalone?: boolean;
  removePushManager?: boolean;
  removeServiceWorker?: boolean;
  removeNotification?: boolean;
  permission?: NotificationPermission;
  hasSubscription?: boolean;
}

const realNavigator = global.navigator;
const realPushManager = (global as { PushManager?: unknown }).PushManager;
const realNotification = (global as { Notification?: unknown }).Notification;
const realMatchMedia = window.matchMedia;

function setupBrowser(env: Env) {
  // userAgent + iOS standalone flag
  Object.defineProperty(global.navigator, 'userAgent', {
    configurable: true,
    value: env.ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari' : 'Mozilla/5.0 (X11; Linux) Chrome',
  });
  if (env.ios) {
    (global.navigator as unknown as { standalone?: boolean }).standalone = !!env.standalone;
  } else {
    delete (global.navigator as unknown as { standalone?: boolean }).standalone;
  }

  // matchMedia: only '(display-mode: standalone)' is checked.
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes('standalone') ? !!env.standalone : false,
    media: q,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;

  // PushManager — presence check only.
  if (env.removePushManager) {
    delete (global as { PushManager?: unknown }).PushManager;
  } else {
    (global as { PushManager?: unknown }).PushManager = class {};
  }

  // Notification — both global and on window for the in-component
  // permission check + requestPermission.
  if (env.removeNotification) {
    delete (global as { Notification?: unknown }).Notification;
  } else {
    const NotificationStub = function() {} as unknown as { permission: NotificationPermission; requestPermission: () => Promise<NotificationPermission> };
    NotificationStub.permission = env.permission ?? 'default';
    NotificationStub.requestPermission = vi.fn().mockResolvedValue(env.permission ?? 'default');
    (global as { Notification?: unknown }).Notification = NotificationStub;
  }

  // navigator.serviceWorker — minimal stub. `ready` resolves to a
  // registration with a pushManager that returns null or a fake
  // subscription depending on env.hasSubscription.
  if (env.removeServiceWorker) {
    delete (global.navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
  } else {
    const fakeSubscription = env.hasSubscription
      ? {
          endpoint: 'https://push.example/sub-1',
          toJSON: () => ({ endpoint: 'https://push.example/sub-1', keys: { p256dh: 'P256', auth: 'AUTH' } }),
          unsubscribe: vi.fn().mockResolvedValue(true),
          getKey: () => null,
        }
      : null;
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(fakeSubscription),
        subscribe: vi.fn(),
      },
    };
    (global.navigator as unknown as { serviceWorker?: unknown }).serviceWorker = {
      ready: Promise.resolve(registration),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  }
}

afterEach(() => {
  Object.defineProperty(global, 'navigator', { configurable: true, value: realNavigator });
  if (realPushManager === undefined) delete (global as { PushManager?: unknown }).PushManager;
  else (global as { PushManager?: unknown }).PushManager = realPushManager;
  if (realNotification === undefined) delete (global as { Notification?: unknown }).Notification;
  else (global as { Notification?: unknown }).Notification = realNotification;
  window.matchMedia = realMatchMedia;
  delete (global.navigator as unknown as { standalone?: boolean }).standalone;
  delete (global.navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
});

beforeEach(() => {
  registerMock.mockReset();
  unregisterMock.mockReset();
});

describe('usePushSubscription', () => {
  it("returns 'idle' when no employee is logged in", async () => {
    setupBrowser({ permission: 'default' });
    const { result } = renderHook(() => usePushSubscription(null));
    await waitFor(() => expect(result.current.status).toBe('idle'));
  });

  it("returns 'unsupported' on a non-iOS browser without PushManager", async () => {
    setupBrowser({ removePushManager: true, removeNotification: true });
    const { result } = renderHook(() => usePushSubscription('emp-1'));
    await waitFor(() => expect(result.current.status).toBe('unsupported'));
  });

  it("returns 'ios-needs-pwa' on iOS Safari without standalone install", async () => {
    setupBrowser({ ios: true, standalone: false, removePushManager: true });
    const { result } = renderHook(() => usePushSubscription('emp-1'));
    await waitFor(() => expect(result.current.status).toBe('ios-needs-pwa'));
  });

  it("returns 'denied' when Notification.permission is 'denied'", async () => {
    setupBrowser({ permission: 'denied' });
    const { result } = renderHook(() => usePushSubscription('emp-1'));
    await waitFor(() => expect(result.current.status).toBe('denied'));
  });

  it("returns 'prompt' when permission is 'default' and platform supports push", async () => {
    setupBrowser({ permission: 'default' });
    const { result } = renderHook(() => usePushSubscription('emp-1'));
    await waitFor(() => expect(result.current.status).toBe('prompt'));
  });

  it("returns 'subscribed' when permission granted and a subscription exists", async () => {
    setupBrowser({ permission: 'granted', hasSubscription: true });
    const { result } = renderHook(() => usePushSubscription('emp-1'));
    await waitFor(() => expect(result.current.status).toBe('subscribed'));
  });

  it("returns 'permission-granted-no-sub' when permission granted but no subscription yet", async () => {
    setupBrowser({ permission: 'granted', hasSubscription: false });
    const { result } = renderHook(() => usePushSubscription('emp-1'));
    await waitFor(() => expect(result.current.status).toBe('permission-granted-no-sub'));
  });

  it('revoke() unsubscribes the SW subscription and unregisters server-side', async () => {
    setupBrowser({ permission: 'granted', hasSubscription: true });
    unregisterMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePushSubscription('emp-1'));
    await waitFor(() => expect(result.current.status).toBe('subscribed'));

    await act(async () => {
      await result.current.revoke();
    });

    expect(unregisterMock).toHaveBeenCalledWith('https://push.example/sub-1');
    // After revoke, status should drop to permission-granted-no-sub
    // (permission stays 'granted' on the OS) or 'prompt' depending
    // on whether the stub still reports granted. Our Notification
    // stub keeps `permission='granted'`, so we expect the former.
    expect(result.current.status).toBe('permission-granted-no-sub');
  });
});
