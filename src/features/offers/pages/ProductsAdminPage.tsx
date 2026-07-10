import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Package, Pencil, Plus, Save, Search, X } from 'lucide-react';
import Select from '../../../components/Select';
import {
  createProduct,
  listProductsAdmin,
  updateProduct,
  type Product,
  type ProductPricing,
} from '../api/productApi';

const CATALOGS = [
  'BESSA', 'MELZER', 'GASTROTOUCH', 'RCH', 'HARDWARE', 'UNIFY', 'DRUCKER',
  'KUECHENMONITORE', 'KUECHENMONITORE_SUNMI', 'KIOSK', 'ORDERMAN',
  'DIENSTLEISTUNGEN', 'SHARP', 'SHARP_ZUBEHOR', 'BROTHER',
];
const KINDS: Array<{ value: string; label: string }> = [
  { value: 'm', label: 'Monatlich' },
  { value: 'o', label: 'Einmalig' },
  { value: 'h', label: 'Stunde' },
  { value: 'copier', label: 'Kopierer/MFP' },
];

const eur = (n: number) => `€${n.toLocaleString('de-AT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function priceSummary(p: ProductPricing): string {
  if (p.tiers) {
    const vals = [p.tiers.y, p.tiers.s, p.tiers.m, p.tiers.e].filter((v): v is number => v != null);
    if (vals.length === 0) return '—';
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return lo === hi ? eur(lo) : `${eur(lo)}–${eur(hi)}`;
  }
  if (p.price != null) return eur(p.price);
  return '—';
}

const num = (s: string): number | undefined => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

export default function ProductsAdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setProducts(await listProductsAdmin());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.code?.toLowerCase().includes(term) ?? false) ||
        p.catalog.toLowerCase().includes(term),
    );
  }, [products, search]);

  const byCatalog = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of filtered) {
      const arr = m.get(p.catalog) ?? [];
      arr.push(p);
      m.set(p.catalog, arr);
    }
    return m;
  }, [filtered]);

  async function toggleActive(p: Product) {
    try {
      const updated = await updateProduct(p.id, { active: !p.active });
      setProducts((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function onSaved(saved: Product, isNew: boolean) {
    setProducts((prev) => (isNew ? [...prev, saved] : prev.map((x) => (x.id === saved.id ? saved : x))));
    setEditing(null);
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-4 md:px-8 md:py-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2">
            <Package size={20} className="text-red-600" />
            <h1 className="font-bold text-slate-700" style={{ fontSize: 18 }}>Produkte</h1>
            <span className="text-xs text-slate-400">{products.length}</span>
          </div>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition text-sm font-medium"
          >
            <Plus size={16} />
            Neues Produkt
          </button>
        </div>

        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, Code oder Katalog suchen…"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 mb-3 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-red-400" />
          </div>
        ) : (
          Array.from(byCatalog.entries()).map(([catalog, items]) => (
            <section key={catalog} className="mb-5">
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="text-sm font-semibold text-slate-700">{catalog}</h2>
                <span className="text-xs text-slate-400">{items.length}</span>
              </div>
              <ul className="space-y-1">
                {items.map((p) => (
                  <li
                    key={p.id}
                    className={`rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center gap-2 text-sm ${p.active ? '' : 'opacity-55'}`}
                    data-testid="product-row"
                  >
                    {p.code && <span className="font-mono text-xs text-slate-400 w-12 flex-shrink-0">{p.code}</span>}
                    <span className="font-medium text-slate-800 truncate flex-1">{p.name}</span>
                    <span className="text-slate-600 font-mono text-xs whitespace-nowrap">{priceSummary(p.pricing)}</span>
                    <button
                      type="button"
                      onClick={() => toggleActive(p)}
                      className={`text-xs px-1.5 py-0.5 rounded border ${p.active ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'border-slate-200 text-slate-500'}`}
                      title={p.active ? 'Aktiv — klicken zum Deaktivieren' : 'Inaktiv — klicken zum Aktivieren'}
                    >
                      {p.active ? 'aktiv' : 'inaktiv'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="rounded p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                      aria-label="Bearbeiten"
                    >
                      <Pencil size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {editing && (
        <ProductEditModal
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function ProductEditModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: (p: Product, isNew: boolean) => void;
}) {
  const isNew = !product;
  const [name, setName] = useState(product?.name ?? '');
  const [code, setCode] = useState(product?.code ?? '');
  const [catalog, setCatalog] = useState(product?.catalog ?? 'BESSA');
  const [category, setCategory] = useState(product?.category ?? '');
  const [kind, setKind] = useState(product?.kind ?? 'm');
  const [note, setNote] = useState(product?.note ?? '');
  const [info, setInfo] = useState(product?.info ?? '');
  const [priceMode, setPriceMode] = useState<'flat' | 'tiers'>(product?.pricing?.tiers ? 'tiers' : 'flat');
  const [flat, setFlat] = useState(product?.pricing?.price != null ? String(product.pricing.price) : '');
  const t = product?.pricing?.tiers ?? {};
  const [ty, setTy] = useState(t.y != null ? String(t.y) : '');
  const [ts, setTs] = useState(t.s != null ? String(t.s) : '');
  const [tm, setTm] = useState(t.m != null ? String(t.m) : '');
  const [te, setTe] = useState(t.e != null ? String(t.e) : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setErr('Name erforderlich.'); return; }
    // Preserve servicePercent + discount from the existing pricing.
    const pricing: ProductPricing = {};
    if (product?.pricing?.servicePercent !== undefined) pricing.servicePercent = product.pricing.servicePercent;
    if (product?.pricing?.discount !== undefined) pricing.discount = product.pricing.discount;
    if (priceMode === 'tiers') {
      const tiers: Record<string, number> = {};
      const y = num(ty), s = num(ts), m = num(tm), e = num(te);
      if (y !== undefined) tiers.y = y;
      if (s !== undefined) tiers.s = s;
      if (m !== undefined) tiers.m = m;
      if (e !== undefined) tiers.e = e;
      pricing.tiers = tiers;
    } else {
      const p = num(flat);
      if (p !== undefined) pricing.price = p;
    }
    setSaving(true);
    setErr(null);
    try {
      const patch = {
        name: name.trim(),
        code: code.trim() || null,
        catalog,
        category: category.trim() || null,
        kind,
        note: note.trim() || null,
        info: info.trim() || null,
        pricing,
      };
      const saved = isNew ? await createProduct(patch) : await updateProduct(product!.id, patch);
      onSaved(saved, isNew);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="font-bold text-slate-800" style={{ fontSize: 16 }}>{isNew ? 'Neues Produkt' : 'Produkt bearbeiten'}</h3>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" aria-label="Schließen"><X size={16} className="text-slate-500" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Code</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Art</label>
              <Select value={kind} onChange={setKind} options={KINDS} ariaLabel="Art" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Katalog</label>
              <Select value={catalog} onChange={setCatalog} options={CATALOGS.map((c) => ({ value: c, label: c }))} ariaLabel="Katalog" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Kategorie</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-600">Preis</label>
              <div className="flex gap-1 text-xs">
                <button type="button" onClick={() => setPriceMode('flat')} className={`px-2 py-0.5 rounded ${priceMode === 'flat' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Fix</button>
                <button type="button" onClick={() => setPriceMode('tiers')} className={`px-2 py-0.5 rounded ${priceMode === 'tiers' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Staffel</button>
              </div>
            </div>
            {priceMode === 'flat' ? (
              <input value={flat} onChange={(e) => setFlat(e.target.value)} inputMode="decimal" placeholder="0" className="w-32 px-3 py-2 rounded-lg border border-slate-200 text-sm text-right" />
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {([['y', ty, setTy], ['s', ts, setTs], ['m', tm, setTm], ['e', te, setTe]] as const).map(([label, val, set]) => (
                  <div key={label}>
                    <div className="text-[10px] text-slate-400 text-center mb-0.5 uppercase">{label}</div>
                    <input value={val} onChange={(e) => set(e.target.value)} inputMode="decimal" placeholder="0" className="w-full px-1.5 py-1.5 rounded border border-slate-200 text-sm text-right" />
                  </div>
                ))}
              </div>
            )}
            {product?.pricing?.servicePercent !== undefined && (
              <p className="text-[11px] text-slate-400 mt-1">Wartung {String(product.pricing.servicePercent)}% (unverändert)</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notiz</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Info</label>
            <input value={info} onChange={(e) => setInfo(e.target.value)} placeholder="optional" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>

          {err && <div className="text-sm text-red-600">{err}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Abbrechen</button>
            <button type="button" onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isNew ? 'Anlegen' : 'Speichern'}
            </button>
          </div>
          {!isNew && (
            <p className="text-[11px] text-slate-400">
              Wartungssatz, Rabatt & Kopierer-Details bleiben erhalten (hier noch nicht editierbar).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
