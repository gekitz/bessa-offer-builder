// Leihgeräte — shared display labels + formatters (German UI strings).

import type { LoanerDeviceStatus, MesonicStandort } from '../types';

export const STATUS_LABEL: Record<LoanerDeviceStatus, string> = {
  available: 'Verfügbar',
  on_loan: 'Verliehen',
  defective: 'Defekt',
  retired: 'Ausgemustert',
};

export const STATUS_PILL: Record<LoanerDeviceStatus, string> = {
  available: 'bg-green-100 text-green-700',
  on_loan: 'bg-amber-100 text-amber-700',
  defective: 'bg-red-100 text-red-700',
  retired: 'bg-slate-100 text-slate-500',
};

export const STANDORT_LABEL: Record<MesonicStandort, string> = {
  klagenfurt: 'Klagenfurt',
  wolfsberg: 'Wolfsberg',
};

export function formatEuro(n: number | null | undefined): string {
  if (n == null) return '–';
  return n.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
}

export function formatDateDe(iso: string | null | undefined): string {
  if (!iso) return '–';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
