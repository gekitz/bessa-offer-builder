import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { signInWithMicrosoft } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithMicrosoft();
    } catch (err) {
      setError(err.message || 'Anmeldung fehlgeschlagen');
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center">
          {/* Logo / Brand */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">bessa</h1>
            <p className="text-sm text-gray-500 mt-1">CRM & Angebotsverwaltung</p>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100 my-6" />

          {/* Login button */}
          <button
            onClick={handleLogin}
            disabled={signingIn}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {signingIn ? (
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            ) : (
              /* Microsoft logo SVG */
              <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
              </svg>
            )}
            <span>{signingIn ? 'Wird angemeldet...' : 'Mit Microsoft anmelden'}</span>
          </button>

          {/* Error message */}
          {error && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg p-3">
              {error}
            </p>
          )}

          {/* Footer */}
          <p className="mt-6 text-xs text-gray-400">
            Melde dich mit deinem KITZ Microsoft-Konto an
          </p>
        </div>
      </div>
    </div>
  );
}
