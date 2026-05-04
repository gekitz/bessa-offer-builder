import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  // ISO 'YYYY-MM-DD' or '' for unset.
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
  // Optional inclusive bounds. Days outside the range are
  // greyed out and not selectable.
  min?: string;
  max?: string;
}

const SIZE_CLASSES: Record<NonNullable<DatePickerProps['size']>, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
};

const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

// Mon-first weekdays — matches Austrian convention.
const WEEKDAYS_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function fromIso(s: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

function todayIso(): string {
  const d = new Date();
  return toIso(d.getFullYear(), d.getMonth(), d.getDate());
}

// Days in a Mon-first 6-row grid for the given (year, month).
// Returns 42 entries with a `current` flag indicating whether the
// day belongs to the visible month.
function buildGrid(year: number, month: number) {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  // 0 = Sunday; convert to Mon-first (Mon=0..Sun=6)
  const dow = (firstOfMonth.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month, 1 - dow));
  const cells: Array<{ year: number; month: number; day: number; current: boolean; iso: string }> = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    cells.push({ year: y, month: m, day, current: m === month, iso: toIso(y, m, day) });
  }
  return cells;
}

function formatGerman(iso: string): string {
  const p = fromIso(iso);
  if (!p) return '';
  return `${pad(p.day)}.${pad(p.month + 1)}.${p.year}`;
}

// Custom calendar popover — drop-in replacement for
// <input type="date">. Display format is German DD.MM.YYYY,
// values stay ISO YYYY-MM-DD.
export default function DatePicker({
  value,
  onChange,
  placeholder = 'Datum wählen',
  disabled = false,
  size = 'md',
  className = '',
  ariaLabel,
  min,
  max,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // The calendar's currently-rendered month/year. Reset to the value's
  // month each time the picker opens. Defaults to the current month.
  const [viewYear, setViewYear] = useState<number>(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => new Date().getMonth());

  useEffect(() => {
    if (!open) return;
    const parsed = fromIso(value) ?? fromIso(todayIso())!;
    setViewYear(parsed.year);
    setViewMonth(parsed.month);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const grid = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const today = todayIso();

  function handlePrev() {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }
  function handleNext() {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }
  function handlePick(iso: string) {
    if (min && iso < min) return;
    if (max && iso > max) return;
    onChange(iso);
    setOpen(false);
  }
  function handleToday() {
    handlePick(today);
  }
  function handleClear() {
    onChange('');
    setOpen(false);
  }

  const sizeClass = SIZE_CLASSES[size];

  return (
    <div ref={wrapperRef} className={`relative ${className || 'w-full'}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 border rounded-lg bg-white text-left transition-colors ${sizeClass} ${
          disabled
            ? 'border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50'
            : open
              ? 'border-red-500 ring-1 ring-red-500 outline-none'
              : 'border-slate-200 text-slate-700 hover:border-slate-300'
        }`}
      >
        <span className={`truncate ${value ? '' : 'text-slate-400'}`}>
          {value ? formatGerman(value) : placeholder}
        </span>
        <Calendar size={14} className="text-slate-400 flex-shrink-0" />
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute left-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg p-3 z-50"
          style={{ width: 280 }}
        >
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={handlePrev}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Vorheriger Monat"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="font-semibold text-slate-700" style={{ fontSize: 13 }}>
              {MONTHS_DE[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Nächster Monat"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS_DE.map((w) => (
              <div
                key={w}
                className="text-center text-slate-400 font-medium"
                style={{ fontSize: 10 }}
              >
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {grid.map((cell, i) => {
              const isSelected = cell.iso === value;
              const isToday = cell.iso === today;
              const outOfBounds = (min && cell.iso < min) || (max && cell.iso > max);
              const interactiveClass = outOfBounds
                ? 'text-slate-300 cursor-not-allowed'
                : isSelected
                  ? 'bg-red-600 text-white font-semibold hover:bg-red-700'
                  : !cell.current
                    ? 'text-slate-300 hover:bg-slate-50'
                    : isToday
                      ? 'text-red-600 font-semibold hover:bg-red-50'
                      : 'text-slate-700 hover:bg-slate-100';
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handlePick(cell.iso)}
                  disabled={!!outOfBounds}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${interactiveClass}`}
                  style={{ fontSize: 12 }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleToday}
              className="text-red-600 hover:text-red-700 font-medium"
              style={{ fontSize: 11 }}
            >
              Heute
            </button>
            {value && (
              <button
                type="button"
                onClick={handleClear}
                className="text-slate-400 hover:text-slate-600"
                style={{ fontSize: 11 }}
              >
                Zurücksetzen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
