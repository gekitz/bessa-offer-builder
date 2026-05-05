import React from 'react';
import { HashRouter } from 'react-router-dom';
import AcceptPage from './features/offers/pages/AcceptPage';
import OfferBuilderPage from './features/offers/pages/OfferBuilderPage';

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
  if (acceptCode) return <AcceptPage shareCode={acceptCode} />;

  return (
    <HashRouter>
      <OfferBuilderPage />
    </HashRouter>
  );
}
