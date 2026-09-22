// Gastrotouch-Versions-Parsing für Type A (RKSV). Aus rksvWizard.ts
// extrahiert, damit BEIDE Pfade dieselbe Logik nutzen:
//   • der Landing-Wizard (rksvWizard.ts re-exportiert von hier), und
//   • der Enroll-Snapshot (rksvEnroll.ts berechnet versionOk beim Enrol),
// sodass es keine zweite, driftende Implementierung gibt (Finding M1:
// "SAME parse logic as rksvWizard.ts"). Rein, kein React/Supabase.

export const VERSION_THRESHOLD = 67.25;

// Parst die frei-Text Gastrotouch-Version (z. B. '67.24', '66.00', NULL,
// Müll) in eine Zahl. NULL/nicht-numerisch → null (= unbekannt), damit der
// Aufrufer versionOk als undefined behandeln kann.
export function parseVersion(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const m = String(raw).trim().match(/^\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

// versionOk = Version >= VERSION_THRESHOLD. null-Version → undefined
// (unbekannt), sodass der Wizard nicht auf einer Vermutung verzweigt.
export function versionOk(raw: string | null | undefined): boolean | undefined {
  const v = parseVersion(raw);
  if (v == null) return undefined;
  return v >= VERSION_THRESHOLD;
}
