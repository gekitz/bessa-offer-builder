import { supabase } from './supabase';

// Save or update an offer
export async function saveOffer({ id, customer, creator, creatorName, cart, globalTier, notes, raten, finanzOpen, totalMonthly, totalOnce, totalPeriod, mandatsRef }) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const offerData = { cart, globalTier, notes, raten, finanzOpen, address: customer.address || '', mandatsRef: mandatsRef || '' };
  const row = {
    customer_name: customer.name || null,
    customer_company: customer.company || null,
    customer_email: customer.email || null,
    customer_phone: customer.phone || null,
    creator_id: creator,
    creator_name: creatorName,
    offer_data: offerData,
    total_monthly: totalMonthly,
    total_once: totalOnce,
    total_period: totalPeriod,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    // Update existing
    const { data, error } = await supabase
      .from('offers')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    // Insert new
    const { data, error } = await supabase
      .from('offers')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

// List all offers, newest first
export async function listOffers() {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { data, error } = await supabase
    .from('offers')
    .select('id, status, customer_name, customer_company, customer_email, creator_name, total_monthly, total_once, total_period, created_at, updated_at, sent_at, opened_at')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Get a single offer with full data
export async function getOffer(id) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// Delete an offer
export async function deleteOffer(id) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { error } = await supabase
    .from('offers')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// Send offer via edge function
export async function sendOffer(offerId, pdfBase64, pdfFilename) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { data, error } = await supabase.functions.invoke('send-offer', {
    body: { offerId, pdfBase64, pdfFilename },
  });

  if (error) throw error;
  return data;
}

// Get email events for an offer
export async function getEmailEvents(offerId) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { data, error } = await supabase
    .from('email_events')
    .select('*')
    .eq('offer_id', offerId)
    .order('occurred_at', { ascending: true });

  if (error) throw error;
  return data;
}
