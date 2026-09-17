import { TAG_VOCAB } from '../lib/deviceTags';

// Toggle-chip row for assigning device-type tags in the add/edit form.
// Controlled: `value` is the selected slugs, `onChange` gets the next array.

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export default function TagChips({ value, onChange }: Props) {
  const selected = new Set(value);
  function toggle(slug: string) {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    // Preserve vocabulary order for stable storage/display.
    onChange(TAG_VOCAB.filter((t) => next.has(t.value)).map((t) => t.value));
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {TAG_VOCAB.map((t) => {
        const on = selected.has(t.value);
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => toggle(t.value)}
            aria-pressed={on}
            className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
              on ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
