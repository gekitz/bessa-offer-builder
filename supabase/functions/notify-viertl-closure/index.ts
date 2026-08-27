import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════
// Viertl-Benachrichtigung: Gastrotouch-Kunde geschlossen
// ═══════════════════════════════════════════════════════
//
// Wenn ein Kunde den Betrieb einstellt, informieren wir Viertl (den
// Gastrotouch-Hersteller), damit die Lizenz dort abgemeldet werden kann.
// Manuell bestätigt aus der Viertl-Ansicht (kein Auto-Versand).
//
// Die Empfängeradresse kommt SERVER-SEITIG aus dem Secret
// VIERTL_NOTIFY_EMAIL — der Client liefert nie einen Empfänger, das kann
// also nicht zum Versand an beliebige Adressen missbraucht werden. Die
// Kundendaten werden per licenseId server-seitig aus viertl_licenses
// gelesen; der Client schickt nur licenseId + (editierten) Grund.
//
// POST body: { licenseId, reason? }
// Requires a valid Supabase user JWT (the caller becomes reply-to).
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//          RESEND_API_KEY, VIERTL_NOTIFY_EMAIL
// Deploy:  supabase functions deploy notify-viertl-closure

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const viertlEmail = Deno.env.get("VIERTL_NOTIFY_EMAIL") || "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);
    const reportedByEmail = (user.email ?? "").toLowerCase();

    if (!viertlEmail) {
      return json({ error: "Keine Viertl-Adresse konfiguriert (Secret VIERTL_NOTIFY_EMAIL fehlt)." }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const { licenseId, reason } = body as { licenseId?: string; reason?: string };
    if (!licenseId) return json({ error: "Missing licenseId." }, 400);

    // Kundendaten server-seitig laden (Client liefert keine Adressdaten).
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: lic, error: licErr } = await admin
      .from("viertl_licenses")
      .select("id, name, contact, street, plz, ort, mesonic_kdnr, gastrotouch_version, closed_reason")
      .eq("id", licenseId)
      .maybeSingle();
    if (licErr) return json({ error: licErr.message }, 500);
    if (!lic) return json({ error: "Installation nicht gefunden." }, 404);

    const reasonText = (reason ?? lic.closed_reason ?? "").trim() || "Kunde hat den Betrieb eingestellt.";
    const addr = [lic.street, [lic.plz, lic.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const subject = `Gastrotouch-Kunde geschlossen: ${lic.name} (Kd. ${lic.mesonic_kdnr})`;

    const html = `
<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;font-size:14px;line-height:1.6;">
  <p>Sehr geehrtes Viertl-Team,</p>
  <p>der folgende Gastrotouch-Kunde hat den Betrieb eingestellt und kann abgemeldet werden:</p>
  <table style="border-collapse:collapse;margin:12px 0;">
    <tr><td style="padding:2px 12px 2px 0;color:#64748b;">Kunde</td><td><strong>${esc(lic.name)}</strong></td></tr>
    ${lic.contact ? `<tr><td style="padding:2px 12px 2px 0;color:#64748b;">z. H.</td><td>${esc(lic.contact)}</td></tr>` : ""}
    ${addr ? `<tr><td style="padding:2px 12px 2px 0;color:#64748b;">Adresse</td><td>${esc(addr)}</td></tr>` : ""}
    <tr><td style="padding:2px 12px 2px 0;color:#64748b;">Kd.-Nr.</td><td>${esc(lic.mesonic_kdnr)}</td></tr>
    ${lic.gastrotouch_version ? `<tr><td style="padding:2px 12px 2px 0;color:#64748b;">Version</td><td>${esc(lic.gastrotouch_version)}</td></tr>` : ""}
    <tr><td style="padding:2px 12px 2px 0;color:#64748b;">Grund</td><td>${esc(reasonText)}</td></tr>
  </table>
  <p>Mit freundlichen Grüßen<br>KITZ Computer &amp; Office GmbH</p>
</body></html>`;

    const payload: Record<string, unknown> = {
      from: "KITZ Computer + Office GmbH <workspace@kitz.co.at>",
      to: [viertlEmail],
      subject,
      html,
    };
    if (reportedByEmail) {
      payload.cc = [reportedByEmail];
      payload.reply_to = reportedByEmail;
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      console.error("Resend error:", resendData);
      return json({ error: "E-Mail konnte nicht gesendet werden.", details: resendData }, 502);
    }

    // Aktion in der Viertl-Historie protokollieren (service role → RLS egal).
    await admin.from("viertl_events").insert({
      license_id: licenseId,
      type: "viertl_notified",
      message: `An ${viertlEmail}: ${reasonText}`,
      actor_id: user.id,
      actor_name: reportedByEmail,
    });

    return json({ ok: true, resendId: resendData.id, to: viertlEmail });
  } catch (err) {
    console.error("notify-viertl-closure error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
