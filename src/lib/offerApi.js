import { supabase } from './supabase';

// Save or update an offer
export async function saveOffer({ id, customer, creator, creatorName, cart, globalTier, notes, raten, finanzOpen, totalMonthly, totalOnce, totalPeriod, mandatsRef, customItems, cartOrder }) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const offerData = { cart, globalTier, notes, raten, finanzOpen, address: customer.address || '', mandatsRef: mandatsRef || '' };
  if (customItems && Object.keys(customItems).length > 0) offerData.customItems = customItems;
  if (cartOrder && cartOrder.length > 0) offerData.cartOrder = cartOrder;
  const row = {
    customer_name: customer.name || null,
    customer_company: customer.company || null,
    customer_email: customer.email || null,
    customer_phone: customer.phone || null,
    customer_address: customer.address || null,
    mesonic_customer_id: customer.mesonicId || null,
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
    .select('id, status, stage, customer_name, customer_company, customer_email, mesonic_customer_id, creator_id, creator_name, total_monthly, total_once, total_period, created_at, updated_at, sent_at, opened_at')
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

// Update CRM pipeline stage
export async function updateOfferStage(id, stage) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { data, error } = await supabase
    .from('offers')
    .update({ stage })
    .eq('id', id)
    .select('id, stage')
    .single();

  if (error) throw error;
  return data;
}

// Send offer via edge function
export async function sendOffer(offerId, pdfBase64, pdfFilename, emailText) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const body = { offerId, pdfBase64, pdfFilename };
  if (emailText) {
    body.emailSubject = emailText.subject;
    body.emailGreeting = emailText.greeting;
    body.emailBody = emailText.body;
    body.emailClosing = emailText.closing;
  }

  const { data, error } = await supabase.functions.invoke('send-offer', {
    body,
    headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
  });

  if (error) throw error;
  return data;
}

// Set share code on an offer
export async function setShareCode(offerId, code) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { data, error } = await supabase
    .from('offers')
    .update({ share_code: code })
    .eq('id', offerId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get offer by share code
export async function getOfferByShareCode(code) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('share_code', code)
    .single();

  if (error) throw error;
  return data;
}

// Sign offer: upload signed PDF to storage, update offer with signature data
export async function signOffer(offerId, signatureData, signedPdfBlob, pdfFilename) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  // Upload signed PDF to storage
  const storagePath = `offers/${offerId}/${pdfFilename}`;
  const { error: uploadError } = await supabase.storage
    .from('offer-pdfs')
    .upload(storagePath, signedPdfBlob, {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (uploadError) throw uploadError;

  // Update offer row
  const { data, error } = await supabase
    .from('offers')
    .update({
      signature_data: signatureData,
      signed_at: new Date().toISOString(),
      signed_pdf_path: storagePath,
      stage: 'closed',
    })
    .eq('id', offerId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Get public URL for a signed PDF from storage
export function getSignedPdfUrl(path) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  const { data } = supabase.storage.from('offer-pdfs').getPublicUrl(path);
  return data?.publicUrl || null;
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
