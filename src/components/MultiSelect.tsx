import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import type { SelectOption } from './Select';

interface MultiSelectProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: SelectOption[];
  // Trigger label when nothing is selected (empty = no restriction).
  placeholder?: string;
  // Noun for the "{n} ausgewählt" trigger label (e.g. 'Status').
  summaryNoun?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  // Wrapper className. Default is full-width; pass 'inline-block' or
  // similar to make the trigger inline-sized.
  className?: string;
  ariaLabel?: string;
}

const SIZE_CLASSES: Record<NonNullable<MultiSelectProps['size']>, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
};

// Multi-select sibling of Select. Same portal/positioning/dismiss
// behaviour, but the popover stays open while you toggle options and
// each row carries a checkbox. An empty selection means "no filter"
// (the placeholder is shown). String values only.
export default function MultiSelect({
  values,
  onChange,
  options,
  placeholder,
  summaryNoun,
  disabled = false,
  size = 'md',
  className = '',
  ariaLabel,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverRect, setPopoverRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const selectedSet = new Set(values);
  const selectedOptions = options.filter((o) => selectedSet.has(o.value));
  let triggerLabel = placeholder ?? '';
  if (selectedOptions.length === 1) triggerLabel = selectedOptions[0].label;
  else if (selectedOptions.length > 1) triggerLabel = `${selectedOptions.length} ${summaryNoun ?? 'ausgewählt'}`;
  const showPlaceholder = selectedOptions.length === 0;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function compute() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setPopoverRect({ left: r.left, top: r.bottom + 4, width: r.width });
    }
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function handleScroll(e: Event) {
      if (popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  function toggle(opt: SelectOption) {
    if (opt.disabled) return;
    onChange(selectedSet.has(opt.value)
      ? values.filter((v) => v !== opt.value)
      : [...values, opt.value]);
  }

  const sizeClass = SIZE_CLASSES[size];

  return (
    <div ref={wrapperRef} className={`relative ${className || 'w-full'}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 border rounded-lg bg-white text-left transition-colors ${sizeClass} ${
          disabled
            ? 'border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50'
            : open
              ? 'border-red-500 ring-1 ring-red-500 outline-none'
              : 'border-slate-200 text-slate-700 hover:border-slate-300'
        }`}
      >
        <span className={`truncate ${showPlaceholder ? 'text-slate-400' : ''}`}>{triggerLabel}</span>
        <ChevronDown
          size={14}
          className={`text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && popoverRect && createPortal(
        <div
          ref={popoverRef}
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: 'fixed',
            left: popoverRect.left,
            top: popoverRect.top,
            width: popoverRect.width,
            zIndex: 60,
          }}
          className="bg-white rounded-xl border border-slate-200 shadow-lg py-1 max-h-60 overflow-auto"
        >
          {options.length === 0 && (
            <div className="px-3 py-2 text-slate-400" style={{ fontSize: 12 }}>
              Keine Optionen
            </div>
          )}
          {options.map((opt) => {
            const selected = selectedSet.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={opt.disabled}
                onClick={() => toggle(opt)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                  opt.disabled
                    ? 'text-slate-300 cursor-not-allowed'
                    : selected
                      ? 'bg-red-50 text-red-700'
                      : 'text-slate-700 hover:bg-slate-50'
                }`}
                style={{ fontSize: 13 }}
              >
                <span
                  className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                    selected ? 'bg-red-600 border-red-600 text-white' : 'border-slate-300'
                  }`}
                >
                  {selected && <Check size={12} />}
                </span>
                <span className="flex-1 truncate">{opt.label}</span>
                {opt.hint && (
                  <span className="text-slate-400 flex-shrink-0" style={{ fontSize: 11 }}>{opt.hint}</span>
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
