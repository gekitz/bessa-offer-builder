import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import { listProfiles, updateProfile, listPools } from '../lib/profileApi';
import { Save, Check, Loader2, ArrowLeft, Users, Shield, AlertCircle } from 'lucide-react';

/**
 * Admin page: map Microsoft SSO users to Mesonic sales rep IDs,
 * assign roles, and configure ticket pool memberships.
 *
 * Usage: Render this component when navigating to /admin/users.
 * It requires admin role (wrap in <ProtectedRoute requireAdmin>).
 */
export default function AdminUserMapping({ onBack }) {
  const { refreshProfile } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState({});    // { [userId]: true }
  const [saved, setSaved] = useState({});      // { [userId]: true }
  const [edits, setEdits] = useState({});      // { [userId]: { field: value } }

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, pl] = await Promise.all([listProfiles(), listPools()]);
      setProfiles(p);
      setPools(pl);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Track edits per user
  const setField = (userId, field, value) => {
    setEdits(prev => ({
      ...prev,
      [userId]: { ...(prev[userId] || {}), [field]: value },
    }));
    // Clear saved indicator when editing
    setSaved(prev => ({ ...prev, [userId]: false }));
  };

  // Toggle pool membership
  const togglePool = (userId, poolId, currentPools) => {
    const has = currentPools.includes(poolId);
    const next = has
      ? currentPools.filter(p => p !== poolId)
      : [...currentPools, poolId];
    setField(userId, 'pools', next);
  };

  // Save a single user's changes
  const saveUser = async (userId) => {
    const changes = edits[userId];
    if (!changes || Object.keys(changes).length === 0) return;

    setSaving(prev => ({ ...prev, [userId]: true }));
    try {
      const updated = await updateProfile(userId, changes);
      // Update local state
      setProfiles(prev => prev.map(p => p.id === userId ? updated : p));
      setEdits(prev => { const n = { ...prev }; delete n[userId]; return n; });
      setSaved(prev => ({ ...prev, [userId]: true }));
      // If we updated ourselves, refresh the auth context
      refreshProfile();
      // Clear saved indicator after 2s
      setTimeout(() => setSaved(prev => ({ ...prev, [userId]: false })), 2000);
    } catch (err) {
      setError(`Fehler beim Speichern: ${err.message}`);
    } finally {
      setSaving(prev => ({ ...prev, [userId]: false }));
    }
  };

  // Get current value (edited or from DB)
  const val = (profile, field) => {
    return edits[profile.id]?.[field] ?? profile[field] ?? '';
  };
  const valArr = (profile, field) => {
    return edits[profile.id]?.[field] ?? profile[field] ?? [];
  };

  const hasChanges = (userId) => {
    return edits[userId] && Object.keys(edits[userId]).length > 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {onBack && (
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Benutzerverwaltung
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Map Microsoft users to Mesonic sales rep IDs
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* User cards */}
      <div className="space-y-4">
        {profiles.map(profile => {
          const currentPools = valArr(profile, 'pools');

          return (
            <div
              key={profile.id}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
            >
              {/* User header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-sm font-medium text-blue-700">
                        {(profile.display_name || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{profile.display_name}</p>
                    <p className="text-sm text-gray-500">{profile.microsoft_email}</p>
                  </div>
                </div>

                {/* Save button */}
                <button
                  onClick={() => saveUser(profile.id)}
                  disabled={!hasChanges(profile.id) || saving[profile.id]}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    saved[profile.id]
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : hasChanges(profile.id)
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {saving[profile.id] ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : saved[profile.id] ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {saved[profile.id] ? 'Gespeichert' : 'Speichern'}
                </button>
              </div>

              {/* Fields grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Role */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    <Shield className="w-3 h-3 inline mr-1" />
                    Rolle
                  </label>
                  <select
                    value={val(profile, 'role')}
                    onChange={e => setField(profile.id, 'role', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="viewer">Viewer (nur lesen)</option>
                    <option value="agent">Agent (lesen + schreiben)</option>
                    <option value="admin">Admin (alles)</option>
                  </select>
                </div>

                {/* Mesonic Rep ID */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Mesonic Rep ID
                  </label>
                  <input
                    type="text"
                    value={val(profile, 'mesonic_rep_id')}
                    onChange={e => setField(profile.id, 'mesonic_rep_id', e.target.value)}
                    placeholder="e.g. V001"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {/* Mesonic Rep Name */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Mesonic Rep Name
                  </label>
                  <input
                    type="text"
                    value={val(profile, 'mesonic_rep_name')}
                    onChange={e => setField(profile.id, 'mesonic_rep_name', e.target.value)}
                    placeholder="Name in WinLine"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Pool memberships */}
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Ticket-Pools
                </label>
                <div className="flex flex-wrap gap-2">
                  {pools.map(pool => {
                    const active = currentPools.includes(pool.id);
                    return (
                      <button
                        key={pool.id}
                        onClick={() => togglePool(profile.id, pool.id, currentPools)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                          active
                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
                            : 'bg-gray-50 text-gray-500 border border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {pool.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {profiles.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>Noch keine Benutzer vorhanden.</p>
          <p className="text-sm mt-1">Benutzer werden automatisch angelegt, sobald sie sich zum ersten Mal anmelden.</p>
        </div>
      )}
    </div>
  );
}
