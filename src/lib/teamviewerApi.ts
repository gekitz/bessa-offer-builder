import { supabase } from './supabase';
import type { CustomerDevice } from './teamviewerMatch';

// ═══════════════════════════════════════════════════════
// TeamViewer API Client
// ═══════════════════════════════════════════════════════
//
// All calls go through the teamviewer-proxy Supabase Edge Function, which holds
// the TeamViewer Script token, keeps a cached groups+devices snapshot, and does
// the Kundennummer matching server-side. The token never touches the browser.

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/teamviewer-proxy`;

async function proxyRequest<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  });

  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    const text = await res.text().catch(() => '');
    throw new Error(`TeamViewer-Proxy antwortete nicht als JSON (${res.status}): ${text.substring(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error((data.error as string) || `TeamViewer-Proxy Fehler (${res.status})`);
  }
  return data as T;
}

/**
 * Find the TeamViewer devices for a customer number. Matches the Kundennummer
 * as a suffix on the device alias or its group name (number-only, no fuzzy
 * matching). Each result carries a deep link that launches the local client.
 */
export async function findCustomerDevices(customerNumber: string): Promise<CustomerDevice[]> {
  const num = String(customerNumber ?? '').trim();
  if (!num) return [];
  const data = await proxyRequest<{ devices?: CustomerDevice[] }>({
    action: 'findDevices',
    customerNumber: num,
  });
  return data.devices ?? [];
}

/** Health check — verifies the proxy can reach TeamViewer with its token. */
export async function ping(): Promise<{ ok: boolean; error?: string }> {
  return proxyRequest({ action: 'ping' });
}
