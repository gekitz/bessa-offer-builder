import { useEffect } from 'react';
import { AlarmClock, AlertCircle, Building2, FileText, Loader2, Mail, MailOpen, MapPin, Phone, Send, User, X, XCircle } from 'lucide-react';

import { ALL } from '../../data/catalogs';
import { TIER_SHORT } from '../../../../data/tiers';
import { isMonthly, price, discountedPrice, hasDiscount, type Item, type ItemMode } from '../../../../lib/pricing';
import { computeTotals } from '../../../../lib/totals';
import { fmt } from '../../../../lib/format';
import { lostReasonLabel } from '../../data/lostReasons';
import { StatusBadge, StageBadge, STATUS_CONFIG, ActivityKindBadge, ActivityOutcomeBadge } from '../Badges';

// Read-only deep view of an offer. Opens from the action-bar "Info"
// button on the offer-list expanded panel; everything destructive
// or mutating still lives on the row / panel itself. We deliberately
// don't add an "Edit" path here — that's what Laden does, with the
// full builder.

interface CartEntry {
  qty?: number;
  discountQty?: number;
  tier?: string;
  mode?: ItemMode;
}

interface OfferDataShape {
  cart?: Record<string, CartEntry>;
  cartOrder?: string[];
  customItems?: Record<string, Partial<Item> & { id: string; name?: string; price?: number; t?: Item['t']; servicePercent?: number }>;
  notes?: string;
  raten?: number;
  finanzOpen?: boolean;
  globalTier?: string;
  mandatsRef?: string;
  address?: string;
}

export interface OfferDetailsOffer {
  id: string;
  status?: string | null;
  stage?: string | null;
  customer_name?: string | null;
  customer_company?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  mesonic_customer_id?: string | number | null;
  creator_name?: string | null;
  creator_email?: string | null;
  briefing?: string | null;
  total_monthly?: number | string | null;
  total_once?: number | string | null;
  total_period?: number | string | null;
  sent_at?: string | null;
  opened_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  lost_reason?: string | null;
  lost_reason_note?: string | null;
  lost_at?: string | null;
  service_start_date?: string | null;
  offer_data?: OfferDataShape | null;
}

export interface OfferActivity {
  id: string;
  kind: string;
  outcome?: string | null;
  note?: string | null;
  next_followup_at?: string | null;
  created_at: string;
  created_by_name?: string | null;
}

export interface OfferEmailEvent {
  id?: string;
  event_type: string;
  occurred_at: string;
  metadata?: Record<string, unknown> | null;
}

export interface OfferDetailsModalProps {
  // null while parent is fetching — modal renders a small loading
  // state. Parent calls getOffer() to load the full row (the list
  // query doesn't include offer_data).
  offer: OfferDetailsOffer | null;
  // Activities (Anrufe / E-Mails / Notizen / Meetings) and the raw
  // Resend webhook events. Both default to undefined which renders
  // a "wird geladen" line; pass [] to render the empty state.
  activities?: OfferActivity[];
  events?: OfferEmailEvent[];
  activitiesLoading?: boolean;
  eventsLoading?: boolean;
  loading?: boolean;
  onClose: () => void;
}

interface ResolvedItem {
  id: string;
  name: string;
  info?: string;
  qty: number;
  discountQty: number;
  tier: string;
  mode: ItemMode;
  isMonthly: boolean;
  unitPrice: number;
  discountUnitPrice: number;
  hasDiscountFlag: boolean;
  lineTotal: number;
}

