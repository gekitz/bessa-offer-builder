import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

// ═══════════════════════════════════════════════════════
// Auth Context
// ═══════════════════════════════════════════════════════

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch user profile from user_profiles table
  const fetchProfile = useCallback(async (userId) => {
    if (!supabase || !userId) return null;
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.warn('[auth] fetchProfile error:', error.message);
      return null;
    }
    return data;
  }, []);

  // 1) Listen for auth state changes — only update session, never await DB calls here.
  //    Making authenticated requests inside onAuthStateChange can deadlock the Supabase client.
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        console.log('[auth] event:', event, 'user:', s?.user?.email);
        setSession(s);
        // If signed out, clear profile immediately
        if (!s) setProfile(null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // 2) Whenever the session changes, fetch the profile in a separate effect.
  //    This runs after the session state is committed, so the Supabase client
  //    has the auth token ready and the request won't deadlock.
  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    fetchProfile(session.user.id).then((p) => {
      if (!cancelled) setProfile(p);
    });

    return () => { cancelled = true; };
  }, [session?.user?.id, fetchProfile]);

  // Sign in with Microsoft
  const signInWithMicrosoft = useCallback(async () => {
    if (!supabase) throw new Error('Supabase nicht konfiguriert');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email profile openid',
        redirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setProfile(null);
  }, []);

  // Refresh profile (e.g. after admin updates)
  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      const p = await fetchProfile(session.user.id);
      setProfile(p);
    }
  }, [session, fetchProfile]);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    isAuthenticated: !!session,
    mesonicRepId: profile?.mesonic_rep_id ?? null,
    mesonicRepName: profile?.mesonic_rep_name ?? null,
    signInWithMicrosoft,
    signOut,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
