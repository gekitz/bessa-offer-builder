import { useState } from 'react';
import { X, Trash2, UserPlus, Building2, Plus } from 'lucide-react';
import Select from '../../../components/Select';
import DatePicker from '../../../components/DatePicker';
import BarcodeScanButton from '../../tickets/components/BarcodeScanButton';
import CustomerPicker from '../../../components/CustomerPicker';
import { checkOut, findDeviceBySerial } from '../api/loanerApi';
import { canCheckOut } from '../lib/loanMetrics';
import { exportLoanBeleg } from '../lib/runLoanBelegExport';
import type { LoanerDevice } from '../types';

// Verleihen: build a loan from one or more available devices + a Bestandskunde,
// then create it (DB). The Mesonic Leih-Lieferschein is fired in Phase 4.
// Siehe docs/leihstellungen.md.

interface Props {
  devices: LoanerDevice[]; // full fleet (for the picker)
  preselectDeviceId?: string | null;
  createdBy?: string | null;
  // Prefill (e.g. from the Lieferschein scan hook — this ticket's customer).
  initialCustomer?: { name: string; kdnr: string } | null;
  ticketId?: string | null;
  onClose: () => void;
  onDone: () => void;
}

const inputCls =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500';
const labelCls = 'block text-xs font-medium text-slate-500 mb-1';

export default function CheckOutModal({
  devices,
  preselectDeviceId,
  createdBy,
  initialCustomer,
  ticketId,
  onClose,
  onDone,
}: Props) {
  const preselect = preselectDeviceId ? devices.find((d) => d.id === preselectDeviceId) : undefined;
  const [selected, setSelected] = useState<LoanerDevice[]>(preselect ? [preselect] : []);
  const [customer, setCustomer] = useState<{ name: string; kdnr: string } | null>(initialCustomer ?? null);
  const [expectedReturn, setExpectedReturn] = useState('');
  const [note, setNote] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addId, setAddId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIds = new Set(selected.map((d) => d.id));
  const availableOptions = devices
    .filter((d) => canCheckOut(d) && !selectedIds.has(d.id))
    .map((d) => ({ value: d.id, label: d.bezeichnung, hint: d.serialNumber }));

  function addById(id: string) {
    const dev = devices.find((d) => d.id === id);
    if (dev && !selectedIds.has(dev.id)) setSelected((s) => [...s, dev]);
    setAddId('');
  }

  async function addBySerial(serial: string) {
    setError(null);
    try {
      const hit = await findDeviceBySerial(serial);
      if (!hit) return setError(`Seriennummer „${serial}" nicht im Bestand.`);
      if (selectedIds.has(hit.device.id)) return; // already added
      if (hit.openLoanDevice || !canCheckOut(hit.device)) {
        return setError(`„${hit.device.bezeichnung}" ist nicht verfügbar (${hit.device.status}).`);
      }
      setSelected((s) => [...s, hit.device]);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  function removeDevice(id: string) {
    setSelected((s) => s.filter((d) => d.id !== id));
  }

  async function handleSubmit() {
    if (!customer) return setError('Bestandskunde wählen.');
    if (selected.length === 0) return setError('Mindestens ein Gerät hinzufügen.');
    setSaving(true);
    setError(null);
    try {
      const { loan } = await checkOut({
        customerName: customer.name,
        customerKdnr: customer.kdnr,
        ticketId: ticketId ?? null,
        expectedReturn: expectedReturn || null,
        note: note.trim() || null,
        deviceIds: selected.map((d) => d.id),
        createdBy: createdBy ?? null,
      });
      // Mesonic Leih-Lieferschein (Belegart 19) — fire-and-forget: die
      // Leihstellung ist bereits sicher gespeichert, ein Mesonic-Hänger darf
      // den Check-out nicht blockieren.
      void exportLoanBeleg(loan, selected).then((res) => {
        if (!res.ok && !res.skipped) console.warn('Leih-Lieferschein-Export fehlgeschlagen:', res.error);
      });
      onDone();
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(
        /unique|duplicate|23505/i.test(msg)
          ? 'Ein Gerät ist bereits verliehen — bitte Auswahl prüfen.'
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
          <span className="font-bold">Verleihen</span>
          <button onClick={onClose} aria-label="Schließen" className="text-white/70 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Customer */}
          <div>
            <label className={labelCls}>Bestandskunde *</label>
            {customer ? (
              <div className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 size={14} className="text-slate-400 flex-shrink-0" />
                  <span className="text-sm text-slate-700 truncate">{customer.name}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">#{customer.kdnr}</span>
                </div>
                <button onClick={() => setPickerOpen(true)} className="text-xs text-red-600 hover:text-red-700 flex-shrink-0">
                  Ändern
                </button>
              </div>
            ) : (
              <button
                onClick={() => setPickerOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-500 hover:border-red-400 hover:text-red-600"
              >
                <UserPlus size={15} /> Bestandskunde wählen
              </button>
            )}
          </div>

          {/* Devices */}
          <div>
            <label className={labelCls}>Geräte *</label>
            {selected.length > 0 && (
              <div className="border border-slate-100 rounded-lg divide-y divide-slate-100 mb-2">
                {selected.map((d) => (
                  <div key={d.id} className="flex items-center justify-between px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-700 truncate">{d.bezeichnung}</div>
                      <div className="text-xs font-mono text-slate-400 truncate">{d.serialNumber}</div>
                    </div>
                    <button onClick={() => removeDevice(d.id)} aria-label="Entfernen" className="text-slate-400 hover:text-red-600 flex-shrink-0">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select value={addId} onChange={addById} options={availableOptions} placeholder="Verfügbares Gerät hinzufügen…" />
              </div>
              <BarcodeScanButton onScan={addBySerial} ariaLabel="Seriennummer scannen" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Rückgabe erwartet</label>
            <DatePicker value={expectedReturn} onChange={setExpectedReturn} />
          </div>
          <div>
            <label className={labelCls}>Notiz</label>
            <textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Grund, Zubehör" />
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
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            <Plus size={15} /> {saving ? 'Verleihen…' : 'Verleihen'}
          </button>
        </div>
      </div>

      {pickerOpen && (
        <CustomerPicker
          onClose={() => setPickerOpen(false)}
          onSelect={(c: any) => {
            const kdnr = String(c.mesonicId || '').trim();
            if (!kdnr) {
              setError('Kunde ohne Kundennummer — bitte einen Bestandskunden mit Kd.-Nr. wählen.');
            } else {
              setCustomer({ name: c.company || c.name || 'Kunde', kdnr });
              setError(null);
            }
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
