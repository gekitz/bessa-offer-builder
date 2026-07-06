import React from 'react';
import { importWithReload } from '../lib/lazyWithReload';

// Generate the offer PDF as a Blob, lazily loading the heavy
// @react-pdf/renderer package and the OfferPdfDocument component
// only when this function is first called.
//
// Why: @react-pdf/renderer ships ~600 KB minified — the previous
// eager import meant every "open the app to look at the offer list"
// load paid for it. Now the cost only hits when the user actually
// hits Print / Send / Sign. The first PDF generation has a small
// extra delay while the chunk loads (cached after that).
export async function generateOfferPdfBlob(props) {
  const [{ pdf }, { default: OfferPdfDocument }] = await importWithReload(() =>
    Promise.all([import('@react-pdf/renderer'), import('./OfferPdfDocument')]),
  );
  return await pdf(<OfferPdfDocument {...props} />).toBlob();
}
