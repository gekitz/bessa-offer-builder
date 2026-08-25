import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════
// Supplier order e-mail (Orderman & any supplier with order_method='email')
// ═══════════════════════════════════════════════════════
//
// The `email` ordering strategy: send a structured order e-mail to the
// supplier's order address and CC the person who placed it. Used for
// suppliers with no API (Orderman → sales@orderman.com).
//
// The recipient is looked up SERVER-SIDE from the suppliers table by id —
// the client never supplies a destination address, so this can't be used
// to mail arbitrary recipients.
//
// POST body: { supplierId, items:[{name,code?,qty}], shippingAddress, note? }
// Requires a valid Supabase user JWT (the caller becomes the CC/reply-to).
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//          RESEND_API_KEY
// Deploy:  supabase functions deploy send-supplier-order

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

interface ShipAddr {
  companyName?: string;
  street?: string;
  zip?: string;
  city?: string;
  countryCode?: string;
  phone?: string;
}
interface OrderItem { name?: string; code?: string; qty?: number }

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

function buildEmail(opts: {
  supplierName: string;
  items: OrderItem[];
  addr: ShipAddr;
  note?: string;
  orderedByEmail: string;
}): { subject: string; html: string; text: string } {
  const { supplierName, items, addr, note, orderedByEmail } = opts;
  const totalQty = items.reduce((n, i) => n + (i.qty ?? 0), 0);
  const subject = `Bestellung KITZ Computer + Office GmbH (${totalQty} Stück)`;

  const addrLines = [
    addr.companyName,
    addr.street,
    [addr.zip, addr.city].filter(Boolean).join(" "),
    addr.countryCode,
    addr.phone ? `Tel: ${addr.phone}` : null,
  ].filter(Boolean) as string[];

  const itemsText = items
    .map((i) => `  - ${i.qty}× ${i.name}${i.code ? ` (Art.Nr. ${i.code})` : ""}`)
    .join("\n");
  const text = [
    `Sehr geehrte Damen und Herren,`,
    ``,
    `wir möchten folgende Artikel bestellen:`,
    ``,
    itemsText,
    ``,
    `Lieferadresse:`,
    ...addrLines.map((l) => `  ${l}`),
    ``,
    note ? `Anmerkung: ${note}\n` : ``,
    `Bitte um Auftragsbestätigung an ${orderedByEmail}.`,
    ``,
    `Mit freundlichen Grüßen`,
    `KITZ Computer + Office GmbH`,
  ].join("\n");

  const itemsRows = items
    .map(
      (i) =>
        `<tr><td style="padding:4px 10px;text-align:right;font-weight:600">${i.qty}×</td>` +
        `<td style="padding:4px 10px;color:#64748b;font-family:monospace">${i.code ? esc(i.code) : ""}</td>` +
        `<td style="padding:4px 10px">${esc(i.name ?? "")}</td></tr>`,
    )
    .join("");
  const header =
    `<tr style="text-align:left;color:#94a3b8;font-size:12px">` +
    `<th style="padding:4px 10px;text-align:right">Menge</th>` +
    `<th style="padding:4px 10px">Art.Nr.</th>` +
    `<th style="padding:4px 10px">Artikel</th></tr>`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#0f172a">
<p>Sehr geehrte Damen und Herren,</p>
<p>wir möchten folgende Artikel bei <strong>${esc(supplierName)}</strong> bestellen:</p>
<table style="border-collapse:collapse;margin:8px 0">${header}${itemsRows}</table>
<p><strong>Lieferadresse:</strong><br>${addrLines.map(esc).join("<br>")}</p>
${note ? `<p><strong>Anmerkung:</strong> ${esc(note)}</p>` : ""}
<p>Bitte um Auftragsbestätigung an <a href="mailto:${esc(orderedByEmail)}">${esc(orderedByEmail)}</a>.</p>
<p>Mit freundlichen Grüßen<br>KITZ Computer + Office GmbH</p>
</div>`;

  return { subject, html, text };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);
    const orderedByEmail = (user.email ?? "").toLowerCase();

    const body = await req.json().catch(() => ({}));
    const { supplierId, items, shippingAddress, note } = body as {
      supplierId?: string;
      items?: OrderItem[];
      shippingAddress?: ShipAddr;
      note?: string;
    };

    if (!supplierId) return json({ error: "Missing supplierId." }, 400);
    if (!Array.isArray(items) || items.length === 0) return json({ error: "Missing items." }, 400);
    if (!shippingAddress?.street || !shippingAddress?.companyName) {
      return json({ error: "Missing shipping address." }, 400);
    }

    // Resolve the destination address server-side — never trust a
    // client-supplied recipient.
    const { data: supplier, error: supErr } = await userClient
      .from("suppliers")
      .select("name, order_email, order_method")
      .eq("id", supplierId)
      .maybeSingle();
    if (supErr) return json({ error: supErr.message }, 500);
    if (!supplier?.order_email) {
      return json({ error: "Für diesen Lieferanten ist keine Bestell-E-Mail hinterlegt." }, 400);
    }

    const { subject, html, text } = buildEmail({
      supplierName: supplier.name,
      items,
      addr: shippingAddress,
      note,
      orderedByEmail,
    });

    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const payload: Record<string, unknown> = {
      from: "KITZ Computer + Office GmbH <workspace@kitz.co.at>",
      to: [supplier.order_email],
      subject,
      html,
      text,
    };
    // CC + route replies to the person who placed the order.
    if (orderedByEmail) {
      payload.cc = [orderedByEmail];
      payload.reply_to = orderedByEmail;
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

    return json({ ok: true, resendId: resendData.id, to: supplier.order_email });
  } catch (err) {
    console.error("[send-supplier-order] error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
