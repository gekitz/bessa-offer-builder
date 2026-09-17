// Leihgeräte — device-type tags (Gerätetyp-Schlagworte).
//
// A curated, composable vocabulary. Tags compose so a small set describes the
// fleet without an explosion of compound categories:
//   mobil + kassa            → mobiles Kassengerät (Handheld-POS ohne Drucker)
//   mobil + kassa + drucker  → mobiles Kassengerät mit integriertem Drucker
//   mobil + drucker          → mobiler Drucker (Standalone, kein POS)
//   drucker + stationaer     → stationärer Drucker
// The DB column is a free text[] (siehe migration 20260917130000); this list is
// the single source of truth for which tags the UI offers + how they're labeled.
// Add a new bucket by appending here — no migration needed.

export interface TagDef {
  value: string; // stable slug stored in the DB (ASCII, kebab-case)
  label: string; // German UI label
}

export const TAG_VOCAB: TagDef[] = [
  { value: 'mobil', label: 'Mobil' },
  { value: 'stationaer', label: 'Stationär' },
  { value: 'kassa', label: 'Kassengerät' },
  { value: 'drucker', label: 'Drucker' },
  { value: 'kundendisplay', label: 'Kundendisplay' },
  { value: 'access-point', label: 'Access Point' },
  { value: 'router', label: 'Router' },
  { value: 'terminal', label: 'Kartenterminal' },
  { value: 'monitor', label: 'Monitor' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

export const TAG_LABEL: Record<string, string> = Object.fromEntries(
  TAG_VOCAB.map((t) => [t.value, t.label]),
);

// Label for a stored tag, falling back to the raw slug for any legacy/unknown
// value so nothing silently disappears from a device's chip row.
export function tagLabel(value: string): string {
  return TAG_LABEL[value] ?? value;
}

// AND semantics: a device matches only if it carries every selected tag.
// Selecting nothing matches everything. This is what lets `mobil` + `drucker`
// narrow from "all handhelds" down to "handhelds that print".
export function deviceMatchesTags(
  deviceTags: readonly string[] | null | undefined,
  selected: readonly string[],
): boolean {
  if (selected.length === 0) return true;
  const have = new Set(deviceTags ?? []);
  return selected.every((t) => have.has(t));
}

// Count, per vocabulary tag, how many of the given devices carry it. Used to
// show a live count next to each option in the Typ filter. A device counted
// once per tag it holds (so the counts overlap by design — a mobile printer
// adds to both `mobil` and `drucker`).
export function countByTag(
  devices: ReadonlyArray<{ tags?: readonly string[] | null }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of TAG_VOCAB) counts[t.value] = 0;
  for (const d of devices) {
    for (const tag of d.tags ?? []) {
      if (tag in counts) counts[tag] += 1;
    }
  }
  return counts;
}
