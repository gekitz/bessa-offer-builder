// Categorical reasons for marking an offer as Verloren. Stored on
// offers.lost_reason and constrained at the DB level (CHECK enum).
//
// Keep this list in sync with the migration that introduced
// lost_reason — changing/renaming an id requires a data-migration
// step too. Adding new ids: also extend the DB CHECK constraint.

export type LostReasonId =
  | 'price'
  | 'competitor'
  | 'timing'
  | 'feature_gap'
  | 'no_response'
  | 'internal_decision'
  | 'other';

export interface LostReason {
  id: LostReasonId;
  // Short label for the chip itself.
  label: string;
  // Longer description shown as a tooltip / help text.
  hint: string;
}

// Order is the visual order of the chips. Most-common reasons first
// so reps don't have to scan the whole row.
export const LOST_REASONS: LostReason[] = [
  { id: 'price',              label: 'Preis / Budget',          hint: 'Zu teuer oder kein Budget freigegeben.' },
  { id: 'competitor',         label: 'Mitbewerber',             hint: 'Hat sich für einen anderen Anbieter entschieden.' },
  { id: 'timing',             label: 'Timing / kein Bedarf',    hint: 'Aktuell nicht relevant, vielleicht später.' },
  { id: 'feature_gap',        label: 'Funktion fehlt',          hint: 'Lösung passt fachlich nicht.' },
  { id: 'no_response',        label: 'Keine Antwort',           hint: 'Trotz Nachfassen kein Feedback bekommen.' },
  { id: 'internal_decision',  label: 'Intern entschieden',      hint: 'Selbstbau, Outsourcing, anderes Projekt priorisiert.' },
  { id: 'other',              label: 'Sonstiges',               hint: 'Anderer Grund — bitte unten kurz erläutern.' },
];

export function getLostReason(id: LostReasonId): LostReason {
  const r = LOST_REASONS.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown lost reason: ${id}`);
  return r;
}

// Safe lookup that returns null instead of throwing — used by UI
// renderers that may receive legacy values from before this feature
// shipped or stale rows from another tab.
export function lostReasonLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  const r = LOST_REASONS.find((x) => x.id === id);
  return r ? r.label : null;
}
