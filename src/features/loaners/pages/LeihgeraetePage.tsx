import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Loader2, PackageOpen, ArrowRightLeft, Tag } from 'lucide-react';
import Select from '../../../components/Select';
import { useAuth } from '../../../lib/auth';
import { findIdBySsoEmail } from '../../../lib/ssoMatch';
import { importWithReload } from '../../../lib/lazyWithReload';
import { downloadBlob } from '../lib/download';
import { listEmployees } from '../../vacation/api/vacationApi';
import { listDevices, listOpenLoans } from '../api/loanerApi';
import { listProductsAdmin, type Product } from '../../offers/api/productApi';
import { STATUS_LABEL, STATUS_PILL, STANDORT_LABEL } from '../lib/loanerFormat';
import type { Loan, LoanerDevice, LoanerDeviceStatus } from '../types';
import DeviceFormModal from '../components/DeviceFormModal';
import DeviceDetailModal from '../components/DeviceDetailModal';
import CheckOutModal from '../components/CheckOutModal';

// Leihgeräte (loaner inventory) — fleet list + add/edit + read-only detail.
// Check-out/check-in + stickers + the Lieferschein scan hook come in later
// phases. Siehe docs/leihstellungen.md.

type StatusFilter = 'all' | LoanerDeviceStatus;

const STATUS_ORDER: LoanerDeviceStatus[] = ['available', 'on_loan', 'defective', 'retired'];

export default function LeihgeraetePage() {
  const [devices, setDevices] = useState<LoanerDevice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [openLoans, setOpenLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [standortFilter, setStandortFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LoanerDevice | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [checkOutPreselect, setCheckOutPreselect] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  // Resolve the signed-in user's employee id (for loans.created_by), same
  // SSO-email → employee lookup the tickets area uses. Best-effort → null.
  const auth = useAuth() as { profile?: { microsoft_email?: string } | null; user?: { email?: string } | null };
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const email = auth.profile?.microsoft_email || auth.user?.email || '';
    if (!email) return;
    (async () => {
      try {
        const emps = await listEmployees({ activeOnly: true });
        if (cancelled) return;
        const myId = findIdBySsoEmail(email, emps.map((e) => ({ id: e.id, email: e.email, name: e.name })));
        if (myId) setEmployeeId(myId);
      } catch {
        /* stays null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.profile?.microsoft_email, auth.user?.email]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [devs, prods, loans] = await Promise.all([listDevices(), listProductsAdmin(), listOpenLoans()]);
      setDevices(devs);
      setProducts(prods);
      setOpenLoans(loans);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // deviceId → customer name of the open loan holding it.
  const loanByDevice = useMemo(() => {
    const map = new Map<string, string>();
    for (const loan of openLoans) {
      for (const ld of loan.devices ?? []) {
        if (ld.returnedAt == null) map.set(ld.deviceId, loan.customerName);
      }
    }
    return map;
  }, [openLoans]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: devices.length };
    for (const s of STATUS_ORDER) c[s] = 0;
    for (const d of devices) c[d.status] = (c[d.status] ?? 0) + 1;
    return c;
  }, [devices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devices.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (standortFilter && d.standort !== standortFilter) return false;
      if (q) {
        const hay = `${d.bezeichnung} ${d.serialNumber} ${d.inventoryNo ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [devices, search, statusFilter, standortFilter]);

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(device: LoanerDevice) {
    setDetailId(null);
    setEditing(device);
    setFormOpen(true);
  }
  function openCheckOut(preselectId: string | null) {
    setDetailId(null);
    setCheckOutPreselect(preselectId);
    setCheckOutOpen(true);
  }

  // Print Code128 stickers for the currently-filtered devices.
  async function printStickers() {
    if (filtered.length === 0 || printing) return;
    setPrinting(true);
    try {
      const { generateLoanerStickersBlob } = await importWithReload(
        () => import('../../../pdf/generateLoanerStickers'),
      );
      const blob = await generateLoanerStickersBlob(
        filtered.map((d) => ({ bezeichnung: d.bezeichnung, serialNumber: d.serialNumber, inventoryNo: d.inventoryNo })),
      );
      downloadBlob(blob, `Leihgeraete-Etiketten-${filtered.length}.pdf`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Leihgeräte</h1>
          <p className="text-sm text-slate-400">{devices.length} Geräte im Bestand</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openCheckOut(null)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700"
          >
            <ArrowRightLeft size={16} /> Verleihen
          </button>
          <button
            onClick={printStickers}
            disabled={filtered.length === 0 || printing}
            title="Etiketten für die gefilterten Geräte drucken"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {printing ? <Loader2 size={16} className="animate-spin" /> : <Tag size={16} />} Etiketten
          </button>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <Plus size={16} /> Gerät hinzufügen
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {(['all', ...STATUS_ORDER] as StatusFilter[]).map((s) => {
            const active = statusFilter === s;
            const count = statusCounts[s] ?? 0;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  active ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s === 'all' ? 'Alle' : STATUS_LABEL[s]} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select
            value={standortFilter}
            onChange={setStandortFilter}
            className="inline-block w-40"
            options={[
              { value: '', label: 'Alle Standorte' },
              { value: 'klagenfurt', label: 'Klagenfurt' },
              { value: 'wolfsberg', label: 'Wolfsberg' },
            ]}
          />
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche…"
              className="w-48 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            />
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="animate-spin" size={24} />
        </div>
      )}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="underline">Erneut</button>
        </div>
      )}

      {!loading && !error && (
        filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <PackageOpen size={32} className="mx-auto mb-2 opacity-50" />
            <p className="font-medium">Keine Geräte</p>
            <p className="text-sm">{devices.length === 0 ? 'Füge dein erstes Leihgerät hinzu.' : 'Kein Treffer für die aktuellen Filter.'}</p>
          </div>
        ) : (
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-400 text-xs">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Gerät</th>
                  <th className="text-left font-medium px-4 py-2">Seriennummer</th>
                  <th className="text-left font-medium px-4 py-2">Status</th>
                  <th className="text-left font-medium px-4 py-2">Standort</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setDetailId(d.id)}
                    className="hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-4 py-2.5">
                      <div className="text-slate-800">{d.bezeichnung}</div>
                      {d.inventoryNo && <div className="text-xs text-slate-400">#{d.inventoryNo}</div>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-500 text-xs">{d.serialNumber}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_PILL[d.status]}`}>
                        {STATUS_LABEL[d.status]}
                      </span>
                      {d.status === 'on_loan' && loanByDevice.get(d.id) && (
                        <span className="text-xs text-slate-400 ml-2">{loanByDevice.get(d.id)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{d.standort ? STANDORT_LABEL[d.standort] : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {formOpen && (
        <DeviceFormModal
          device={editing}
          products={products}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            load();
          }}
        />
      )}
      {detailId && (
        <DeviceDetailModal
          deviceId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={openEdit}
          onCheckOut={(d) => openCheckOut(d.id)}
          onChanged={load}
        />
      )}
      {checkOutOpen && (
        <CheckOutModal
          devices={devices}
          preselectDeviceId={checkOutPreselect}
          createdBy={employeeId}
          onClose={() => setCheckOutOpen(false)}
          onDone={() => {
            setCheckOutOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
