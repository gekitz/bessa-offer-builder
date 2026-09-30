import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './lib/auth.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import { isPublicFlow } from './lib/publicFlow.ts'
import './index.css'

// Register the service worker once per page load. It owns push
// notifications only (no caching), so it can silently swap in fresh
// code on every deploy. Skipped on dev (Vite handles HMR) and on
// browsers without SW support.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

// Forward navigate messages from notificationclick into the SPA.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'kitz:navigate' && typeof e.data.url === 'string') {
      try {
        window.history.pushState({}, '', e.data.url);
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch {
        window.location.assign(e.data.url);
      }
    }
  });
}

// Public customer-facing flows live outside the auth wall — offer accept (?a=),
// ticket-tracking portal (?t=), campaign landing (?c=). Each authenticates via
// its own share token, not via Microsoft SSO. See lib/publicFlow for the list.
const publicFlow = isPublicFlow(new URLSearchParams(window.location.search));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      {publicFlow ? (
        <App />
      ) : (
        <ProtectedRoute>
          <App />
        </ProtectedRoute>
      )}
    </AuthProvider>
  </React.StrictMode>,
)
