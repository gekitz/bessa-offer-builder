import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, Loader2, Plug, Settings, ShoppingCart, Truck } from 'lucide-react';
import { useAuth } from '../../../lib/auth';
import { findIdBySsoEmail } from '../../../lib/ssoMatch';
import { listEmployees } from '../../vacation/api/vacationApi';
import { aggregateOpenRequests } from '../lib/aggregate';
import { canPlaceJarltechOrder, fetchJarltechPrices, pingJarltech } from '../api/jarltechApi';
import type { JarltechItemInfo } from '../lib/jarltechNormalize';
import { KITZ_STANDORTE, type StandortKey } from '../lib/shipping';
import { strategyForMethod, type OrderStrategy } from '../lib/orderStrategies';
import SupplierOrderModal from '../components/SupplierOrderModal';
import type { SupplierGroup } from '../lib/aggregate';
import {
  createOrderRequest,
  createPurchaseOrder,
  listOrderRequests,
  listPurchaseOrders,
  listRequestableProducts,
  listSuppliers,
  markPurchaseOrderReceived,
  updateOrderRequest,
} from '../api/procurementApi';
import type {
  OrderLineDecision,
  OrderRequest,
  PriceQuote,
  PurchaseOrder,
  RequestableProduct,
  Supplier,
} from '../types';
import OrderRequestForm from '../components/OrderRequestForm';
import RequestList from '../components/RequestList';
import SupplierAggregation from '../components/SupplierAggregation';
import PurchaseOrderList from '../components/PurchaseOrderList';

type Tab = 'anfragen' | 'einkauf';

