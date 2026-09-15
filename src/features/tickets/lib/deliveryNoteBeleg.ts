// Lieferschein-Positionen → WinLine-Angebot-Positionen (Belegart 19).
//
// Reiner Datentransform, keine Supabase-/Netzwerk-Aufrufe — die Mesonic-Mechanik
// (Envelope, XSD-Reihenfolge, Belegart) steckt in offers/lib/angebotImport.ts.
// Siehe docs/ticket-lieferschein.md.
//
// Mapping (fixiert mit Georg):
//   echtes Produkt (mesonicArtikelNr gesetzt) → Datentyp 1, echte Artikelnummer
//       inkl. Standort-Ausprägung (KL/WO) — die gelieferte Ware muss vom
//       richtigen Lager abgebucht werden (mesonicArtikelForStandort).
//   Freitext / Produkt ohne Artikelnummer      → Datentyp 3, Artikelnummer 'TEXT'
//   Menge = quantity, Einzelpreis = unitPrice (NETTO).
//   Seriennummern werden in die Bezeichnung gefaltet:
//       "4x Sunmi L3 <s1>, <s2>, <s3>, <s4>"
//   (Menge bleibt separat im Mengegeliefert-Feld; das "4x" im Text ist so mit
//    Georg fixiert.)

import { mesonicArtikelForStandort, type AngebotPosition } from '../../offers/lib/angebotImport';
import type { MesonicStandort } from './repairOrderBeleg';
import type { DeliveryNoteItem } from '../types';

// Menge ohne unnötige Nachkommastellen für das "{qty}x"-Präfix.
function qtyLabel(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : String(quantity);
}

// Bezeichnung inkl. eingefalteter Seriennummern.
export function foldSerialsIntoBezeichnung(item: Pick<DeliveryNoteItem, 'bezeichnung' | 'quantity' | 'serialNumbers'>): string {
  const serials = (item.serialNumbers ?? []).map((s) => s.trim()).filter(Boolean);
  if (serials.length === 0) return item.bezeichnung;
  return `${qtyLabel(item.quantity)}x ${item.bezeichnung} ${serials.join(', ')}`;
}

// Ein Lieferschein (DeliveryNoteItem[]) → Angebot-Positionen. Leere/0-Mengen-
// Positionen werden übersprungen. Der Standort bestimmt die KL/WO-Ausprägung
// der echten Artikelnummern (Lagerbuchung).
export function deliveryNoteToBelegPositions(
  items: DeliveryNoteItem[],
  standort: MesonicStandort,
): AngebotPosition[] {
  const out: AngebotPosition[] = [];
  for (const item of items) {
    if (!item.quantity || item.quantity <= 0) continue;
    const hasArtikel = !!item.mesonicArtikelNr;
    out.push({
      artikelnummer: hasArtikel ? mesonicArtikelForStandort(item.mesonicArtikelNr!, standort) : 'TEXT',
      datentyp: hasArtikel ? '1' : '3',
      menge: item.quantity,
      einzelpreis: item.unitPrice,
      bezeichnung: foldSerialsIntoBezeichnung(item),
    });
  }
  return out;
}
