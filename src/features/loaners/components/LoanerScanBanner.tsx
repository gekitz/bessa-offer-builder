import { useCallback, useEffect, useState } from 'react';
import { PackageOpen, ArrowRightLeft, Undo2, X, Loader2, Check } from 'lucide-react';
import { findDeviceBySerial, checkInDevice } from '../api/loanerApi';
import { postLoanCheckInCrmNote } from '../lib/loanCrmNote';
import { mesonicImport, TYPES, TEMPLATES } from '../../../lib/mesonicApi';
import { formatDateDe, todayIso } from '../lib/loanerFormat';
import CheckOutModal from './CheckOutModal';
import type { Loan, LoanDevice, LoanerDevice } from '../types';

// Recognition banner for the Lieferschein page: when a scanned serial belongs
// to a loaner device, this surfaces its status + the matching inline action
// (Verleihen when available, Rückgabe when out). Renders nothing when the
// serial isn't a loaner — so it only interrupts when relevant. All Mesonic/DB
// logic stays in the loaners feature. Siehe docs/leihstellungen.md.

interface Props {
  serial: string;
  // This ticket's customer — prefilled into check-out.
  customerName?: string | null;
  customerKdnr?: string | null;
  ticketId?: string | null;
  createdBy?: string | null;
  onDismiss: () => void;
}

interface Hit {
  device: LoanerDevice;
  openLoan: Loan | null;
  openLoanDevice: LoanDevice | null;
}

export default function LoanerScanBanner({ serial, customerName, customerKdnr, ticketId, createdBy, onDismiss }: Props) {
  const [loading, setLoading] = useState(true);
  const [hit, setHit] = useState<Hit | null>(null);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const lookup = useCallback(async () => {
    setLoading(true);
    setDone(null);
    try {
      const res = await findDeviceBySerial(serial);
      setHit(res && res.device ? { device: res.device, openLoan: res.openLoan, openLoanDevice: res.openLoanDevice } : null);
    } catch {
      setHit(null);
    } finally {
      setLoading(false);
    }
  }, [serial]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await lookup();
    })();
    return () => {
      cancelled = true;
    };
  }, [lookup]);

  async function handleCheckIn() {
    if (!hit?.openLoanDevice || !hit.openLoan) return;
    setCheckingIn(true);
    try {
      await checkInDevice(hit.openLoanDevice.id, { returnedAt: todayIso() });
      void postLoanCheckInCrmNote(hit.openLoan, [hit.device], {
        importCrm: (xml) => mesonicImport(TYPES.CRM, TEMPLATES.CRM, xml, { actionCode: 1 }),
      });
      setDone('Zurückgenommen.');
      await lookup();
    } finally {
      setCheckingIn(false);
    }
  }

  // Not a loaner device → stay invisible (only interrupt when relevant).
  if (!loading && !hit) return null;

  const initialCustomer = customerName && customerKdnr ? { name: customerName, kdnr: customerKdnr } : null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <PackageOpen size={15} className="text-amber-600 flex-shrink-0" />
        {loading ? (
          <span className="text-sm text-amber-800 flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" /> Leihgerät wird geprüft…
          </span>
        ) : hit ? (
          <>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-amber-900">Leihgerät: {hit.device.bezeichnung}</span>
              <span className="text-xs font-mono text-amber-700 ml-2">{hit.device.serialNumber}</span>
              <div className="text-xs text-amber-700">
                {done
                  ? done
                  : hit.openLoan
                    ? `Verliehen an ${hit.openLoan.customerName} seit ${formatDateDe(hit.openLoan.startedAt)}`
                    : hit.device.status === 'available'
                      ? 'Verfügbar im Bestand'
                      : `Status: ${hit.device.status}`}
              </div>
            </div>
            {!done && hit.device.status === 'available' && (
              <button
                type="button"
                onClick={() => setCheckOutOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 flex-shrink-0"
              >
                <ArrowRightLeft size={13} /> Verleihen
              </button>
            )}
            {!done && hit.openLoan && hit.openLoanDevice && (
              <button
                type="button"
                onClick={handleCheckIn}
                disabled={checkingIn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 text-white text-xs font-medium hover:bg-slate-900 disabled:opacity-50 flex-shrink-0"
              >
                {checkingIn ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />} Rückgabe
              </button>
            )}
            {done && <Check size={15} className="text-emerald-600 flex-shrink-0" />}
          </>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Schließen"
          className="text-amber-500 hover:text-amber-700 flex-shrink-0"
        >
          <X size={15} />
        </button>
      </div>

      {checkOutOpen && hit && (
        <CheckOutModal
          devices={[hit.device]}
          preselectDeviceId={hit.device.id}
          initialCustomer={initialCustomer}
          ticketId={ticketId}
          createdBy={createdBy}
          onClose={() => setCheckOutOpen(false)}
          onDone={async () => {
            setCheckOutOpen(false);
            setDone('Verliehen.');
            await lookup();
          }}
        />
      )}
    </div>
  );
}
