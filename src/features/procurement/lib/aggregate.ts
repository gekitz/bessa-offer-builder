// Reine Aggregations-Logik für die Einkaufs-Ansicht — bewusst ohne
// Supabase/React, damit sie isoliert testbar ist.
//
// Kernidee: viele "Ich brauche N × Produkt X"-Anfragen werden nach
// Lieferant gruppiert und pro Produkt aufsummiert (5 + 3 + 2 = 10 ×
// Sunmi L3), sodass der Einkäufer eine saubere Sammelbestellung auslösen
// kann statt vieler Einzelbestellungen.

import type { OrderRequest, Supplier } from '../types';

// Eine aufsummierte Produktzeile innerhalb einer Lieferanten-Gruppe.
export interface AggregatedLine {
  key: string;                 // Gruppierungsschlüssel (productId oder custom:<name>)
  productId: string | null;
  productName: string;
  productCode: string | null;
  totalQty: number;            // Summe aller Anfrage-Mengen
  requests: OrderRequest[];    // die zugrunde liegenden Anfragen
}

// Alle offenen Anfragen an EINEN Lieferanten (supplierId === null =
// "noch kein Lieferant zugeordnet", z. B. Freitext-Anfrage).
export interface SupplierGroup {
  supplierId: string | null;
  supplierName: string;
  lines: AggregatedLine[];
  totalQty: number;            // Gesamtstückzahl über alle Zeilen
  requestCount: number;        // Anzahl zugrunde liegender Anfragen
}

// Zeilen mit identischem Produkt zusammenfassen. product_id ist der
// bevorzugte Schlüssel; fehlt er (Freitext), gruppieren wir über den
// normalisierten Namen, damit "Sunmi L3" und "sunmi l3 " zusammenfallen.
function lineKey(r: OrderRequest): string {
  if (r.productId) return `p:${r.productId}`;
  return `n:${r.productName.trim().toLowerCase()}`;
}

/**
 * Offene Anfragen nach Lieferant + Produkt aggregieren.
 *
 * Nur `open`-Anfragen fließen ein (bereits bestellte/erledigte gehören
 * nicht mehr in die Sammel-Ansicht). Gruppen werden nach der `sort`-
 * Reihenfolge der Lieferanten ausgegeben; die "Ohne Lieferant"-Gruppe
 * steht immer am Ende. Innerhalb einer Gruppe sind Zeilen alphabetisch
 * nach Produktname sortiert, für stabile Anzeige/Tests.
 *
 * Der Lieferant einer Anfrage wird bei der Erstellung eingefroren
 * (order_requests.supplier_id). Wird einem Produkt erst NACHTRÄGLICH ein
 * Lieferant zugewiesen, bleiben bereits angelegte Anfragen ohne
 * Lieferant. Damit sie trotzdem korrekt gruppieren, fällt die
 * Gruppierung optional auf den AKTUELLEN Lieferanten des Produkts zurück
 * (`productSuppliersById`), solange die Anfrage selbst noch keinen hat:
 * bevorzugter Lieferant, sonst — wenn eindeutig — der einzige alternative
 * Lieferant. Mehrere Alternativen ohne bevorzugten sind mehrdeutig und
 * bleiben unter "Ohne Lieferant" (der Einkäufer entscheidet).
 */
export interface ProductSuppliers {
  supplierId: string | null;
  altSupplierIds: string[];
}

