// Mesonic-Beleg-Cache-API — CRM-weit, keyed by Kd.Nr. (nicht an Viertl
// gebunden). Spiegelt supabase/migrations/20260831120000_mesonic_beleg_cache.sql.
//
// Belege sind unveränderlich → wir cachen sie in `mesonic_beleg` und laden
// per `mesonic_beleg_sync.synced_index` nur NEUE Belege nach. Jede Funktion
// (Viertl, künftiges CRM, Angebote) kann denselben Cache nutzen.

import { supabase } from '../../../lib/supabase';
import { fetchCustomerBelege, type BelegPosition } from '../lib/mesonicBelege';

function requireSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  return supabase;
}

export interface CachedBeleg {
  index: number;
  laufnummer: string;
  belegart: string;
  datumFaktura: string | null;
  positions: BelegPosition[];
  fetchedAt: string;
}

export interface BelegeCacheState {
  belege: CachedBeleg[];        // neueste zuerst
  syncedIndex: number;          // höchster gescannter Index
  syncedAt: string | null;
}

function rowToCachedBeleg(r: any): CachedBeleg {
  return {
    index: Number(r.beleg_index),
    laufnummer: r.laufnummer ?? '',
    belegart: r.belegart ?? '',
    datumFaktura: r.datum_faktura ?? null,
    positions: Array.isArray(r.positions) ? r.positions : [],
    fetchedAt: r.fetched_at,
  };
}

// Cache aus der DB lesen (neueste zuerst).
export async function loadCachedBelege(kdnr: string): Promise<BelegeCacheState> {
  const sb = requireSupabase();
  const { data: rows, error: e1 } = await sb
    .from('mesonic_beleg')
    .select('*')
    .eq('mesonic_kdnr', kdnr)
    .order('datum_faktura', { ascending: false, nullsFirst: false })
    .order('beleg_index', { ascending: false });
  if (e1) throw e1;
  const { data: sync, error: e2 } = await sb
    .from('mesonic_beleg_sync')
    .select('*')
    .eq('mesonic_kdnr', kdnr)
    .maybeSingle();
  if (e2) throw e2;
  return {
    belege: (rows ?? []).map(rowToCachedBeleg),
    syncedIndex: sync?.synced_index ?? 0,
    syncedAt: sync?.synced_at ?? null,
  };
}

export interface SyncOpts {
  onProgress?: (n: number, found: number) => void;
  abort?: () => boolean;
  max?: number;
  full?: boolean; // true → ab Index 1 neu scannen (synced_index ignorieren)
}

// Neue Belege aus Mesonic nachladen (ab synced_index + 1) und cachen.
// Gedrosselt + pro Kunde auf Abruf → schonend zum WinLine-Session-Pool.
export async function syncBelege(kdnr: string, opts: SyncOpts = {}): Promise<BelegeCacheState> {
  const sb = requireSupabase();
  const { data: sync } = await sb
    .from('mesonic_beleg_sync').select('*').eq('mesonic_kdnr', kdnr).maybeSingle();
  const prevIndex = sync?.synced_index ?? 0;
  const from = opts.full ? 1 : prevIndex + 1;

  const { belege, scannedTo } = await fetchCustomerBelege(kdnr, {
    startIndex: from,
    max: opts.max ?? 60,
    delayMs: 350,
    onProgress: opts.onProgress,
    abort: opts.abort,
  });

  if (belege.length) {
    const rows = belege
      .filter((b) => b.index != null)
      .map((b) => ({
        mesonic_kdnr: kdnr,
        beleg_index: b.index as number,
        laufnummer: b.laufnummer,
        belegart: b.belegart,
        datum_faktura: b.datumFaktura,
        positions: b.positions,
        fetched_at: new Date().toISOString(),
      }));
    const { error } = await sb.from('mesonic_beleg').upsert(rows, { onConflict: 'mesonic_kdnr,beleg_index' });
    if (error) throw error;
  }

  // Resume-Zeiger nur vorwärts bewegen (bei full-Scan mind. prevIndex halten).
  const newSyncedIndex = Math.max(prevIndex, scannedTo);
  const { error: se } = await sb.from('mesonic_beleg_sync').upsert(
    { mesonic_kdnr: kdnr, synced_index: newSyncedIndex, synced_at: new Date().toISOString() },
    { onConflict: 'mesonic_kdnr' },
  );
  if (se) throw se;

  return loadCachedBelege(kdnr);
}
