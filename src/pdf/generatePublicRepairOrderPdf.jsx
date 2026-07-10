import React from 'react';
import { importWithReload } from '../lib/lazyWithReload';

// Lazily-loaded PDF generator for the customer-facing signed repair
// order. Defers the ~600 KB @react-pdf/renderer chunk until the
// customer actually taps "PDF herunterladen".
export async function generatePublicRepairOrderPdfBlob(doc) {
  const [{ pdf }, { default: PublicRepairOrderPdfDocument }] = await importWithReload(() =>
    Promise.all([import('@react-pdf/renderer'), import('./PublicRepairOrderPdfDocument')]),
  );
  return await pdf(<PublicRepairOrderPdfDocument doc={doc} />).toBlob();
}
