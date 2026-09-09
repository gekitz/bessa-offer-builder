import React from 'react';
import { importWithReload } from '../lib/lazyWithReload';

// Lazily-loaded PDF generator for a Lieferschein. Same pattern as
// generateRepairOrderPdfBlob — defer the @react-pdf/renderer chunk until the
// user actually downloads. `doc` is the normalised shape consumed by
// DeliveryNotePdfDocument (built identically on the staff + portal sides).
export async function generateDeliveryNotePdfBlob(doc) {
  const [{ pdf }, { default: DeliveryNotePdfDocument }] = await importWithReload(() =>
    Promise.all([import('@react-pdf/renderer'), import('./DeliveryNotePdfDocument')]),
  );
  return await pdf(<DeliveryNotePdfDocument doc={doc} />).toBlob();
}
