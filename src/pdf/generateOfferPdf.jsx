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
// The single dynamic-import factory both the generator and the prefetch
// share, so warming and generating always pull the exact same chunks.
const loadPdfModules = () =>
  importWithReload(() =>
    Promise.all([import('@react-pdf/renderer'), import('./OfferPdfDocument')]),
  );

// Warm the heavy PDF chunk without producing a document. Call this
// *before* the user commits to a PDF action (e.g. when the offer tab
// opens) so that a stale-chunk reload — see importWithReload — happens
// at a harmless moment instead of mid-send, after the offer has already
// been saved but before it could be e-mailed. Fire-and-forget: the
// import is cached, so a later generateOfferPdfBlob resolves instantly,
// and any non-reload error is swallowed (it resurfaces at real use).
export function prefetchOfferPdf() {
  return loadPdfModules().then(() => undefined).catch(() => {});
}

export async function generateOfferPdfBlob(props) {
  const [{ pdf }, { default: OfferPdfDocument }] = await loadPdfModules();
  return await pdf(<OfferPdfDocument {...props} />).toBlob();
}
