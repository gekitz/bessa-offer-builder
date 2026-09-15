// Type A (RKSV) — Enroll-Snapshot + Segment-Filter für das Kampagnen-
// Back-Office. Rein, unit-getestet (rksvEnroll.test.ts). KEIN React/Supabase.
//
// Der Snapshot ist das Herzstück von M1: beim Enrol wird pro Empfänger
//   • knownHardwareNeeded  = viertl_licenses.hardware_needed, und
//   • versionOk            = versionOk(gastrotouch_version)   (SAME parse
//     logic wie der Wizard — importiert aus rksvVersion.ts)
// in payload gesnappt, sodass die öffentliche Landing-Page eine reine
// Funktion des Snapshots ist ("nur fragen, was wir NICHT berechnen können").
//
// WICHTIG (C1): versionOk === undefined (unbekannte/kaputte Version) wird
// NICHT als Schlüssel in payload gestampt — der Wizard muss "unbekannt"
// sehen und die Win10-Frage stellen. Wir setzen also NIE versionOk:false
// für unbekannt, und lassen den Schlüssel bei undefined ganz weg.

import { versionOk } from './rksvVersion';
import type { ViertlCustomerStatus, ViertlLicense, ViertlStatus } from '../../viertl/types';

export interface EnrollSubject {
  subjectType: 'viertl_license';
  subjectId: string;             // license UUID = Write-back-Schlüssel
  name: string | null;
  email: string | null;
  batch: string;
  payload: { knownHardwareNeeded: boolean; versionOk?: boolean };
}

// Purpose-built Segment-Filter für den Enrol. Die Prädikat-Logik spiegelt
// ViertlPage.filtered (gleiche Suchfelder), mit einer bewussten Umkehrung:
// ViertlPage hat noEmailOnly (nur fehlende E-Mail), hier withEmailOnly (nur
// vorhandene E-Mail). Default withEmailOnly=false, damit der erste Enrol
// auch das Druck-/kein-E-Mail-Segment erfasst (C3).
export interface ViertlSegmentFilter {
  search?: string;
  status?: ViertlStatus | 'all';
  customerStatus?: ViertlCustomerStatus | 'all';
  hardwareNeeded?: boolean;   // true ⇒ nur Lizenzen mit hardwareNeeded
  withEmailOnly?: boolean;    // true ⇒ nur Lizenzen MIT E-Mail (default false)
}

// Filtert Lizenzen für ein Enrol-Segment. Suchheu-Felder identisch zu
// ViertlPage: name + contact + ort + mesonicKdnr + hardwareModel.
export function filterLicensesForSegment(
  licenses: ViertlLicense[],
  f: ViertlSegmentFilter = {},
): ViertlLicense[] {
  const q = (f.search ?? '').trim().toLowerCase();
  return licenses.filter((l) => {
    if (f.status && f.status !== 'all' && l.status !== f.status) return false;
    if (f.customerStatus && f.customerStatus !== 'all' && l.customerStatus !== f.customerStatus) return false;
    if (f.hardwareNeeded && !l.hardwareNeeded) return false;
    if (f.withEmailOnly && !l.email) return false;
    if (q) {
      const hay = `${l.name} ${l.contact ?? ''} ${l.ort ?? ''} ${l.mesonicKdnr} ${l.hardwareModel ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// Baut den Enroll-Subject aus einer Lizenz + Batch-Label. Der versionOk-
// Schlüssel wird NUR gesetzt, wenn er nicht undefined ist (C1).
export function licenseToEnrollSubject(l: ViertlLicense, batch: string): EnrollSubject {
  const ok = versionOk(l.gastrotouchVersion);   // SAME parse als der Wizard
  const payload: EnrollSubject['payload'] = { knownHardwareNeeded: l.hardwareNeeded };
  if (ok !== undefined) payload.versionOk = ok;
  return {
    subjectType: 'viertl_license',
    subjectId: l.id,
    name: l.name,
    email: l.email,
    batch,
    payload,
  };
}
