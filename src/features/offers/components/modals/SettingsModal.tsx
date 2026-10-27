import { X } from 'lucide-react';
import Select from '../../../../components/Select';

// Owner-only Einstellungen, reached via the cog in the sidebar footer. Collects
// the app-level levers that used to clutter the offer tool:
//   • Stripe-Integration — whether accepted offers charge via Stripe.
//   • Hardware-Abschreibung — the global Miete amortisation horizon (months)
//     over which the one-time bucket (Hardware + Einrichtung) is recovered in
//     the rent. "Standard" = spread over the Laufzeit (rent unchanged); a
//     shorter horizon recovers hardware faster (higher early rent that then
//     steps down), a longer one lowers the monthly. The chosen value is baked
//     into each offer at save, so the accept page / Stripe charge match.
// Each setting only renders when the caller grants it, so a non-owner opening
// the (hidden) modal would see nothing actionable.

// Amortisation horizons offered, in months. Mirrors the earlier 8/12/16 study
// plus the longer horizons a multi-year rental can use.
const AMORT_OPTIONS = [6, 8, 10, 12, 14, 16, 18, 24, 36];

interface Props {
  onClose: () => void;
  canEditBilling?: boolean;
  billingToggle?: boolean;
  onToggleBilling?: (v: boolean) => void;
  canEditAmort?: boolean;
  amortMonths?: number | null;
  onChangeAmort?: (v: number | null) => void;
}

export default function SettingsModal({
  onClose,
  canEditBilling = false,
  billingToggle = false,
  onToggleBilling,
  canEditAmort = false,
  amortMonths = null,
  onChangeAmort,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between">
          <span className="font-bold truncate mr-2" style={{ fontSize: 16 }}>Einstellungen</span>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20 flex-shrink-0" aria-label="Schließen">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {canEditBilling && (
            <div className="flex items-center justify-between">
              <div className="min-w-0 mr-3">
                <div className="text-slate-700 font-medium" style={{ fontSize: 14 }}>Stripe-Integration</div>
                <div className="text-slate-400" style={{ fontSize: 12 }}>
                  Angenommene Angebote per Stripe abrechnen
                </div>
              </div>
              <button
                onClick={() => onToggleBilling?.(!billingToggle)}
                className={`relative inline-flex items-center rounded-full transition-colors flex-shrink-0 ${billingToggle ? 'bg-red-500' : 'bg-slate-300'}`}
                style={{ width: 40, height: 22 }}
                title={billingToggle ? 'Stripe-Integration aktiv' : 'Stripe-Integration aus'}
                role="switch"
                aria-checked={billingToggle}
                aria-label="Stripe-Integration"
              >
                <span
                  className="inline-block bg-white rounded-full shadow"
                  style={{
                    width: 18, height: 18,
                    transform: billingToggle ? 'translateX(20px)' : 'translateX(2px)',
                    transition: 'transform 120ms ease',
                  }}
                />
              </button>
            </div>
          )}

          {canEditAmort && (
            <div className={canEditBilling ? 'pt-5 border-t border-slate-100' : ''}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-slate-700 font-medium" style={{ fontSize: 14 }}>Hardware-Abschreibung</div>
                  <div className="text-slate-400" style={{ fontSize: 12 }}>
                    Miete: Zeitraum für Hardware + Einrichtung
                  </div>
                </div>
                <Select
                  value={amortMonths ? String(amortMonths) : ''}
                  onChange={(v) => onChangeAmort?.(v ? Number(v) : null)}
                  size="sm"
                  className="w-32 flex-shrink-0"
                  options={[
                    { value: '', label: 'Standard' },
                    ...AMORT_OPTIONS.map((n) => ({ value: String(n), label: `${n} Monate` })),
                  ]}
                />
              </div>
              <p className="text-slate-400 mt-2" style={{ fontSize: 11 }}>
                „Standard“ verteilt die Einmalkosten auf die Laufzeit (Miete unverändert).
                Kürzer = schnellere Amortisation, höhere Anfangsmiete die danach sinkt.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
