import type { Shift, ShiftSlotKind, SlotKindCode } from '../types';

// Short label shown on calendar chips: "Fr 13–18", "Sa 10–18", etc.
export function shortSlotLabel(code: SlotKindCode): string {
  switch (code) {
    case 'fri_pm':  return 'Fr Nm';
    case 'sat':     return 'Sa';
    case 'sun':     return 'So';
    case 'holiday': return 'Feiertag';
  }
}

// Long label for detail modal: "Freitag Nachmittag · 13:00–18:00".
export function longSlotLabel(kind: ShiftSlotKind | undefined, code: SlotKindCode): string {
  if (!kind) return shortSlotLabel(code);
  return `${kind.label} · ${kind.startTime}–${kind.endTime}`;
}

// Group shifts by date for cell-level rendering.
export function groupShiftsByDate(shifts: Shift[]): Map<string, Shift[]> {
  const out = new Map<string, Shift[]>();
  for (const s of shifts) {
    const arr = out.get(s.date);
    if (arr) arr.push(s);
    else out.set(s.date, [s]);
  }
  return out;
}

// First name only for compact chip text.
export function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}