function resolveItems(data: OfferDataShape | null | undefined): ResolvedItem[] {
  if (!data?.cart) return [];
  // Merge custom items into the catalog lookup so they resolve too.
  const catalog: Record<string, Item> = { ...(ALL as Record<string, Item>) };
  if (data.customItems) {
    for (const [id, ci] of Object.entries(data.customItems)) {
      catalog[id] = {
        id,
        name: ci.name || 'Position',
        price: typeof ci.price === 'number' ? ci.price : 0,
        t: (ci.t as Item['t']) || 'o',
        info: (ci as { info?: string }).info,
        servicePercent: ci.servicePercent,
      } as Item;
    }
  }
  const order = data.cartOrder && data.cartOrder.length > 0
    ? data.cartOrder.filter((id) => data.cart![id])
    : Object.keys(data.cart);

  return order
    .filter((id) => catalog[id])
    .map((id) => {
      const item = catalog[id];
      const c = data.cart![id];
      const qty = Number(c?.qty || 0);
      const discountQty = Number(c?.discountQty || 0);
      const tier = (c?.tier as string) || (data.globalTier as string) || '12mo';
      const mode: ItemMode = c?.mode;
      const m = isMonthly(item, mode);
      // pricing.price/discountedPrice can return null for custom or
      // term items missing tier data. Coalesce to 0 so the read-only
      // modal still renders rather than crashing on legacy rows.
      const p = price(item, tier as Parameters<typeof price>[1], mode) ?? 0;
      const dp = discountedPrice(item, tier as Parameters<typeof discountedPrice>[1], mode) ?? 0;
      return {
        id,
        name: item.name,
        info: item.info,
        qty,
        discountQty,
        tier,
        mode,
        isMonthly: m,
        unitPrice: p,
        discountUnitPrice: dp,
        hasDiscountFlag: hasDiscount(item),
        lineTotal: (p * qty) + (dp * discountQty),
      };
    })
    .filter((r) => r.qty + r.discountQty > 0);
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-AT');
}

const EVENT_ICON: Record<string, React.ReactNode> = {
  sent:      <Send size={12} className="text-blue-500" />,
  delivered: <Mail size={12} className="text-green-500" />,
  opened:    <MailOpen size={12} className="text-yellow-500" />,
  clicked:   <Mail size={12} className="text-purple-500" />,
  bounced:   <Mail size={12} className="text-red-500" />,
};

