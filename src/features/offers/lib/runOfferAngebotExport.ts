// Client-side retry for the accepted-offer → WinLine-Angebot export
// (Belegart 17). The AUTOMATIC path runs server-side on acceptance
// (export-offer-angebot edge function); this browser runner is the manual
// fallback surfaced on the offer detail — e.g. for old offers that had no
// linked Mesonic customer at acceptance and only got one later.
//
// It uses the same client Mesonic path the ticket/loaner exports use
// (fetchCustomerBelege + mesonicImport, both go through the mesonic-proxy
// with the logged-in staff JWT), so no server secret is involved. The pure
// mapping (offerToBelegPositions / buildOfferAngebotImport) is shared with
// the edge function via src/lib/offerAngebot and pinned by tests.

import { fetchCustomerBelege } from '../../viertl/lib/mesonicBelege';
import { mesonicImport, TYPES } from '../../../lib/mesonicApi';
import { updateOfferBeleg, updateOfferData, getCreatorMesonic } from '../../../lib/offerApi';
import { ALL } from '../data/catalogs';
import { hydrateCatalog, isCatalogReady } from '../data/catalogLoader';
import { buildLineSnapshotFrom } from '../../../lib/offerLineSnapshot';
import {
  buildOfferAngebotImport,
  offerBelegKey,
  standortFromId,
  type MesonicStandort,
  type OfferLineSnapshot,
  type OfferBelegSummary,
} from '../../../lib/offerAngebot';

interface OfferForExport {
  id: string;
  creator_id?: string | null;
  mesonic_customer_id?: string | number | null;
  mesonic_beleg_key?: string | null;
  accepted_at?: string | null;
  signed_at?: string | null;
  offer_data?: {
    lineSnapshot?: unknown;
    acceptSnapshot?: Record<string, unknown> | null;
    rabattActive?: boolean;
    cart?: Record<string, unknown> | null;
    cartOrder?: string[] | null;
    customItems?: Record<string, unknown> | null;
  } | null;
}

export interface OfferAngebotExportResult {
  ok: boolean;
  skipped?: boolean;
  reason?: 'already_exported' | 'no_mesonic_customer';
  belegKey?: string;
  laufnummer?: number;
  voucherNumber?: string;
  error?: string;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function runOfferAngebotExport(offer: OfferForExport): Promise<OfferAngebotExportResult> {
  if (offer.mesonic_beleg_key) {
    return { ok: true, skipped: true, reason: 'already_exported', belegKey: offer.mesonic_beleg_key };
  }
  const konto = String(offer.mesonic_customer_id ?? '').trim();
  if (!konto) {
    await updateOfferBeleg(offer.id, { status: 'skipped_no_customer' });
    return { ok: false, skipped: true, reason: 'no_mesonic_customer' };
  }

  const od = offer.offer_data ?? {};
  let lines = (Array.isArray(od.lineSnapshot) ? od.lineSnapshot : []) as OfferLineSnapshot[];
  const snap = (od.acceptSnapshot ?? {}) as Record<string, unknown>;
  const summary: OfferBelegSummary = {
    periodTotal: num(snap.periodTotal),
    monthly: num(snap.monthly),
    once: num(snap.once),
    maxMonths: num(snap.maxMonths) || 12,
    takeBack: num(snap.takeBack),
    rabattActive: !!od.rabattActive,
  };

  // Alt-Angebote (angenommen vor dem lineSnapshot-Feature) tragen keinen
  // eingefrorenen Snapshot und lassen sich nach der Annahme nicht mehr im
  // Builder speichern. Dieser Runner läuft CLIENT-seitig mit Staff-Session, hat
  // also Katalogzugriff — anders als die Edge-Funktion. Wir bauen den Snapshot
  // deshalb hier aus cart + Katalog (+ Custom-Items) neu, damit der Beleg die
  // echten Positionen statt der Summen-Fallbacks bekommt, und schreiben ihn für
  // die Zukunft zurück (best effort, nicht fatal).
  if (lines.length === 0 && od.cart && Object.keys(od.cart).length > 0) {
    if (!isCatalogReady()) await hydrateCatalog();
    const itemMap = { ...ALL, ...(od.customItems ?? {}) } as Parameters<typeof buildLineSnapshotFrom>[2];
    const rebuilt = buildLineSnapshotFrom(
      od.cart as Parameters<typeof buildLineSnapshotFrom>[0],
      od.cartOrder ?? null,
      itemMap,
    );
    if (rebuilt.length > 0) {
      lines = rebuilt;
      try { await updateOfferData(offer.id, { lineSnapshot: rebuilt }); } catch { /* nicht fatal */ }
    }
  }

  // Standort (KL/WO-Pseudoartikel) + Vertreternummer aus dem Ersteller — spiegelt
  // resolveCreatorMesonic in der Edge-Funktion, damit beide Pfade denselben
  // Pseudoartikel wählen. Default Klagenfurt, wenn nicht auflösbar.
  const creatorMesonic = await getCreatorMesonic(offer.creator_id);
  const standort: MesonicStandort = standortFromId(creatorMesonic?.standort_id);
  const vertreternummer = creatorMesonic?.mesonic_rep_id ?? undefined;

  try {
    // Nächste freie Laufnummer des Kontos (Belege sind fortlaufend).
    const { belege } = await fetchCustomerBelege(konto, { max: 1000, delayMs: 150 });
    const max = belege.reduce((m, b) => Math.max(m, Number(b.laufnummer) || 0), 0);
    const laufnummer = max + 1;
    const belegKey = offerBelegKey(konto, laufnummer);
    const datumAngebot = String(offer.accepted_at ?? offer.signed_at ?? '').slice(0, 10) || undefined;

    const xml = buildOfferAngebotImport(
      { kontonummer: konto, laufnummer, datumAngebot, vertreternummer },
      lines,
      summary,
      standort,
    );
    const res = await mesonicImport(TYPES.BELEG, 'WEBAngebot', xml, { actionCode: 1 });
    if (!res.success) {
      await updateOfferBeleg(offer.id, { status: 'failed', error: (res.error ?? 'Import fehlgeschlagen').slice(0, 500) });
      return { ok: false, error: res.error };
    }
    const vn = (res.raw || '').match(/<VoucherNumber>(\d+)<\/VoucherNumber>/);
    const voucherNumber = vn ? vn[1] : String(laufnummer);
    await updateOfferBeleg(offer.id, { laufnummer, key: belegKey, number: voucherNumber, status: 'exported' });
    return { ok: true, belegKey, laufnummer, voucherNumber };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await updateOfferBeleg(offer.id, { status: 'failed', error: error.slice(0, 500) });
    return { ok: false, error };
  }
}
