import { supabase } from './supabase';
import type { CustomerFolder } from './nextcloudDav';

// ═══════════════════════════════════════════════════════
// Nextcloud API Client
// ═══════════════════════════════════════════════════════
//
// All calls go through the nextcloud-proxy Supabase Edge Function, which holds
// the service-account credentials and does the WebDAV PROPFIND server-side
// (WebDAV can't be reached from the browser — CORS + credentials). The proxy
// returns the customer folders whose name ends with the Kundennummer.

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nextcloud-proxy`;

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
    throw new Error(`Nextcloud-Proxy antwortete nicht als JSON (${res.status}): ${text.substring(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error((data.error as string) || `Nextcloud-Proxy Fehler (${res.status})`);
  }
  return data as T;
}

/**
 * Find the Nextcloud documentation folder(s) for a customer number. Returns the
 * matching folders (usually one, possibly several across base paths), each with
 * a deep link that opens it in the Nextcloud web UI.
 */
export async function findCustomerDocs(customerNumber: string): Promise<CustomerFolder[]> {
  const num = String(customerNumber ?? '').trim();
  if (!num) return [];
  const data = await proxyRequest<{ matches?: CustomerFolder[] }>({
    action: 'findDocs',
    customerNumber: num,
  });
  return data.matches ?? [];
}

/** Health check — verifies the proxy can reach Nextcloud with its credentials. */
export async function ping(): Promise<{ ok: boolean; error?: string }> {
  return proxyRequest({ action: 'ping' });
}
