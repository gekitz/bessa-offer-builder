import React from 'react';
import { HashRouter } from 'react-router-dom';
import OfferBuilderPage from './features/offers/pages/OfferBuilderPage';

// Lazy-loaded: AcceptPage is only used on the customer-facing
// ?a=<share_code> flow, which is a small fraction of total loads.
// Keeping it out of the main chunk shaves the bundle for everyone
// who's just opening the app to build / send offers.
const AcceptPage = React.lazy(() => import('./features/offers/pages/AcceptPage'));
const MesonicTest = React.lazy(() => import('./components/MesonicTest.jsx'));

export default function App() {
  // Quick access: add #test to URL to show Mesonic API test page.
  // Checked before HashRouter consumes the hash so #test still works
  // alongside the router (which expects #/<path>).
  if (window.location.hash === '#test') {
    return (
      <React.Suspense fallback={<div className="p-8 text-center">Loading test page...</div>}>
        <MesonicTest />
      </React.Suspense>
    );
  }

  // Customer-facing accept flow: ?a=<share_code>. Stays outside the
  // router — it's a different page entirely.
  const acceptCode = new URLSearchParams(window.location.search).get('a');
  if (acceptCode) {
    return (
      <React.Suspense fallback={<div className="p-8 text-center">Wird geladen...</div>}>
        <AcceptPage shareCode={acceptCode} />
      </React.Suspense>
    );
  }

  return (
    <HashRouter>
      <OfferBuilderPage />
    </HashRouter>
  );
}
