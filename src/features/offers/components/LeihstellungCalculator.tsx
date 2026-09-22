import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { fmt } from '../../../lib/format';
import { ALL } from '../data/catalogs';
import {
  buildRentalOffer,
  softwareUnitPrice,
  rentalLineName,
  rentalNetto,
  hasNettoOverride,
  RENTAL_TERMS,
  RENTAL_HARDWARE,
  RENTAL_SERVICES,
  RENTAL_SOFTWARE_IDS,
  type RentalState,
  type RentalLine,
} from '../../../lib/rentalOffer';

// Parse a typed net override into a number. Tolerates "€", thousands dots and a
// German decimal comma; blank/invalid/negative → undefined (= no override).
function parseNettoOverride(raw: string): number | undefined {
  const cleaned = raw.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.');
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

// Input UI for a POS Leihstellung (rental). One timespan pill drives all the
// pricing; each line is a quantity stepper. Mirrors the source spreadsheet:
// hardware is a pooled cost basis divided by a break-even factor, services are
// fixed, and software prices come live from the bessa Kassa catalog. A sticky
// rail shows the running calculation and a preview of the single offer line.

interface Props {
  rental: RentalState;
  onChange: (next: RentalState) => void;
}

function Stepper({ qty, onStep }: { qty: number; onStep: (delta: number) => void }) {
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <button
        onClick={() => onStep(-1)}
        className="rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 active:scale-95 transition-transform"
        style={{ width: 30, height: 30 }}
        aria-label="Weniger"
      >
        <Minus size={13} />
      </button>
      <span className={`font-bold text-center ${qty ? 'text-slate-800' : 'text-slate-300'}`} style={{ width: 24, fontSize: 14 }}>{qty}</span>
      <button
        onClick={() => onStep(1)}
        className="rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 active:scale-95 transition-transform"
        style={{ width: 30, height: 30 }}
        aria-label="Mehr"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

function Row({
  name,
  hint,
  qty,
  onStep,
  lineTotal,
}: {
  name: string;
  hint: string;
  qty: number;
  onStep: (delta: number) => void;
  lineTotal: number;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 py-2 px-2.5 rounded-lg ${qty > 0 ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
      <div className="min-w-0">
        <div className="font-medium text-slate-800 truncate" style={{ fontSize: 13 }}>{name}</div>
        <div className="text-slate-400" style={{ fontSize: 11 }}>{hint}</div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`font-semibold tabular-nums text-right ${qty > 0 ? 'text-red-700' : 'text-slate-300 font-medium'}`}
          style={{ fontSize: 13, minWidth: 62 }}
        >
          {qty > 0 ? `€ ${fmt(lineTotal)}` : '–'}
        </span>
        <Stepper qty={qty} onStep={onStep} />
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  subtotal,
  subtotalLabel,
  children,
}: {
  title: string;
  subtitle: string;
  subtotal: number;
  subtotalLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-baseline justify-between px-3.5 py-2 bg-slate-50 border-b border-slate-100">
        <div className="min-w-0">
          <span className="font-bold text-slate-700" style={{ fontSize: 13 }}>{title}</span>
          <span className="text-slate-400 ml-2" style={{ fontSize: 11 }}>{subtitle}</span>
        </div>
        <span className="text-slate-500 flex-shrink-0" style={{ fontSize: 12 }}>
          {subtotalLabel && <span className="text-slate-400 mr-1">{subtotalLabel}</span>}
          <span className="font-semibold text-slate-700">€ {fmt(subtotal)}</span>
        </span>
      </div>
      <div className="p-1.5 space-y-0.5">{children}</div>
    </div>
  );
}

export default function LeihstellungCalculator({ rental, onChange }: Props) {
  const result = buildRentalOffer(rental);
  const term = result.term;
  const hasLines = result.hardwareLines.length + result.serviceLines.length + result.softwareLines.length > 0;

  const overridden = hasNettoOverride(rental);
  const effectiveNetto = rentalNetto(rental);

  // The override input keeps its own raw text so a German decimal comma can be
  // typed without the parsed number reformatting mid-entry. Re-seed only when
  // the persisted value changes from the outside (e.g. loading another offer).
  const [overrideText, setOverrideText] = useState(
    rental.nettoOverride != null ? String(rental.nettoOverride) : '',
  );
  useEffect(() => {
    if (parseNettoOverride(overrideText) !== rental.nettoOverride) {
      setOverrideText(rental.nettoOverride != null ? String(rental.nettoOverride) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rental.nettoOverride]);

  const onOverrideChange = (raw: string) => {
    setOverrideText(raw);
    onChange({ ...rental, nettoOverride: parseNettoOverride(raw) });
  };

  const setTerm = (key: RentalState['term']) => onChange({ ...rental, term: key });

  const step = (bucket: 'hardware' | 'services' | 'software', id: string, delta: number) => {
    const current = rental[bucket][id] || 0;
    const next = Math.max(0, current + delta);
    const bucketState = { ...rental[bucket] };
    if (next === 0) delete bucketState[id];
    else bucketState[id] = next;
    onChange({ ...rental, [bucket]: bucketState });
  };

  return (
    <div className="grid grid-cols-1 gap-4 items-start lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* LEFT: inputs */}
        <div className="space-y-4 min-w-0">
          {/* Timespan pills — drive every price below */}
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-slate-500 mb-2" style={{ fontSize: 12 }}>Laufzeit</div>
            <div className="flex gap-2">
              {RENTAL_TERMS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTerm(t.key)}
                  className={`flex-1 rounded-lg font-semibold transition-all py-2 ${
                    term.key === t.key ? 'bg-red-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                  style={{ fontSize: 13 }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Editable line title — text only, never touches the price. Lets the
              rep print the real duration (e.g. "1 Woche") even when the pricing
              uses the shortest available package. Empty falls back to the auto
              "Leihstellung POS, Laufzeit {label}" title (shown as placeholder). */}
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-slate-500 mb-2" style={{ fontSize: 12 }}>Bezeichnung im Angebot</div>
            <input
              type="text"
              value={rental.labelOverride ?? ''}
              onChange={(e) => onChange({ ...rental, labelOverride: e.target.value })}
              placeholder={`Leihstellung POS, Laufzeit ${term.label}`}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300"
              style={{ fontSize: 13 }}
            />
            <div className="text-slate-400 mt-1.5" style={{ fontSize: 11 }}>Leer lassen für den Standardtext. Ändert nur den Text, nicht den Preis.</div>
          </div>

          <Section title="Hardware" subtitle="Einstand gepoolt ÷ Break-Even" subtotal={result.hardwareSum} subtotalLabel="Basis">
            {RENTAL_HARDWARE.map((hw) => {
              const qty = rental.hardware[hw.id] || 0;
              return (
                <Row
                  key={hw.id}
                  name={hw.name}
                  hint={`Einstand € ${fmt(hw.einstand)}`}
                  qty={qty}
                  onStep={(d) => step('hardware', hw.id, d)}
                  lineTotal={qty * hw.einstand}
                />
              );
            })}
          </Section>

          <Section title="Dienstleistung" subtitle="fix, laufzeitunabhängig" subtotal={result.servicesSum}>
            {RENTAL_SERVICES.map((sv) => {
              const qty = rental.services[sv.id] || 0;
              return (
                <Row
                  key={sv.id}
                  name={sv.name}
                  hint={sv.hint ?? `€ ${fmt(sv.price)} / Stk`}
                  qty={qty}
                  onStep={(d) => step('services', sv.id, d)}
                  lineTotal={qty * sv.price}
                />
              );
            })}
          </Section>

          <Section title="Software" subtitle="Preise aus bessa Kassa" subtotal={result.softwareSum}>
            {RENTAL_SOFTWARE_IDS.map((id) => {
              const item = ALL[id];
              const qty = rental.software[id] || 0;
              const unit = softwareUnitPrice(id, term);
              return (
                <Row
                  key={id}
                  name={item?.name ?? id}
                  hint={`€ ${fmt(unit)} / Stk · ${term.label}`}
                  qty={qty}
                  onStep={(d) => step('software', id, d)}
                  lineTotal={qty * unit}
                />
              );
            })}
          </Section>
        </div>

        {/* RIGHT: sticky rail — calculation + offer-line preview */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5">
            <div className="uppercase tracking-wider text-red-600 font-semibold mb-2.5" style={{ fontSize: 11 }}>Kalkulation</div>
            <TotalRow
              label="Hardware"
              hint={result.hardwareSum > 0 ? `€ ${fmt(result.hardwareSum)} ÷ ${term.breakEven}` : undefined}
              value={result.hardwareRental}
            />
            <TotalRow label="Dienstleistung" value={result.servicesSum} />
            <TotalRow label="Software" value={result.softwareSum} />
            <div className="flex items-baseline justify-between pt-2.5 mt-1 border-t border-red-200">
              <span className="font-bold text-slate-800" style={{ fontSize: 15 }}>Netto</span>
              <span className="font-bold text-red-700 tabular-nums" style={{ fontSize: 20 }}>€ {fmt(result.netto)}</span>
            </div>
            <div className="flex items-baseline justify-between mt-1.5">
              <span className="text-slate-500" style={{ fontSize: 12 }}>Brutto · inkl. 20% USt</span>
              <span className="font-semibold text-slate-600 tabular-nums" style={{ fontSize: 13 }}>€ {fmt(result.brutto)}</span>
            </div>
          </div>

          {/* Manual net override — replaces the calculated netto as the offer
              line price. The calculated value above stays the reference; blank
              falls back to it (shown as placeholder). Customer only ever sees
              the final number. */}
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-slate-500" style={{ fontSize: 12 }}>Netto überschreiben</span>
              {overridden && (
                <button
                  onClick={() => onOverrideChange('')}
                  className="text-red-500 hover:text-red-600 font-medium"
                  style={{ fontSize: 11 }}
                >
                  Zurücksetzen
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" style={{ fontSize: 13 }}>€</span>
              <input
                type="text"
                inputMode="decimal"
                value={overrideText}
                onChange={(e) => onOverrideChange(e.target.value)}
                placeholder={fmt(result.netto)}
                className={`w-full rounded-lg border pl-7 pr-3 py-2 text-slate-800 tabular-nums placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-200 ${
                  overridden ? 'border-red-300 bg-red-50' : 'border-slate-200 focus:border-red-300'
                }`}
                style={{ fontSize: 13 }}
              />
            </div>
            <div className="text-slate-400 mt-1.5" style={{ fontSize: 11 }}>
              {overridden
                ? `Kalkuliert € ${fmt(result.netto)} wird durch den manuellen Wert ersetzt.`
                : 'Leer lassen für den kalkulierten Wert.'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2 bg-slate-800 text-white uppercase tracking-wider" style={{ fontSize: 11 }}>
              <span>Position im Angebot</span>
              <span className="opacity-60">1×</span>
            </div>
            <div className="px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-2.5">
                <span className="font-bold text-slate-800" style={{ fontSize: 14 }}>{rentalLineName(rental)}</span>
                <span className="font-bold text-slate-800 whitespace-nowrap tabular-nums" style={{ fontSize: 14 }}>€ {fmt(effectiveNetto)}</span>
              </div>
              {overridden && (
                <div className="text-red-500 mt-0.5" style={{ fontSize: 11 }}>
                  überschrieben · kalkuliert € {fmt(result.netto)}
                </div>
              )}
              {hasLines ? (
                <div className="mt-2 space-y-2" style={{ fontSize: 12 }}>
                  <DescGroup title="Hardware" lines={result.hardwareLines} />
                  <DescGroup title="Dienstleistung" lines={result.serviceLines} />
                  <DescGroup title="Software" lines={result.softwareLines} />
                </div>
              ) : (
                <div className="mt-2 text-slate-400 italic" style={{ fontSize: 12 }}>Noch nichts ausgewählt</div>
              )}
            </div>
          </div>
        </div>
    </div>
  );
}

function TotalRow({ label, hint, value }: { label: string; hint?: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <span className="text-slate-600" style={{ fontSize: 13 }}>
        {label}
        {hint && <span className="text-slate-400 ml-1.5" style={{ fontSize: 11 }}>{hint}</span>}
      </span>
      <span className="text-slate-700 font-medium tabular-nums" style={{ fontSize: 13 }}>€ {fmt(value)}</span>
    </div>
  );
}

function DescGroup({ title, lines }: { title: string; lines: RentalLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div>
      <div className="font-semibold text-slate-700">{title}:</div>
      {lines.map((l) => (
        <div key={l.id} className="text-slate-500">{l.qty}× {l.name}</div>
      ))}
    </div>
  );
}
