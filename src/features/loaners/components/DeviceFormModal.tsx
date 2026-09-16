import { useState } from 'react';
import { X } from 'lucide-react';
import Select from '../../../components/Select';
import DatePicker from '../../../components/DatePicker';
import BarcodeScanButton from '../../tickets/components/BarcodeScanButton';
import type { Product } from '../../offers/api/productApi';
import { createDevice, updateDevice } from '../api/loanerApi';
import type { LoanerDevice, LoanerDeviceStatus, MesonicStandort } from '../types';

// Add / edit a loaner device. On save calls the API and hands the fresh row
// back to the parent. Serial is required and unique (DB-enforced); a clash
// surfaces as a friendly message. Siehe docs/leihstellungen.md.

interface Props {
  device?: LoanerDevice | null; // null/undefined = create
  products: Product[];
  onClose: () => void;
  onSaved: (device: LoanerDevice) => void;
}

const inputCls =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500';
const labelCls = 'block text-xs font-medium text-slate-500 mb-1';

// Editable statuses (on_loan is system-managed via check-out/in).
const EDIT_STATUSES: LoanerDeviceStatus[] = ['available', 'defective', 'retired'];
const STATUS_TEXT: Record<LoanerDeviceStatus, string> = {
  available: 'Verfügbar',
  on_loan: 'Verliehen',
  defective: 'Defekt',
  retired: 'Ausgemustert',
};

export default function DeviceFormModal({ device, products, onClose, onSaved }: Props) {
  const isEdit = !!device;
  const [productId, setProductId] = useState<string>(device?.productId ?? '');
  const [bezeichnung, setBezeichnung] = useState(device?.bezeichnung ?? '');
  const [serialNumber, setSerialNumber] = useState(device?.serialNumber ?? '');
  const [inventoryNo, setInventoryNo] = useState(device?.inventoryNo ?? '');
  const [acquisitionCost, setAcquisitionCost] = useState(
    device?.acquisitionCost != null ? String(device.acquisitionCost) : '',
  );
  const [acquiredAt, setAcquiredAt] = useState(device?.acquiredAt ?? '');
  const [standort, setStandort] = useState<string>(device?.standort ?? '');
  const [notionalDailyValue, setNotionalDailyValue] = useState(
    device?.notionalDailyValue != null ? String(device.notionalDailyValue) : '',
  );
  const [note, setNote] = useState(device?.note ?? '');
  const [status, setStatus] = useState<LoanerDeviceStatus>(device?.status ?? 'available');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productOptions = [
    { value: '', label: '— kein Produkt —' },
    ...products
      .filter((p) => p.active)
      .map((p) => ({ value: p.id, label: p.name, hint: p.catalog })),
  ];

  // Picking a product prefills the name when the field is still empty or still
  // shows the previously-picked product's name (so manual edits are kept).
  function handleProductChange(id: string) {
    const prev = products.find((p) => p.id === productId);
    setProductId(id);
    const next = products.find((p) => p.id === id);
    if (next && (!bezeichnung.trim() || bezeichnung === prev?.name)) {
      setBezeichnung(next.name);
    }
  }

  async function handleSubmit() {
    if (!bezeichnung.trim()) return setError('Bezeichnung fehlt.');
    if (!serialNumber.trim()) return setError('Seriennummer fehlt.');
    setSaving(true);
    setError(null);
    const cost = acquisitionCost.trim() ? Number(acquisitionCost.replace(',', '.')) : null;
    const notional = notionalDailyValue.trim() ? Number(notionalDailyValue.replace(',', '.')) : null;
    const base = {
      productId: productId || null,
      bezeichnung: bezeichnung.trim(),
      serialNumber: serialNumber.trim(),
      inventoryNo: inventoryNo.trim() || null,
      acquisitionCost: cost != null && !Number.isNaN(cost) ? cost : null,
      acquiredAt: acquiredAt || null,
      standort: (standort || null) as MesonicStandort | null,
      notionalDailyValue: notional != null && !Number.isNaN(notional) ? notional : null,
      note: note.trim() || null,
    };
    try {
      const saved = isEdit
        ? await updateDevice(device!.id, { ...base, status })
        : await createDevice(base);
      onSaved(saved);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(
        /duplicate|unique|23505/i.test(msg)
          ? `Seriennummer „${serialNumber.trim()}" ist bereits erfasst.`
          : msg,
      );
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
          <span className="font-bold">{isEdit ? 'Gerät bearbeiten' : 'Gerät hinzufügen'}</span>
          <button onClick={onClose} aria-label="Schließen" className="text-white/70 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className={labelCls}>Produkt (optional)</label>
            <Select value={productId} onChange={handleProductChange} options={productOptions} placeholder="— kein Produkt —" />
          </div>
          <div>
            <label className={labelCls}>Bezeichnung *</label>
            <input className={inputCls} value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. Sunmi L3" />
          </div>
          <div>
            <label className={labelCls}>Seriennummer *</label>
            <div className="flex items-center gap-2">
              <input className={inputCls} value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Barcode scannen oder tippen" />
              <BarcodeScanButton onScan={(v) => setSerialNumber(v)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Inventarnr.</label>
              <input className={inputCls} value={inventoryNo} onChange={(e) => setInventoryNo(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Standort</label>
              <Select
                value={standort}
                onChange={setStandort}
                options={[
                  { value: '', label: '—' },
                  { value: 'klagenfurt', label: 'Klagenfurt' },
                  { value: 'wolfsberg', label: 'Wolfsberg' },
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Anschaffungskosten (€)</label>
              <input className={inputCls} inputMode="decimal" value={acquisitionCost} onChange={(e) => setAcquisitionCost(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <label className={labelCls}>Angeschafft am</label>
              <DatePicker value={acquiredAt} onChange={setAcquiredAt} />
            </div>
          </div>
          {isEdit && (
            <div>
              <label className={labelCls}>Status</label>
              {device!.status === 'on_loan' ? (
                <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  Gerät ist verliehen — erst zurücknehmen, um den Status zu ändern.
                </p>
              ) : (
                <Select
                  value={status}
                  onChange={(v) => setStatus(v as LoanerDeviceStatus)}
                  options={EDIT_STATUSES.map((s) => ({ value: s, label: STATUS_TEXT[s] }))}
                />
              )}
            </div>
          )}
          <div>
            <label className={labelCls}>Notiz</label>
            <textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
