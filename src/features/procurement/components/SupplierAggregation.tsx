import { useMemo, useState } from 'react';
import { ArrowLeftRight, Loader2, Lock, PackageCheck, RefreshCw, ShoppingCart } from 'lucide-react';
import { cheaperSupplierId, supplierOptionsFor, type AggregatedLine, type SupplierGroup } from '../lib/aggregate';
import type { JarltechItemInfo } from '../lib/jarltechNormalize';
import type { OrderLineDecision, PriceQuote, RequestableProduct, Supplier } from '../types';

const parsePrice = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Einkaufs-Ansicht: offene Anfragen nach Lieferant gruppiert, pro Produkt
// aufsummiert. Bei Doppelquellen (Jarltech/Pulsa) kann der Einkäufer
// Preise vergleichen, auf den günstigeren Lieferanten umstellen und dann
// je Lieferant eine Sammelbestellung auslösen.
//
// Jarltech-Preise/Lagerstände werden per Edge Function abgerufen und als
// Vorschlag in die Preisfelder gespiegelt; eine manuelle Eingabe hat immer
// Vorrang.
export default function SupplierAggregation({
  groups,
  suppliers,
  productsById,
  jarltechSupplierId,
  jarltechInfo,
  loadingJarltech,
  canJarltechOrder,
  ordering,
  reassigning,
  onOrder,
  onReassign,
  onLoadJarltechPrices,
  onPlaceJarltechOrder,
}: {
  groups: SupplierGroup[];
  suppliers: Supplier[];
  productsById: Map<string, RequestableProduct>;
  jarltechSupplierId: string | null;
  jarltechInfo: Map<string, JarltechItemInfo>;
  loadingJarltech: boolean;
  canJarltechOrder: boolean;
  ordering: string | null;   // supplierId, während bestellt wird
  reassigning: string | null; // lineKey, während umgestellt wird
  onOrder: (supplierId: string, lines: OrderLineDecision[], priceQuotes: PriceQuote[]) => void;
  onReassign: (lineKey: string, requestIds: string[], supplierId: string) => void;
  onLoadJarltechPrices: () => void;
  onPlaceJarltechOrder: (group: SupplierGroup) => void;
}) {
  // Manuell eingegebener Preis je (Produktzeile × Lieferant). Überlebt ein
  // Umstellen, weil der Schlüssel an der Produktzeile hängt.
  const [priceByKey, setPriceByKey] = useState<Record<string, string>>({});
  const priceKey = (lineKey: string, supplierId: string) => `${lineKey}::${supplierId}`;
  const setPrice = (lineKey: string, supplierId: string, v: string) =>
    setPriceByKey((p) => ({ ...p, [priceKey(lineKey, supplierId)]: v }));

  // Jarltech-Info einer Produktzeile (Preis/Lager), falls verknüpft + geladen.
  function jarltechFor(line: AggregatedLine): JarltechItemInfo | null {
    const jid = line.productId ? productsById.get(line.productId)?.jarltechItemId : null;
    return jid ? jarltechInfo.get(jid) ?? null : null;
  }

  // Automatisch vorgeschlagener Preis (nur Jarltech). null, wenn kein Abruf.
  function autoPriceFor(line: AggregatedLine, supplierId: string): number | null {
    if (!jarltechSupplierId || supplierId !== jarltechSupplierId) return null;
    return jarltechFor(line)?.unitPrice ?? null;
  }

  // Anzeigewert im Eingabefeld: manuelle Eingabe hat Vorrang, sonst der
  // abgerufene Jarltech-Preis als Vorschlag.
  function displayValue(line: AggregatedLine, supplierId: string): string {
    const manual = priceByKey[priceKey(line.key, supplierId)];
    if (manual !== undefined) return manual;
    const auto = autoPriceFor(line, supplierId);
    return auto != null ? String(auto) : '';
  }

  // Effektiver Preis für Bestellung/Vergleich: manuell (falls gültig) sonst auto.
  function effectivePrice(line: AggregatedLine, supplierId: string): number | null {
    const manual = parsePrice(priceByKey[priceKey(line.key, supplierId)] ?? '');
    if (manual != null) return manual;
    return autoPriceFor(line, supplierId);
  }

  // Kandidaten-Lieferanten einer Produktzeile (bevorzugt + Alternativen).
  function candidatesFor(line: AggregatedLine, currentSupplierId: string | null): Supplier[] {
    const product = line.productId ? productsById.get(line.productId) : undefined;
    let opts = product
      ? supplierOptionsFor(product.supplierId, product.altSupplierIds, suppliers)
      : [];
    if (currentSupplierId && !opts.some((s) => s.id === currentSupplierId)) {
      const cur = suppliers.find((s) => s.id === currentSupplierId);
      if (cur) opts = [cur, ...opts];
    }
    return opts;
  }

  const totalOpen = useMemo(() => groups.reduce((n, g) => n + g.totalQty, 0), [groups]);
  // Gibt es überhaupt Zeilen mit Jarltech-Verknüpfung? Nur dann Abruf-Button.
  const hasJarltechLinks = useMemo(() => {
    if (!jarltechSupplierId) return false;
    return groups.some((g) => g.lines.some((l) => {
      const jid = l.productId ? productsById.get(l.productId)?.jarltechItemId : null;
      return !!jid && candidatesFor(l, g.supplierId).some((s) => s.id === jarltechSupplierId);
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, jarltechSupplierId, productsById, suppliers]);

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <PackageCheck size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">Keine offenen Anfragen — alles bestellt.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-slate-400">{totalOpen} Stück offen über {groups.length} Lieferant(en)</div>
        {hasJarltechLinks && (
          <button
            type="button"
            onClick={onLoadJarltechPrices}
            disabled={loadingJarltech}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {loadingJarltech ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Jarltech-Preise abrufen
          </button>
        )}
      </div>

      {groups.map((group) => {
        const sid = group.supplierId;
        const canOrder = !!sid && ordering === null;
        return (
          <section
            key={sid ?? 'none'}
            data-testid="supplier-group"
            className="rounded-xl border border-slate-200 bg-white overflow-hidden"
          >
            <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-700" style={{ fontSize: 14 }}>{group.supplierName}</h3>
                <span className="text-[11px] text-slate-400">{group.totalQty} Stück · {group.lines.length} Produkt(e)</span>
              </div>
              {sid && sid === jarltechSupplierId ? (
                canJarltechOrder ? (
                  <button
                    type="button"
                    data-testid={`jarltech-order-${sid}`}
                    onClick={() => onPlaceJarltechOrder(group)}
                    disabled={ordering !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-40"
                  >
                    <ShoppingCart size={14} /> Bei Jarltech bestellen
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Nur berechtigte Personen dürfen verbindlich bei Jarltech bestellen."
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 text-xs font-medium cursor-not-allowed"
                  >
                    <Lock size={13} /> Bei Jarltech bestellen
                  </button>
                )
              ) : sid ? (
                <button
                  type="button"
                  data-testid={`order-${sid}`}
                  onClick={() => {
                    const lines: OrderLineDecision[] = group.lines.map((l) => ({
                      requestIds: l.requests.map((r) => r.id),
                      supplierId: sid,
                      unitPrice: effectivePrice(l, sid),
                    }));
                    const quotes: PriceQuote[] = [];
                    for (const l of group.lines) {
                      for (const cand of candidatesFor(l, sid)) {
                        const price = effectivePrice(l, cand.id);
                        if (price != null) {
                          quotes.push({
                            productId: l.productId,
                            productName: l.productName,
                            supplierId: cand.id,
                            unitPrice: price,
                          });
                        }
                      }
                    }
                    onOrder(sid, lines, quotes);
                  }}
                  disabled={!canOrder}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-40"
                >
                  {ordering === sid ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />}
                  Bestellen
                </button>
              ) : (
                <span className="text-[11px] text-slate-400">Lieferant zuordnen ↓</span>
              )}
            </header>

            <ul className="divide-y divide-slate-100">
              {group.lines.map((line) => {
                const candidates = candidatesFor(line, sid);
                const hasChoice = candidates.length > 1;
                const cheapest = hasChoice
                  ? cheaperSupplierId(candidates.map((c) => ({ supplierId: c.id, unitPrice: effectivePrice(line, c.id) })))
                  : null;
                const jt = jarltechFor(line);
                return (
                  <li key={line.key} data-testid="agg-line" className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-800">
                          <span className="text-red-600 font-bold mr-1.5">{line.totalQty}×</span>
                          {line.productCode && <span className="font-mono text-xs text-slate-400 mr-1.5">{line.productCode}</span>}
                          {line.productName}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {line.requests
                            .map((r) => `${r._requesterName ?? 'Unbekannt'} (${r.qty})${r.customerName ? ` – ${r.customerName}` : ''}`)
                            .join(' · ')}
                        </div>
                      </div>

                      {/* Einfacher Fall: eine Bezugsquelle → ein Preisfeld */}
                      {!hasChoice && sid && (
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <PriceField
                            value={displayValue(line, sid)}
                            onChange={(v) => setPrice(line.key, sid, v)}
                          />
                          {sid === jarltechSupplierId && jt && <StockBadge info={jt} />}
                        </div>
                      )}
                    </div>

                    {/* Doppelquelle: Preisvergleich + Umstellen */}
                    {hasChoice && (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-1.5">
                          <ArrowLeftRight size={12} /> Preisvergleich (netto/Stück)
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {candidates.map((c) => {
                            const isCurrent = c.id === sid;
                            const isCheapest = c.id === cheapest;
                            const showStock = c.id === jarltechSupplierId && jt;
                            return (
                              <div
                                key={c.id}
                                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${
                                  isCheapest ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'
                                }`}
                              >
                                <span className="text-[11px] text-slate-600">{c.name}</span>
                                <input
                                  aria-label={`Preis ${c.name}`}
                                  value={displayValue(line, c.id)}
                                  onChange={(e) => setPrice(line.key, c.id, e.target.value)}
                                  inputMode="decimal"
                                  placeholder="—"
                                  className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-red-400"
                                />
                                {showStock && <StockBadge info={jt!} compact />}
                                {isCurrent ? (
                                  <span className="text-[10px] text-slate-400">aktuell</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => onReassign(line.key, line.requests.map((r) => r.id), c.id)}
                                    disabled={reassigning === line.key}
                                    className="text-[10px] text-red-600 hover:underline disabled:opacity-40"
                                  >
                                    {reassigning === line.key ? '…' : 'umstellen'}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {cheapest && cheapest !== sid && (
                          <div className="text-[11px] text-emerald-700 mt-1.5">
                            {suppliers.find((s) => s.id === cheapest)?.name} ist günstiger — umstellen?
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// Lagerstand-Badge aus Jarltech-Daten. Grün wenn genug auf Lager, sonst amber.
function StockBadge({ info, compact = false }: { info: JarltechItemInfo; compact?: boolean }) {
  if (info.stock == null) return null;
  const ok = info.stock > 0;
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap ${
        ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}
      title="Jarltech-Lagerstand"
    >
      {compact ? `${info.stock}` : `Lager: ${info.stock}`}
    </span>
  );
}

function PriceField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <span className="text-[11px] text-slate-400">€/Stk</span>
      <input
        aria-label="Stückpreis netto"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder="—"
        className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-red-400"
      />
    </div>
  );
}
