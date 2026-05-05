import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  // Optional inline label rendered to the right of the box.
  // Wraps children in a <span class="select-none"> so clicking the
  // text toggles the checkbox without selecting the label text.
  children?: ReactNode;
}

// Drop-in replacement for native <input type="checkbox">. The native
// input is kept (visually hidden) so that form semantics, keyboard
// activation (Space), and screen-reader behaviour all continue to
// work; the visible box is a styled <span> sibling.
export default function Checkbox({
  checked,
  onChange,
  disabled = false,
  className = '',
  ariaLabel,
  children,
}: CheckboxProps) {
  return (
    <label
      className={`inline-flex items-center gap-2 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-label={ariaLabel}
        className="peer sr-only"
      />
      <span
        className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-red-300 ${
          checked
            ? 'bg-red-600 border-red-600'
            : 'bg-white border-slate-300 hover:border-slate-400'
        }`}
      >
        <Check
          size={11}
          strokeWidth={3}
          className={`text-white transition-opacity ${checked ? 'opacity-100' : 'opacity-0'}`}
        />
      </span>
      {children && <span className="select-none">{children}</span>}
    </label>
  );
}