export default function OfferDetailsModal({
  offer,
  activities,
  events,
  activitiesLoading = false,
  eventsLoading = false,
  loading = false,
  onClose,
}: OfferDetailsModalProps) {
  // Esc closes — parent can call this freely; no in-flight save state to guard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const customerLabel = offer
    ? offer.customer_company || offer.customer_name || 'Ohne Name'
    : 'Angebot';

  const items = offer?.offer_data ? resolveItems(offer.offer_data) : [];
  const monthlyItems = items.filter((i) => i.isMonthly);
  const onceItems = items.filter((i) => !i.isMonthly);

  // Recompute totals from the cart so they always reflect what's
  // shown in the items table, even if the persisted total_* drifts.
  const recomputed = offer?.offer_data?.cart
    ? computeTotals(offer.offer_data.cart as Parameters<typeof computeTotals>[0], ALL as Parameters<typeof computeTotals>[1])
    : null;
  const monthly = Number(offer?.total_monthly || recomputed?.monthly || 0);
  const once = Number(offer?.total_once || recomputed?.once || 0);
  const period = Number(offer?.total_period || recomputed?.periodTotal || 0);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-3xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200">
          <div className="rounded-lg bg-slate-100 text-slate-600 p-2">
            <FileText size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-800 truncate" style={{ fontSize: 14 }}>
              {customerLabel}
            </div>
            <div className="text-slate-500 truncate" style={{ fontSize: 12 }}>
              Angebotsdetails {offer?.id ? `· ${offer.id.slice(0, 8)}` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 transition-colors"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading || !offer ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 size={20} className="animate-spin mr-2" />
              <span style={{ fontSize: 13 }}>Wird geladen...</span>
            </div>
          ) : (
            <>
              {/* Bounce warning at the top of the modal — same loud
                  treatment as the list row so the rep sees this
                  before anything else when opening Info on a
                  bounced offer. */}
              {offer.status === 'bounced' && (
                <div className="flex items-start gap-2 rounded-xl bg-red-600 text-white px-3 py-3" style={{ fontSize: 12 }}>
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold mb-0.5">E-Mail unzustellbar</div>
                    {offer.customer_email && (
                      <div className="opacity-90 line-through break-all">{offer.customer_email}</div>
                    )}
                    <div className="opacity-90 mt-1">
                      Bitte E-Mail-Adresse prüfen, im Builder anpassen und Angebot neu senden.
                    </div>
                  </div>
                </div>
              )}

              {/* Status row */}
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={offer.status as string} />
                <StageBadge stage={offer.stage as string} />
                {offer.stage === 'lost' && lostReasonLabel(offer.lost_reason) && (
                  <span
                    className="inline-flex items-center gap-1 text-red-700 bg-red-50 border border-red-100 rounded-full px-2 py-0.5"
                    style={{ fontSize: 10 }}
                    title={offer.lost_reason_note || undefined}
                  >
                    <XCircle size={10} />
                    {lostReasonLabel(offer.lost_reason)}
                  </span>
                )}
              </div>

              {/* Customer card */}
              <section>
                <SectionTitle icon={<User size={12} />} label="Kunde" />
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5" style={{ fontSize: 12 }}>
                  {offer.customer_company && (
                    <Row icon={<Building2 size={11} />} label="Firma" value={offer.customer_company} />
                  )}
                  {offer.customer_name && (
                    <Row icon={<User size={11} />} label="Ansprechpartner" value={offer.customer_name} />
                  )}
                  {offer.customer_email && (
                    <Row icon={<Mail size={11} />} label="E-Mail" value={offer.customer_email} />
                  )}
                  {offer.customer_phone && (
                    <Row icon={<Phone size={11} />} label="Telefon" value={offer.customer_phone} />
                  )}
                  {offer.customer_address && (
                    <Row icon={<MapPin size={11} />} label="Adresse" value={offer.customer_address} />
                  )}
                  {offer.mesonic_customer_id && (
                    <Row label="Mesonic-Nr." value={String(offer.mesonic_customer_id)} />
                  )}
                  {!offer.customer_company && !offer.customer_name && !offer.customer_email && (
                    <div className="text-slate-400 italic">Keine Kundendaten erfasst</div>
                  )}
                </div>
              </section>

              {/* Briefing */}
              {offer.briefing && (
                <section>
                  <SectionTitle label="Briefing (intern)" />
                  <div
                    className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 whitespace-pre-wrap"
                    style={{ fontSize: 12, lineHeight: 1.5 }}
                  >
                    {offer.briefing}
                  </div>
                </section>
              )}

              {/* Lost reason note (if present and not already in pill) */}
              {offer.stage === 'lost' && offer.lost_reason_note && (
                <section>
                  <SectionTitle label="Verlust-Notiz" />
                  <div
                    className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-900 whitespace-pre-wrap"
                    style={{ fontSize: 12, lineHeight: 1.5 }}
                  >
                    {offer.lost_reason_note}
                  </div>
                </section>
              )}

              {/* Totals */}
              <section>
                <SectionTitle label="Summen (netto)" />
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 grid grid-cols-3 gap-3 text-center">
                  <TotalCell label="Monatlich" value={monthly > 0 ? `€ ${fmt(monthly)}` : '—'} suffix={monthly > 0 ? '/Mo' : undefined} />
                  <TotalCell label="Einmalig" value={once > 0 ? `€ ${fmt(once)}` : '—'} />
                  <TotalCell label="Gesamtperiode" value={period > 0 ? `€ ${fmt(period)}` : '—'} />
                </div>
              </section>

              {/* Items */}
              <section>
                <SectionTitle label={`Positionen (${items.length})`} />
                {items.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-slate-400" style={{ fontSize: 12 }}>
                    Keine Positionen
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    {monthlyItems.length > 0 && (
                      <ItemGroup title="Monatlich" items={monthlyItems} />
                    )}
                    {onceItems.length > 0 && (
                      <ItemGroup title="Einmalig" items={onceItems} hideTopBorder={monthlyItems.length === 0} />
                    )}
                  </div>
                )}
              </section>

              {/* Notes (customer-visible PDF footer) */}
              {offer.offer_data?.notes && (
                <section>
                  <SectionTitle label="Anmerkungen (im PDF)" />
                  <div
                    className="rounded-xl border border-slate-200 bg-white p-3 text-slate-700 whitespace-pre-wrap"
                    style={{ fontSize: 12, lineHeight: 1.5 }}
                  >
                    {offer.offer_data.notes}
                  </div>
                </section>
              )}

              {/* Kontaktverlauf — every logged activity (call / email
                  / meeting / note) on this offer, newest first. */}
              {(activities !== undefined || activitiesLoading) && (
                <section>
                  <SectionTitle label="Kontaktverlauf" />
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    {activitiesLoading ? (
                      <div className="text-slate-400 text-center py-2"><Loader2 size={14} className="animate-spin mx-auto" /></div>
                    ) : !activities || activities.length === 0 ? (
                      <div className="text-slate-400" style={{ fontSize: 11 }}>Noch keine Kontakte protokolliert.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {activities.map((a) => (
                          <div key={a.id} className="flex flex-wrap items-start gap-x-2 gap-y-1" style={{ fontSize: 11 }}>
                            <ActivityKindBadge kind={a.kind} />
                            {a.outcome && <ActivityOutcomeBadge outcome={a.outcome} />}
                            <span className="text-slate-400">
                              {new Date(a.created_at).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                            {a.created_by_name && <span className="text-slate-400">· {a.created_by_name}</span>}
                            {a.next_followup_at && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 font-medium">
                                <AlarmClock size={11} />
                                {new Date(a.next_followup_at).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })}
                              </span>
                            )}
                            {a.note && <span className="text-slate-700 break-words flex-1 min-w-0">{a.note}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* E-Mail Verlauf — sent / delivered / opened / bounced
                  events from Resend, in chronological order. Falls
                  back to sent_at + opened_at synthesized rows when
                  the parent didn't load events. */}
              {(events !== undefined || eventsLoading) && (
                <section>
                  <SectionTitle label="E-Mail Verlauf" />
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    {eventsLoading ? (
                      <div className="text-slate-400 text-center py-2"><Loader2 size={14} className="animate-spin mx-auto" /></div>
                    ) : !events || events.length === 0 ? (
                      <div className="space-y-1">
                        {offer.sent_at && (
                          <div className="flex items-center gap-2" style={{ fontSize: 11 }}>
                            <Send size={12} className="text-blue-500" />
                            <span className="text-slate-700 font-medium">Gesendet</span>
                            <span className="text-slate-400">{new Date(offer.sent_at).toLocaleString('de-AT')}</span>
                          </div>
                        )}
                        {offer.opened_at && (
                          <div className="flex items-center gap-2" style={{ fontSize: 11 }}>
                            <MailOpen size={12} className="text-yellow-500" />
                            <span className="text-slate-700 font-medium">Gelesen</span>
                            <span className="text-slate-400">{new Date(offer.opened_at).toLocaleString('de-AT')}</span>
                          </div>
                        )}
                        {!offer.sent_at && !offer.opened_at && (
                          <div className="text-slate-400" style={{ fontSize: 11 }}>Noch keine E-Mail-Events</div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {events.map((evt, i) => (
                          <div key={evt.id || i} className="flex items-center gap-2" style={{ fontSize: 11 }}>
                            {EVENT_ICON[evt.event_type] || <Mail size={12} className="text-slate-400" />}
                            <span className="text-slate-700 font-medium">{STATUS_CONFIG[evt.event_type]?.label || evt.event_type}</span>
                            <span className="text-slate-400">{new Date(evt.occurred_at).toLocaleString('de-AT')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Meta */}
              <section>
                <SectionTitle label="Verlauf" />
                <div className="rounded-xl border border-slate-200 bg-white p-3 grid grid-cols-2 gap-x-4 gap-y-1.5" style={{ fontSize: 11 }}>
                  <MetaRow label="Erstellt" value={fmtDateTime(offer.created_at)} />
                  <MetaRow label="Geändert" value={fmtDateTime(offer.updated_at)} />
                  <MetaRow label="Gesendet" value={fmtDateTime(offer.sent_at)} />
                  <MetaRow label="Geöffnet" value={fmtDateTime(offer.opened_at)} />
                  {offer.service_start_date && (
                    <MetaRow label="Leistungsbeginn" value={fmtDate(offer.service_start_date)} />
                  )}
                  {offer.lost_at && (
                    <MetaRow label="Verloren am" value={fmtDateTime(offer.lost_at)} />
                  )}
                  {offer.creator_name && (
                    <MetaRow label="Ersteller" value={offer.creator_name} />
                  )}
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50/50">
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 text-white px-4 py-2 font-medium hover:bg-slate-900 transition-colors"
            style={{ fontSize: 12 }}
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-slate-500 mb-1.5" style={{ fontSize: 11 }}>
      {icon}
      <span className="font-semibold uppercase tracking-wide">{label}</span>
    </div>
  );
}

function Row({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-slate-400 mt-0.5 flex-shrink-0 w-24 flex items-center gap-1">
        {icon}
        <span style={{ fontSize: 11 }}>{label}</span>
      </div>
      <div className="text-slate-800 break-words flex-1" style={{ fontSize: 12 }}>{value}</div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-700 text-right">{value}</span>
    </div>
  );
}

function TotalCell({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div>
      <div className="text-slate-500" style={{ fontSize: 10 }}>{label}</div>
      <div className="font-semibold text-slate-800" style={{ fontSize: 14 }}>
        {value}
        {suffix && <span className="text-slate-500 font-normal" style={{ fontSize: 11 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function ItemGroup({ title, items, hideTopBorder = false }: { title: string; items: ResolvedItem[]; hideTopBorder?: boolean }) {
  return (
    <div className={hideTopBorder ? '' : 'border-t border-slate-100 first:border-t-0'}>
      <div className="px-3 py-1.5 bg-slate-50/60 text-slate-500 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>
        {title}
      </div>
      <div>
        {items.map((it) => (
          <div key={it.id} className="px-3 py-2 border-t border-slate-100 first:border-t-0 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-800" style={{ fontSize: 12 }}>
                {it.name}
                {it.info && (
                  <span className="text-slate-400 font-normal" style={{ fontSize: 11 }}> · {it.info}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500 mt-0.5" style={{ fontSize: 10 }}>
                <span>Menge: {it.qty}{it.discountQty > 0 ? ` (+ ${it.discountQty} rabattiert)` : ''}</span>
                {TIER_SHORT[it.tier as keyof typeof TIER_SHORT] && (
                  <span>Tarif: {TIER_SHORT[it.tier as keyof typeof TIER_SHORT]}</span>
                )}
                {it.mode && <span>Modus: {it.mode}</span>}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-slate-800" style={{ fontSize: 12 }}>
                € {fmt(it.unitPrice)}
                {it.isMonthly ? <span className="text-slate-400" style={{ fontSize: 10 }}>/Mo</span> : null}
              </div>
              {it.discountQty > 0 && it.hasDiscountFlag && (
                <div className="text-emerald-600" style={{ fontSize: 10 }}>
                  rabattiert € {fmt(it.discountUnitPrice)}
                </div>
              )}
              <div className="font-semibold text-slate-700 mt-0.5" style={{ fontSize: 12 }}>
                Σ € {fmt(it.lineTotal)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
