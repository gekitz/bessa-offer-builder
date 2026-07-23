import { supabase } from './supabase';

// Save or update an offer
export async function saveOffer({ id, customer, creator, creatorName, creatorEmail, cart, globalTier, notes, raten, finanzOpen, rabattActive = false, skontoActive = false, totalMonthly, totalOnce, totalPeriod, mandatsRef, customItems, cartOrder, serviceStartDate, briefing, offerType = 'pos', rental = null, paymentEnabled = false, acceptSnapshot = undefined }) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  // offer_type lives in a top-level column (source of truth for the
  // list filter) but is also mirrored into offer_data so the share /
  // URL load path — which only reads offer_data — restores it too.
  const offerData = { cart, globalTier, notes, raten, finanzOpen, rabattActive: !!rabattActive, skontoActive: !!skontoActive, address: customer.address || '', mandatsRef: mandatsRef || '', offerType };
  // Leihstellung input state — persisted so the calculator can be re-edited on
  // reload (the priced line itself rides along as a custom item).
  if (rental) offerData.rental = rental;
  if (customItems && Object.keys(customItems).length > 0) offerData.customItems = customItems;
  if (cartOrder && cartOrder.length > 0) offerData.cartOrder = cartOrder;
  // Frozen accept-page totals, snapshotted at send so the customer's page
  // shows the quoted numbers even if catalog prices later change.
  if (acceptSnapshot) offerData.acceptSnapshot = acceptSnapshot;
  const row = {
    offer_type: offerType,
    customer_name: customer.name || null,
    customer_company: customer.company || null,
    customer_email: customer.email || null,
    customer_phone: customer.phone || null,
    customer_address: customer.address || null,
    mesonic_customer_id: customer.mesonicId || null,
    creator_id: creator,
    creator_name: creatorName,
    creator_email: creatorEmail || null,
    briefing: briefing && briefing.trim() ? briefing.trim() : null,
    offer_data: offerData,
    total_monthly: totalMonthly,
    total_once: totalOnce,
    total_period: totalPeriod,
    service_start_date: serviceStartDate || null,
    payment_enabled: !!paymentEnabled,
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

// List offer creators from the employees table — the single source of
// truth for rep name/email/phone/role. Every active employee is eligible
// to create (and therefore be filtered for) an offer.
//
// The id is the employee's team_slug when set, else their unique `code`.
// This keeps the 10 curated reps on their legacy TEAM slug (what existing
// offers.creator_id already stores, so old offers still resolve) while
// giving everyone else a stable id. Returns the same shape the old TEAM
// catalog exposed so the offer builder + PDF need no changes:
//   { id, name, role, phone, email, location }
export async function listOfferCreators() {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { data, error } = await supabase
    .from('employees')
    .select('team_slug, code, name, email, phone, job_title, standorte(name)')
    .eq('active', true)
    .order('name');
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.team_slug || row.code,
    name: row.name,
    role: row.job_title || '',
    phone: row.phone || '',
    email: row.email || '',
    location: row.standorte?.name || '',
  }));
}

// List all offers, newest first
export async function listOffers() {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { data, error } = await supabase
    .from('offers')
    .select('id, status, stage, offer_type, customer_name, customer_company, customer_email, mesonic_customer_id, creator_id, creator_name, briefing, lost_reason, lost_reason_note, lost_at, total_monthly, total_once, total_period, created_at, updated_at, sent_at, opened_at, last_activity_at, next_followup_at')
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

// Mark an offer as lost together with a categorical reason and an
// optional free-text note. Atomic single-update so the offer never
// sits in a half-state ("stage=lost but no reason") that would
// poison the analytics. lost_at is set server-side via NOW() so it
// reflects the actual close moment, not the client clock.
export async function markOfferLost(id, { reason, note }) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const trimmedNote = note && note.trim() ? note.trim() : null;

  const { data, error } = await supabase
    .from('offers')
    .update({
      stage: 'lost',
      lost_reason: reason,
      lost_reason_note: trimmedNote,
      lost_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, stage, lost_reason, lost_reason_note, lost_at')
    .single();

  if (error) throw error;
  return data;
}

// Send offer via edge function
export async function sendOffer(offerId, pdfBase64, pdfFilename, emailText, opts = {}) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const body = { offerId, pdfBase64, pdfFilename };
  if (emailText) {
    body.emailSubject = emailText.subject;
    body.emailGreeting = emailText.greeting;
    body.emailBody = emailText.body;
    body.emailClosing = emailText.closing;
  }
  if (opts.includeAcceptLink) body.includeAcceptLink = true;

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

// Customer accepts an offer by signature (no payment) from the public
// accept page. Records the signature + name and marks the offer accepted,
// which fires the DB trigger that creates the fulfillment ticket.
export async function acceptOfferWithSignature(shareCode, signatureData, signedByName) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('offers')
    .update({
      signature_data: signatureData,
      signed_by_name: signedByName || null,
      signed_at: now,
      accepted_at: now,
      status: 'accepted',
      updated_at: now,
    })
    .eq('share_code', shareCode)
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

// List activities (call/email/meeting/note log) for an offer, newest first
export async function listActivities(offerId) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { data, error } = await supabase
    .from('offer_activities')
    .select('*')
    .eq('offer_id', offerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Log a new activity (call, email, meeting, note) on an offer.
// nextFollowupAt is an ISO timestamp string or null. The DB trigger
// mirrors the latest activity's next_followup_at onto the offer row.
export async function logActivity(offerId, { kind, outcome, note, nextFollowupAt, createdById, createdByName }) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const row = {
    offer_id: offerId,
    kind,
    outcome: outcome || null,
    note: note || null,
    next_followup_at: nextFollowupAt || null,
    created_by_id: createdById || null,
    created_by_name: createdByName || null,
  };

  const { data, error } = await supabase
    .from('offer_activities')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Delete an activity (e.g. logged by mistake). Trigger refreshes the
// offer's denormalized fields automatically.
export async function deleteActivity(activityId) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { error } = await supabase
    .from('offer_activities')
    .delete()
    .eq('id', activityId);

  if (error) throw error;
}

// Send a follow-up email via the send-followup edge function. The
// function logs an offer_activities row (kind=email) and an
// email_events row, threads the email into the original offer
// conversation, and optionally re-attaches the offer PDF.
export async function sendFollowup(offerId, payload) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const { data, error } = await supabase.functions.invoke('send-followup', {
    body: { offerId, ...payload },
    headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
  });

  if (error) throw error;
  return data;
}

// Count recent 'opened' events per offer over the last `sinceDays`.
// Used to surface the "Heiße Spur" bucket — offers the customer has
// opened > 2 times in the last 7 days. Returns a Map<offerId, count>.
export async function getRecentOpenCounts(sinceDays = 7) {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');

  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('email_events')
    .select('offer_id')
    .eq('event_type', 'opened')
    .gte('occurred_at', since);

  if (error) throw error;

  const counts = new Map();
  for (const row of data || []) {
    counts.set(row.offer_id, (counts.get(row.offer_id) || 0) + 1);
  }
  return counts;
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
