// Kampagnen-Zuordnung für resend-webhook — als exportierte, reine Hilfs-
// funktion extrahiert, damit sie unit-testbar ist (es gibt kein Edge-Fn-
// Test-Harness im Repo). Der resend_id-Namensraum ist DISJUNKT: Kampagnen-
// Sends schreiben resend_id nur auf campaign_recipients, Angebots-Sends nur
// in email_events.metadata — nie eine Kollision.
//
// Diese Zuordnung MUSS im Webhook VOR der bestehenden email_events-404-
// Rückgabe laufen: eine Kampagnen-Mail hat KEINE email_events-Zeile, würde
// also sonst am 404 hängen bleiben und nie zugeordnet. Bei einem Treffer:
// Funnel-Stempel setzen und früh zurückkehren (der offers-Pfad wird nie
// erreicht). Nur vorwärts-Stempel (guards auf !recip.<col>) → idempotent
// bei doppelten Webhook-Zustellungen.

// Minimales Interface, das wir vom Supabase-Client brauchen (für einfache
// Mocks in Tests).
export interface AttributionClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        limit(n: number): {
          maybeSingle(): Promise<{ data: RecipientRow | null; error: unknown }>;
        };
      };
    };
    update(patch: Record<string, string>): {
      eq(col: string, val: unknown): Promise<{ error: unknown }>;
    };
  };
}

interface RecipientRow {
  id: string;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
}

export interface AttributionResult {
  matched: boolean;      // true ⇒ war eine Kampagnen-Mail; Webhook früh zurückkehren
  updated?: boolean;     // true ⇒ ein Funnel-Zeitstempel wurde geschrieben
}

// Versucht, ein Resend-Event einem campaign_recipients-Row zuzuordnen.
// Gibt matched=false zurück, wenn kein Kampagnen-Row auf diese resend_id
// passt (→ der Aufrufer läuft den unveränderten offers-Pfad weiter).
export async function attributeCampaignEvent(
  supabase: AttributionClient,
  resendEmailId: string,
  eventType: string,
  nowIso: string,
): Promise<AttributionResult> {
  const { data: recip } = await supabase
    .from('campaign_recipients')
    .select('id, delivered_at, opened_at, clicked_at, bounced_at')
    .eq('resend_id', resendEmailId)
    .limit(1)
    .maybeSingle();

  if (!recip) return { matched: false };

  const patch: Record<string, string> = {};
  if (eventType === 'delivered' && !recip.delivered_at) patch.delivered_at = nowIso;
  if (eventType === 'opened' && !recip.opened_at) patch.opened_at = nowIso;
  if (eventType === 'clicked' && !recip.clicked_at) patch.clicked_at = nowIso;
  if (eventType === 'bounced' && !recip.bounced_at) patch.bounced_at = nowIso;

  if (Object.keys(patch).length > 0) {
    await supabase.from('campaign_recipients').update(patch).eq('id', recip.id);
    return { matched: true, updated: true };
  }
  return { matched: true, updated: false };
}
