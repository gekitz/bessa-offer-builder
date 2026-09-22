// Type A (RKSV Signaturkarte) — reines Verzweigungsmodul des Landing-
// Wizards. KEIN React, KEIN Supabase. Erschöpfend unit-getestet
// (rksvWizard.test.ts).
//
// Hintergrund (docs/outreach-campaigns.md): eine E-Mail an alle im
// Segment; die technische Verzweigung wird an einen vorbefüllten Wizard
// im Moment des Engagements verschoben, weil die Vorbedingung (WIN10
// 64bit + aktuelle Gastrotouch-Version) eine Frage ist, die der Kunde
// nicht beantworten kann und unsere Daten halb leer sind.
//
// Serverseitig vorab aufgelöst (beim Enroll, in payload gesnappt):
//   • versionOk       — gastrotouch_version >= VERSION_THRESHOLD
//   • hardwareNeeded   — viertl_licenses.hardware_needed
// Der Wizard fragt nur, was wir NICHT berechnen können.

// Versions-Helfer leben jetzt in rksvVersion.ts (geteilt mit dem Enroll-
// Snapshot), werden hier aber re-exportiert, damit bestehende Importe
// (rksvWizard.test.ts) unverändert grün bleiben.
export { VERSION_THRESHOLD, parseVersion, versionOk } from './rksvVersion';

export interface RksvKnown {
  hardwareNeeded?: boolean;   // aus viertl_licenses.hardware_needed (undefined = unbekannt)
  versionOk?: boolean;        // gastrotouch_version >= VERSION_THRESHOLD (undefined = unbekannt)
}

export interface RksvAnswers {
  hasWin10?: 'ja' | 'nein' | 'weiss_nicht';
  setupSize?: 'einzelplatz' | 'mehrplatz';
}

export type RksvStep =
  | { kind: 'question'; id: 'has_win10' }     // "Haben Sie eine Kasse mit Windows 10?"
  | { kind: 'question'; id: 'setup_size' }    // Einzelplatz | Mehrplatz
  | { kind: 'terminal'; id: 'authorize' }     // "Auftrag erteilen" (preis-freie Signatur)
  | { kind: 'terminal'; id: 'request_quote' } // "Angebot anfordern"
  | { kind: 'terminal'; id: 'soft_check' };   // "Das prüfen wir für Sie"

// Berechnet den nächsten Schritt aus dem serverseitig aufgelösten Kontext
// (known) + den bisherigen Antworten. Rein & monoton: gleiche Eingabe →
// gleicher Schritt.
export function nextStep(known: RksvKnown, answers: RksvAnswers): RksvStep {
  // Null-Fragen-Schnellpfad: nur wenn BEIDE bekannt sind (hardwareNeeded
  // === false ist der un-triagierte Default in Viertl → nicht blind
  // vertrauen; erst mit versionOk===true "bereit, keine Fragen").
  if (
    known.hardwareNeeded === false &&
    known.versionOk === true &&
    !answers.hasWin10
  ) {
    return { kind: 'terminal', id: 'authorize' };
  }

  // 1) hardwareNeeded bekannt-true → Win10-Frage überspringen; der Kunde
  //    braucht neue Hardware. Nur die Setup-Größe fragen.
  if (known.hardwareNeeded === true) {
    if (!answers.setupSize) return { kind: 'question', id: 'setup_size' };
    return { kind: 'terminal', id: 'request_quote' };
  }

  // 2) Hardware unbekannt (undefined) oder false → Win10-Frage stellen.
  if (!answers.hasWin10) return { kind: 'question', id: 'has_win10' };

  if (answers.hasWin10 === 'ja') {
    // Bereit → preis-freie Autorisierung.
    return { kind: 'terminal', id: 'authorize' };
  }

  if (answers.hasWin10 === 'nein') {
    // Neue Hardware nötig → Setup-Größe → Angebot anfordern.
    if (!answers.setupSize) return { kind: 'question', id: 'setup_size' };
    return { kind: 'terminal', id: 'request_quote' };
  }

  // 'weiss_nicht' — erstklassig: Remote-OS-Check + Rückruf (soft auth).
  return { kind: 'terminal', id: 'soft_check' };
}
