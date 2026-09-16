// Which product catalogs hold physical, loanable hardware — drives the loaner
// device product picker. Allowlist (not denylist) so a future software/service
// catalog can't leak in. Verified against the live catalog taxonomy 2026-09-16:
// excluded are the software/service catalogs BESSA, MELZER (= X3000),
// GASTROTOUCH and DIENSTLEISTUNGEN (Fiskalisierung lives under these).
// Siehe docs/leihstellungen.md.

export const HARDWARE_CATALOGS: ReadonlySet<string> = new Set([
  'HARDWARE',
  'UNIFY',
  'DRUCKER',
  'KUECHENMONITORE',
  'KUECHENMONITORE_SUNMI',
  'KIOSK',
  'ORDERMAN',
  'RCH',
  'SHARP',
  'SHARP_ZUBEHOR',
  'BROTHER',
]);

export interface HardwareProductLike {
  name: string;
  catalog: string;
  category?: string | null;
  active?: boolean;
}

export function isHardwareProduct(p: Pick<HardwareProductLike, 'catalog'>): boolean {
  return HARDWARE_CATALOGS.has(p.catalog);
}

// Hardware products matching a free-text query (name / catalog / category),
// active only, sorted by name, capped. Empty query → all hardware (capped).
export function searchHardwareProducts<T extends HardwareProductLike>(
  products: T[],
  query: string,
  limit = 50,
): T[] {
  const q = query.trim().toLowerCase();
  return products
    .filter((p) => (p.active ?? true) && HARDWARE_CATALOGS.has(p.catalog))
    .filter((p) => !q || `${p.name} ${p.catalog} ${p.category ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
}
