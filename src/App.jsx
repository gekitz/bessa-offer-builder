import React from 'react';
import AcceptPage from './features/offers/pages/AcceptPage';
import OfferBuilderPage from './features/offers/pages/OfferBuilderPage';

const MesonicTest = React.lazy(() => import('./components/MesonicTest.jsx'));

export default function App() {
  // Quick access: add #test to URL to show Mesonic API test page
  if (window.location.hash === '#test') {
    return (
      <React.Suspense fallback={<div className="p-8 text-center">Loading test page...</div>}>
        <MesonicTest />
      </React.Suspense>
    );
  }

  // Customer-facing accept flow: ?a=<share_code>
  const acceptCode = new URLSearchParams(window.location.search).get('a');
  if (acceptCode) return <AcceptPage shareCode={acceptCode} />;

  return <OfferBuilderPage />;
}
