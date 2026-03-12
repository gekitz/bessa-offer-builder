import { supabase } from './supabase';

/**
 * Fetch all user profiles (for team dropdowns, admin page, etc.)
 */
export async function listProfiles() {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('display_name');

  if (error) throw error;
  return data;
}

/**
 * Update a user profile (admin only for role/rep mapping, self for display_name)
 */
export async function updateProfile(userId, updates) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { data, error } = await supabase
    .from('user_profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Fetch all ticket pools
 */
export async function listPools() {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { data, error } = await supabase
    .from('ticket_pools')
    .select('*')
    .order('name');

  if (error) throw error;
  return data;
}
