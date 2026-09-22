import React from 'react';
import { HashRouter } from 'react-router-dom';
import OfferBuilderPage from './features/offers/pages/OfferBuilderPage';
import ReloadBanner from './components/ReloadBanner';
import { lazyWithReload } from './lib/lazyWithReload';

// Lazy-loaded: AcceptPage is only used on the customer-facing
// ?a=<share_code> flow, which is a small fraction of total loads.
// Keeping it out of the main chunk shaves the bundle for everyone
// who's just opening the app to build / send offers.
const AcceptPage = lazyWithReload(() => import('./features/offers/pages/AcceptPage'));
const CustomerTicketPage = lazyWithReload(() => import('./features/tickets/pages/CustomerTicketPage'));
const CampaignLandingPage = lazyWithReload(() => import('./features/campaigns/pages/CampaignLandingPage'));
const MesonicTest = lazyWithReload(() => import('./components/MesonicTest.jsx'));

function AppContent() {
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

  // Customer-facing flows live outside the router — each is a
  // dedicated page with no app shell. ?a=<code> for offer accept,
  // ?t=<code> for ticket tracking.
  const search = new URLSearchParams(window.location.search);
  const acceptCode = search.get('a');
  if (acceptCode) {
    return (
      <React.Suspense fallback={<div className="p-8 text-center">Wird geladen...</div>}>
        <AcceptPage shareCode={acceptCode} />
      </React.Suspense>
    );
  }
  const ticketShareCode = search.get('t');
  if (ticketShareCode) {
    return (
      <React.Suspense fallback={<div className="p-8 text-center">Wird geladen...</div>}>
        <CustomerTicketPage shareCode={ticketShareCode} />
      </React.Suspense>
    );
  }
  // ?c=<token> → öffentliche Kampagnen-Landing (kein App-Shell, keine Auth),
  // identisch in Form zum Accept-Branch. Der Token identifiziert den
  // Empfänger; die Seite lädt Empfänger + Kampagne und dispatcht nach Typ.
  const campaignToken = search.get('c');
  if (campaignToken) {
    return (
      <React.Suspense fallback={<div className="p-8 text-center">Wird geladen...</div>}>
        <CampaignLandingPage token={campaignToken} />
      </React.Suspense>
    );
  }

  return (
    <HashRouter>
      <OfferBuilderPage />
    </HashRouter>
  );
}

export default function App() {
  // ReloadBanner sits above every flow so the stale-chunk prompt reaches
  // the customer-facing pages and the #test page too, not just the app shell.
  return (
    <>
      <AppContent />
      <ReloadBanner />
    </>
  );
}
