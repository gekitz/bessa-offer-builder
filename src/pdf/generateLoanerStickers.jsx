import React from 'react';
import { importWithReload } from '../lib/lazyWithReload';

// Erzeugt den Etikettenbogen (PDF-Blob) für eine Liste von Leihgeräten. Lädt
// @react-pdf/renderer + jsbarcode erst beim Druck (eigener Chunk). Der Barcode
// jeder Seriennummer wird vorab zu einer PNG-Data-URL gerendert und ins
// Dokument gereicht. Siehe docs/leihstellungen.md.
//
// `devices`: [{ bezeichnung, serialNumber, inventoryNo? }]
export async function generateLoanerStickersBlob(devices) {
  const [{ pdf }, { default: LoanerStickerSheet }, { code128Bars }] = await importWithReload(() =>
    Promise.all([
      import('@react-pdf/renderer'),
      import('./LoanerStickerSheet'),
      import('../features/loaners/lib/barcode'),
    ]),
  );

  const items = devices.map((d) => ({
    bezeichnung: d.bezeichnung,
    serialNumber: d.serialNumber,
    inventoryNo: d.inventoryNo ?? null,
    // Vektor-Balken; null bei ungültiger/leerer Seriennummer (Etikett bleibt
    // lesbar, nur ohne Barcode).
    barcode: d.serialNumber ? code128Bars(d.serialNumber) : null,
  }));

  return await pdf(<LoanerStickerSheet items={items} />).toBlob();
}
