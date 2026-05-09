import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  // Optional secondary text shown grayed-out on the right of the option.
  // e.g. employee role, weekly hours, location.
  hint?: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  // Wrapper className. Default is full-width; pass 'inline-block' or
  // similar to make the trigger inline-sized.
  className?: string;
  ariaLabel?: string;
}

const SIZE_CLASSES: Record<NonNullable<SelectProps['size']>, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
};

// Drop-in replacement for native <select>. Same value/onChange API,
// styled to match the rest of the form inputs (border-slate-200,
// red-500 focus). Click-outside and Escape close the popover.
//
// String values only — numeric callers should String()/Number() at
// the boundary (see e.g. the Raten dropdown in OfferView).
export default function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  size = 'md',
  className = '',
  ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Portal-positioned popover. Computed from the trigger's
  // bounding rect on open and on scroll/resize. We portal to body
  // so the listbox can escape modal `overflow-hidden` containers.
  const [popoverRect, setPopoverRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const selectedOption = options.find((o) => o.value === value);
  const triggerLabel = selectedOption?.label ?? placeholder ?? '';
  const showPlaceholder = !selectedOption;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function compute() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setPopoverRect({ left: r.left, top: r.bottom + 4, width: r.width });
    }
    compute();
    // Reposition on resize. Scroll closes (simpler than tracking
    // every ancestor scroll container).
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
    function handleScroll() {
      setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    // capture-phase scroll catches inner scroll containers (e.g. the
    // modal body) too, so the popover doesn't drift away from its
    // trigger.
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  function handleSelect(opt: SelectOption) {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
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
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={opt.disabled}
                onClick={() => handleSelect(opt)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                  opt.disabled
                    ? 'text-slate-300 cursor-not-allowed'
                    : selected
                      ? 'bg-red-50 text-red-700'
                      : 'text-slate-700 hover:bg-slate-50'
                }`}
                style={{ fontSize: 13 }}
              >
                <span className="flex-shrink-0 w-3.5">
                  {selected && <Check size={13} />}
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
