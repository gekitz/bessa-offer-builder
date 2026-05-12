import React from 'react';

// Lazily-loaded PDF generator for a signed (or completed) repair
// order. Same pattern as generateOfferPdfBlob — defer the ~600 KB
// @react-pdf/renderer chunk until a user actually hits "PDF
// herunterladen".
export async function generateRepairOrderPdfBlob(props) {
  const [{ pdf }, { default: RepairOrderPdfDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./RepairOrderPdfDocument'),
  ]);
  return await pdf(<RepairOrderPdfDocument {...props} />).toBlob();
}
