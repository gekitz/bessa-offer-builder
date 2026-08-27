// Kontaktdaten (v. a. E-Mail) aus Mesonic ziehen — für Phase 2 des
// Viertl-Trackers. Nutzt exakt die Leseschiene, die auch die CRM-Ansicht
// verwendet: WebKontenExport per Kontonummer (= viertl_licenses.mesonic_kdnr),
// über die mesonic-proxy Edge-Funktion.
//
// getCustomer(kdnr) liefert { records: [record] }; die Felder tragen je
// nach WinLine-Konfiguration Klartext- oder Spalten-Keys (Email /
// T055_C013 …), daher die Fallback-Kette wie in CrmPage.jsx.

import { getCustomer } from '../../../lib/mesonicApi';

export interface MesonicContact {
  email: string | null;
  phone: string | null;
  mobile: string | null;
  contact: string | null;
}

// Erstes nicht-leeres Feld aus einer Alias-Liste (case-insensitiv wäre
// zu riskant — Mesonic-Keys sind stabil, wir matchen exakt).
function pick(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = record[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

// Reiner Extractor (unit-testbar) — spiegelt die F-Accessoren in CrmPage.
export function extractContact(record: Record<string, unknown> | null | undefined): MesonicContact {
  if (!record) return { email: null, phone: null, mobile: null, contact: null };
  return {
    email:   pick(record, 'Email', 'E-Mail', 'EMail', 'T055_C013', 'T055.C013'),
    phone:   pick(record, 'Telefon', 'Tel', 'T055_C011', 'T055.C011'),
    mobile:  pick(record, 'Mobiltelefon', 'Mobil', 'Handy', 'T055_C082', 'T055.C082'),
    contact: pick(record, 'Ansprechpartner', 'Kontakt', 'T055_C061', 'T055.C061'),
  };
}

// Live-Abruf für eine Kundennummer. Wirft, wenn der Proxy fehlschlägt;
// liefert leere Kontaktfelder, wenn Mesonic keinen Datensatz kennt.
export async function fetchMesonicContact(mesonicKdnr: string): Promise<MesonicContact> {
  const res = (await getCustomer(mesonicKdnr)) as { records?: Record<string, unknown>[] } | null;
  const record = res?.records?.[0] ?? null;
  return extractContact(record);
}