export function aggregateOpenRequests(
  requests: OrderRequest[],
  suppliers: Supplier[],
  productSuppliersById?: Map<string, ProductSuppliers>,
): SupplierGroup[] {
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  // Fallback-Lieferant aus dem Produkt, aber nur bekannte Lieferanten
  // (sonst landete die Zeile unter einer unbekannten Gruppe): bevorzugter
  // zuerst, sonst der einzige eindeutige alternative Lieferant.
  const productSupplier = (productId: string | null): string | null => {
    if (!productId || !productSuppliersById) return null;
    const entry = productSuppliersById.get(productId);
    if (!entry) return null;
    if (entry.supplierId && supplierById.has(entry.supplierId)) return entry.supplierId;
    const alts = entry.altSupplierIds.filter((id) => supplierById.has(id));
    return alts.length === 1 ? alts[0] : null;
  };

  // supplierId (oder '' für null) → Zeilenschlüssel → AggregatedLine
  const groups = new Map<string, Map<string, AggregatedLine>>();

  for (const r of requests) {
    if (r.status !== 'open') continue;
    const gKey = (r.supplierId ?? productSupplier(r.productId)) ?? '';
    const lines = groups.get(gKey) ?? new Map<string, AggregatedLine>();
    groups.set(gKey, lines);

    const lKey = lineKey(r);
    const existing = lines.get(lKey);
    if (existing) {
      existing.totalQty += r.qty;
      existing.requests.push(r);
      // Code nachtragen, falls die erste Anfrage keinen hatte
      if (!existing.productCode && r.productCode) existing.productCode = r.productCode;
    } else {
      lines.set(lKey, {
        key: lKey,
        productId: r.productId,
        productName: r.productName,
        productCode: r.productCode,
        totalQty: r.qty,
        requests: [r],
      });
    }
  }

  const result: SupplierGroup[] = [];
  for (const [gKey, lineMap] of groups) {
    const supplier = gKey ? supplierById.get(gKey) : undefined;
    const lines = Array.from(lineMap.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName, 'de'),
    );
    result.push({
      supplierId: gKey || null,
      supplierName: supplier?.name ?? (gKey ? 'Unbekannter Lieferant' : 'Ohne Lieferant'),
      lines,
      totalQty: lines.reduce((sum, l) => sum + l.totalQty, 0),
      requestCount: lines.reduce((sum, l) => sum + l.requests.length, 0),
    });
  }

  // Lieferanten nach sort; "Ohne Lieferant" (null) ans Ende.
  return result.sort((a, b) => {
    if (a.supplierId === null) return 1;
    if (b.supplierId === null) return -1;
    const sa = supplierById.get(a.supplierId)?.sort ?? 0;
    const sb = supplierById.get(b.supplierId)?.sort ?? 0;
    if (sa !== sb) return sa - sb;
    return a.supplierName.localeCompare(b.supplierName, 'de');
  });
}

/**
 * Günstigsten Lieferanten aus einem Preisvergleich bestimmen. Zeilen
 * ohne (null/negativen) Preis werden ignoriert. Bei Gleichstand gewinnt
 * der erste Eintrag. Gibt null zurück, wenn kein gültiger Preis vorliegt.
 */
export function cheaperSupplierId(
  quotes: Array<{ supplierId: string; unitPrice: number | null }>,
): string | null {
  let best: { supplierId: string; unitPrice: number } | null = null;
  for (const q of quotes) {
    if (q.unitPrice == null || q.unitPrice < 0) continue;
    if (!best || q.unitPrice < best.unitPrice) {
      best = { supplierId: q.supplierId, unitPrice: q.unitPrice };
    }
  }
  return best?.supplierId ?? null;
}

/**
 * Auswählbare Bezugsquellen für ein Produkt: bevorzugter Lieferant zuerst,
 * dann Alternativen (dedupliziert, nur bekannte + aktive Lieferanten).
 * Steuert den Lieferanten-Umschalter bei Doppelquellen (Sunmi/Epson →
 * Jarltech ODER Pulsa).
 */
export function supplierOptionsFor(
  preferredId: string | null,
  altIds: string[],
  suppliers: Supplier[],
): Supplier[] {
  const byId = new Map(suppliers.map((s) => [s.id, s]));
  const ordered: string[] = [];
  if (preferredId) ordered.push(preferredId);
  for (const id of altIds) if (!ordered.includes(id)) ordered.push(id);
  return ordered
    .map((id) => byId.get(id))
    .filter((s): s is Supplier => !!s && s.active);
}