// Hardware-Beschaffung. Jeder Rep stellt Anfragen ("Anfragen"-Tab); der
// Einkäufer (admin) aggregiert offene Anfragen pro Lieferant und löst
// Sammelbestellungen aus ("Einkauf"-Tab).
export default function ProcurementPage() {
  const { profile, user } = useAuth() as {
    profile: { microsoft_email?: string; role?: string } | null;
    user: { email?: string } | null;
  };
  const isAdmin = profile?.role === 'admin';
  const email = profile?.microsoft_email || user?.email || '';

  const [tab, setTab] = useState<Tab>('anfragen');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<RequestableProduct[]>([]);
  const [requests, setRequests] = useState<OrderRequest[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);

  // Busy-Flags für einzelne Aktionen
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [ordering, setOrdering] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [receivingId, setReceivingId] = useState<string | null>(null);

  // Jarltech-Live-Preise/Lager (per Edge Function abgerufen), keyed by
  // jarltech_item_id.
  const [jarltechInfo, setJarltechInfo] = useState<Map<string, JarltechItemInfo>>(new Map());
  const [loadingJarltech, setLoadingJarltech] = useState(false);
  // Permission for the gated (api) strategy — allowlist-checked server-side;
  // this flag only controls button visibility.
  const [canApiOrder, setCanApiOrder] = useState(false);
  // The automated-order modal: the group + its resolved strategy.
  const [orderModal, setOrderModal] = useState<{ group: SupplierGroup; strategy: OrderStrategy } | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  // Settings dropdown (cog) in the header.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  // Connectivity self-test result (Einkauf tab): idle | testing | ok | error.
  const [connTest, setConnTest] = useState<{ status: 'idle' | 'testing' | 'ok' | 'error'; message: string }>({
    status: 'idle',
    message: '',
  });

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const jarltechSupplierId = useMemo(
    () => suppliers.find((s) => s.code === 'jarltech')?.id ?? null,
    [suppliers],
  );

  const reloadRequests = useCallback(async () => {
    const [reqs, pos] = await Promise.all([
      listOrderRequests(),
      listPurchaseOrders(),
    ]);
    setRequests(reqs);
    setPurchaseOrders(pos);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [sups, prods, reqs, pos] = await Promise.all([
          listSuppliers({ activeOnly: true }),
          listRequestableProducts(),
          listOrderRequests(),
          listPurchaseOrders(),
        ]);
        if (cancelled) return;
        setSuppliers(sups);
        setProducts(prods);
        setRequests(reqs);
        setPurchaseOrders(pos);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Aktuellen Mitarbeiter (für requested_by) über die SSO-E-Mail auflösen.
  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    (async () => {
      try {
        const emps = await listEmployees({ activeOnly: true });
        if (cancelled) return;
        const id = findIdBySsoEmail(
          email,
          emps.map((e) => ({ id: e.id, email: e.email, name: e.name })),
        );
        setMyEmployeeId(id ?? null);
      } catch {
        // best-effort — requested_by bleibt null
      }
    })();
    return () => { cancelled = true; };
  }, [email]);

  const openGroups = useMemo(
    () => aggregateOpenRequests(requests, suppliers),
    [requests, suppliers],
  );
  const openCount = useMemo(() => requests.filter((r) => r.status === 'open').length, [requests]);

  async function handleCreate(input: {
    product: RequestableProduct | null;
    freeText: string;
    qty: number;
    note: string;
    customerName: string;
  }) {
    setSubmitting(true);
    setError(null);
    try {
      await createOrderRequest({
        productId: input.product?.id ?? null,
        productName: input.product?.name ?? input.freeText,
        productCode: input.product?.code ?? null,
        supplierId: input.product?.supplierId ?? null,
        qty: input.qty,
        note: input.note || null,
        customerName: input.customerName || null,
        requestedBy: myEmployeeId,
      });
      await reloadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    setCancellingId(id);
    try {
      await updateOrderRequest(id, { status: 'cancelled' });
      await reloadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancellingId(null);
    }
  }

  async function handleOrder(supplierId: string, lines: OrderLineDecision[], priceQuotes: PriceQuote[]) {
    setOrdering(supplierId);
    setError(null);
    try {
      await createPurchaseOrder({
        supplierId,
        lines,
        orderedBy: myEmployeeId,
        priceQuotes: priceQuotes.length ? priceQuotes : null,
      });
      await reloadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOrdering(null);
    }
  }

  async function handleReassign(lineKey: string, requestIds: string[], supplierId: string) {
    setReassigning(lineKey);
    setError(null);
    try {
      await Promise.all(requestIds.map((id) => updateOrderRequest(id, { supplierId })));
      await reloadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReassigning(null);
    }
  }

  // Close the settings menu on outside-click / Escape.
  useEffect(() => {
    if (!settingsOpen) return;
    function onDown(e: MouseEvent) {
      if (!settingsRef.current?.contains(e.target as Node)) setSettingsOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSettingsOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

  // Check once (admins only) whether this user may place gated (api) orders.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    canPlaceJarltechOrder()
      .then((ok) => { if (!cancelled) setCanApiOrder(ok); })
      .catch(() => { /* stays false — button hidden */ });
    return () => { cancelled = true; };
  }, [isAdmin]);

  // Open the automated-order modal for a group, resolving its strategy from
  // the supplier's order method.
  function openAutomatedOrder(group: SupplierGroup) {
    const method = group.supplierId
      ? suppliers.find((s) => s.id === group.supplierId)?.orderMethod ?? 'manual'
      : 'manual';
    const strategy = strategyForMethod(method);
    if (strategy) setOrderModal({ group, strategy });
  }

  // Confirm the automated order: run the strategy's external action
  // (Jarltech API / order e-mail), then record the consolidated PO for the
  // ordered lines and flip their requests to `ordered`. This tail is shared
  // across all strategies.
  async function confirmAutomatedOrder(standort: StandortKey) {
    if (!orderModal) return;
    const { group, strategy } = orderModal;
    const { orderable } = strategy.split(group, productsById);
    if (orderable.length === 0) return;

    setPlacingOrder(true);
    setError(null);
    try {
      const poNote = await strategy.place({
        group,
        productsById,
        jarltechInfo,
        shippingAddress: KITZ_STANDORTE[standort].address,
        standortLabel: KITZ_STANDORTE[standort].label,
        orderable,
      });

      const lines: OrderLineDecision[] = orderable.map((l) => {
        const jid = l.productId ? productsById.get(l.productId)?.jarltechItemId : null;
        const jt = jid ? jarltechInfo.get(jid) : undefined;
        return {
          requestIds: l.requests.map((r) => r.id),
          supplierId: group.supplierId!,
          unitPrice: jt?.unitPrice ?? null,
        };
      });
      await createPurchaseOrder({
        supplierId: group.supplierId!,
        lines,
        orderedBy: myEmployeeId,
        note: poNote ?? undefined,
      });

      setOrderModal(null);
      await reloadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlacingOrder(false);
    }
  }

  // Jarltech-Preise/Lager für alle offenen, mit Jarltech verknüpften
  // Produkte abrufen. On-demand (Button) — kein Auto-Sync, wie von
  // Jarltech gefordert.
  async function handleLoadJarltechPrices() {
    const ids = new Set<string>();
    for (const g of openGroups) {
      for (const line of g.lines) {
        const jid = line.productId ? productsById.get(line.productId)?.jarltechItemId : null;
        if (jid) ids.add(jid);
      }
    }
    if (ids.size === 0) return;
    setLoadingJarltech(true);
    setError(null);
    try {
      const info = await fetchJarltechPrices(Array.from(ids));
      setJarltechInfo(info);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingJarltech(false);
    }
  }

  // Verify the Jarltech credentials/connection: ping (OAuth) + a lookup of
  // Jarltech's documented sample article, which also exercises the
  // customer-scoped path. Reports a readable status either way.
  async function handleTestConnection() {
    setConnTest({ status: 'testing', message: '' });
    try {
      await pingJarltech();
      const sample = await fetchJarltechPrices(['mpk1s12v']);
      const info = sample.get('mpk1s12v');
      if (info?.unitPrice != null) {
        setConnTest({
          status: 'ok',
          message: `Verbindung OK — Beispielartikel mpk1s12v: € ${info.unitPrice.toLocaleString('de-AT', { minimumFractionDigits: 2 })}${info.stock != null ? `, Lager ${info.stock}` : ''}.`,
        });
      } else {
        setConnTest({
          status: 'ok',
          message: 'Authentifizierung OK. Beispielartikel lieferte keinen Preis (für diesen Kunden ggf. nicht bestellbar) — mit einem echten Artikel testen.',
        });
      }
    } catch (e) {
      setConnTest({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleReceive(poId: string) {
    setReceivingId(poId);
    setError(null);
    try {
      await markPurchaseOrderReceived(poId);
      await reloadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReceivingId(null);
    }
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-4 md:px-8 md:py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart size={20} className="text-red-600" />
          <h1 className="font-bold text-slate-700" style={{ fontSize: 18 }}>Bestellungen</h1>
          {isAdmin && (
            <div className="relative ml-auto" ref={settingsRef}>
              <button
                type="button"
                onClick={() => setSettingsOpen((o) => !o)}
                aria-label="Einstellungen"
                aria-haspopup="menu"
                aria-expanded={settingsOpen}
                className={`rounded-lg p-2 transition-colors ${settingsOpen ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
              >
                <Settings size={18} />
              </button>
              {settingsOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1 w-72 rounded-xl border border-slate-200 bg-white shadow-lg py-1 z-20"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleTestConnection}
                    disabled={connTest.status === 'testing'}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {connTest.status === 'testing' ? <Loader2 size={15} className="animate-spin text-slate-400" /> : <Plug size={15} className="text-slate-400" />}
                    Jarltech Verbindung testen
                  </button>
                  {connTest.status === 'ok' && (
                    <div className="px-3 py-2 text-[12px] text-emerald-700 flex items-start gap-1.5 border-t border-slate-100">
                      <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5" /> <span>{connTest.message}</span>
                    </div>
                  )}
                  {connTest.status === 'error' && (
                    <div className="px-3 py-2 text-[12px] text-red-600 flex items-start gap-1.5 border-t border-slate-100">
                      <AlertCircle size={13} className="flex-shrink-0 mt-0.5" /> <span>{connTest.message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-slate-200">
          <TabButton active={tab === 'anfragen'} onClick={() => setTab('anfragen')} icon={<ClipboardList size={15} />}>
            Anfragen{openCount > 0 ? ` (${openCount})` : ''}
          </TabButton>
          {isAdmin && (
            <TabButton active={tab === 'einkauf'} onClick={() => setTab('einkauf')} icon={<Truck size={15} />}>
              Einkauf
            </TabButton>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 mb-3 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-red-400" />
          </div>
        ) : tab === 'anfragen' ? (
          <div className="space-y-4">
            <OrderRequestForm
              products={products}
              suppliers={suppliers}
              submitting={submitting}
              onSubmit={handleCreate}
            />
            <div>
              <h2 className="text-sm font-semibold text-slate-600 mb-2">Alle Anfragen</h2>
              <RequestList requests={requests} cancellingId={cancellingId} onCancel={handleCancel} />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <h2 className="text-sm font-semibold text-slate-600 mb-2">Offene Anfragen aggregiert</h2>
              <SupplierAggregation
                groups={openGroups}
                suppliers={suppliers}
                productsById={productsById}
                jarltechSupplierId={jarltechSupplierId}
                jarltechInfo={jarltechInfo}
                loadingJarltech={loadingJarltech}
                canApiOrder={canApiOrder}
                ordering={ordering}
                reassigning={reassigning}
                onOrder={handleOrder}
                onReassign={handleReassign}
                onLoadJarltechPrices={handleLoadJarltechPrices}
                onAutomatedOrder={openAutomatedOrder}
              />
            </section>
            <section>
              <h2 className="text-sm font-semibold text-slate-600 mb-2">Bestellungen</h2>
              <PurchaseOrderList orders={purchaseOrders} receivingId={receivingId} onReceive={handleReceive} />
            </section>
          </div>
        )}
      </div>

      {orderModal && (
        <SupplierOrderModal
          strategy={orderModal.strategy}
          supplierName={orderModal.group.supplierName}
          group={orderModal.group}
          productsById={productsById}
          placing={placingOrder}
          onConfirm={confirmAutomatedOrder}
          onClose={() => setOrderModal(null)}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
