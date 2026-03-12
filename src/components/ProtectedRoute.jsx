import { useAuth } from '../lib/auth';
import LoginPage from './LoginPage';
import { Loader2 } from 'lucide-react';

/**
 * Wraps the app — shows login page if not authenticated,
 * loading spinner while checking session, or children if logged in.
 *
 * Optional: requireAdmin prop to restrict to admin users.
 */
export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { isAuthenticated, isAdmin, loading, profile } = useAuth();

  // Still loading session
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Sitzung wird geladen...</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Logged in but profile not yet created (edge case: trigger hasn't fired yet)
  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto p-8">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Profil wird eingerichtet...</p>
        </div>
      </div>
    );
  }

  // Requires admin but user is not admin
  if (requireAdmin && !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto p-8 bg-white rounded-2xl shadow-lg">
          <h2 className="text-lg font-semibold text-gray-900">Kein Zugriff</h2>
          <p className="mt-2 text-sm text-gray-500">
            Diese Seite ist nur für Administratoren zugänglich.
          </p>
        </div>
      </div>
    );
  }

  return children;
}
