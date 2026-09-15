// campaign-outcome — reine, unit-testbare Kern-Logik (M2/M3).
//
// Als exportierte, reine Hilfsfunktion extrahiert (wie
// resend-webhook/campaignAttribution.ts), damit sie ohne Deno-Harness
// unit-getestet werden kann. KEINE Top-Level esm.sh/Deno-Referenzen — nur
// index.ts liest Deno.env / importiert createClient. Der Test importiert
// diese Datei cross-tree aus src/features/campaigns/__tests__/.
//
// Zweck (M2): der Viertl-Write-back (Flag + Notiz) läuft SERVER-SEITIG mit
// dem Service-Role-Key, statt vom anonymen Client. (M3): der Outcome-Stamp
// ist idempotent — ein Re-Submit desselben Terminal-Schritts schreibt keine
// zweite Notiz.

// Die 3 Type-A-Terminal-Outcomes. BEWUSST NICHT die vollen
// CAMPAIGN_OUTCOMES (types.ts) — die enthalten offer_accepted (Type B),
// das hier keine Write-back-Verzweigung hat und out of scope ist (C4).
export const RKSV_OUTCOMES = ['authorized', 'quote_requested', 'soft_check'] as const;
export type RksvOutcome = (typeof RKSV_OUTCOMES)[number];

export function isRksvOutcome(v: unknown): v is RksvOutcome {
  return typeof v === 'string' && (RKSV_OUTCOMES as readonly string[]).includes(v);
}

// Sentinel-Aktor für Kampagnen-Write-backs — kein Staff-Benutzer auf der
// öffentlichen Landing-Page. So sind self-reported Antworten im
// viertl_events-Log klar von einer Techniker-Bestätigung unterscheidbar.
export const CAMPAIGN_ACTOR = { id: 'campaign', name: 'RKSV-Kampagne' } as const;

export interface RksvOutcomePayload {
  signatureData?: string;
  signedByName?: string;
  hasWin10?: 'ja' | 'nein' | 'weiss_nicht';
  setupSize?: 'einzelplatz' | 'mehrplatz';
}

export interface RecipientRow {
  id: string;
  token: string;
  subject_type: string;
  subject_id: string;
  started_at: string | null;
  outcome: string | null;
  payload: Record<string, unknown> | null;
}

// Minimales Client-Interface (wie AttributionClient) — nur die Ketten, die
// applyOutcome nutzt. Erlaubt einfache Mocks im Test. Der eq()-Filter gibt
// eine PromiseLike-Terminal (viertl_licenses-Update) zurück, die zusätzlich
// .is().select() anbietet (compare-and-set Outcome-Stamp).
export interface OutcomeUpdateTerminal extends PromiseLike<{ data: RecipientRow[] | null; error: unknown }> {
  is(col: string, val: unknown): {
    select(cols?: string): Promise<{ data: RecipientRow[] | null; error: unknown }>;
  };
}

export interface OutcomeClient {
  from(table: string): {
    update(patch: Record<string, unknown>): {
      eq(col: string, val: unknown): OutcomeUpdateTerminal;
    };
    insert(row: Record<string, unknown>): Promise<{ error: unknown }>;
  };
}

// Baut den menschenlesbaren viertl_events-Notiztext je Outcome. Rein.
export function noteForOutcome(outcome: RksvOutcome, payload: RksvOutcomePayload): string {
  if (outcome === 'authorized') {
    return 'RKSV-Kampagne: Auftrag erteilt (self-reported)';
  }
  if (outcome === 'quote_requested') {
    const label = payload.setupSize === 'mehrplatz' ? 'Mehrplatz' : 'Einzelplatz';
    return `RKSV-Kampagne: Angebot angefordert (${label}, neue Hardware, self-reported)`;
  }
  // soft_check
  return 'RKSV-Kampagne: Remote-OS-Check angefordert (weiß nicht, self-reported)';
}

export interface ApplyOutcomeResult {
  recorded: boolean;    // Outcome-Stamp wurde geschrieben
  wroteBack: boolean;   // Viertl-Write-back (Notiz/Flag) lief
  idempotent: boolean;  // Kein Effekt — Outcome war bereits terminal
}

// Kern: Outcome idempotent stempeln + (nur für viertl_license) den
// Viertl-Write-back ausführen.
//
// M3 (Idempotenz + Race-Härtung): der Outcome-Stamp ist ein atomarer
// compare-and-set — update(...).eq('token').is('outcome', null). Kommen zwei
// gleichzeitige POSTs an, gewinnt genau einer (0 zurückgegebene Zeilen ⇒
// bereits terminalisiert ⇒ kein Write-back). Semantik: "first terminal
// wins" — ein späterer, ABWEICHENDER Outcome auf einer bereits
// terminalisierten Zeile wird ignoriert (der Kunde hat schon eine Aktion
// ausgelöst; das doppelte Auslösen/Doppel-Notiz ist genau der M3-Bug).
export async function applyOutcome(
  client: OutcomeClient,
  recipient: RecipientRow,
  outcome: RksvOutcome,
  payload: RksvOutcomePayload,
): Promise<ApplyOutcomeResult> {
  // Schneller Kurzschluss VOR dem Write, wenn schon derselbe Terminal-Wert
  // gestempelt ist (der klassische Reload+Resubmit-Fall).
  if (recipient.outcome != null) {
    return { recorded: false, wroteBack: false, idempotent: true };
  }

  const nowIso = new Date().toISOString();
  const row: Record<string, unknown> = {
    outcome,
    outcome_at: nowIso,
    payload: { ...(recipient.payload ?? {}), ...payload },
  };
  if (!recipient.started_at) row.started_at = nowIso;

  // Atomarer compare-and-set: nur stempeln, wenn outcome NOCH null ist.
  const { data, error } = await client
    .from('campaign_recipients')
    .update(row)
    .eq('token', recipient.token)
    .is('outcome', null)
    .select('*');
  if (error) throw error;

  // 0 Zeilen ⇒ ein paralleler Request war schneller ⇒ nichts mehr tun.
  if (!data || data.length === 0) {
    return { recorded: false, wroteBack: false, idempotent: true };
  }

  // Viertl-Write-back nur für viertl_license-Subjects. Der Server wählt die
  // subject_id aus der geladenen Zeile (nie aus dem Client-Body).
  if (recipient.subject_type !== 'viertl_license') {
    return { recorded: true, wroteBack: false, idempotent: false };
  }

  if (outcome === 'quote_requested') {
    // Self-reported Hardware-Bedarf zurückschreiben. updated_by_* MUSS
    // mit, damit der Viertl-Audit-Trigger die Feldänderung dem Sentinel
    // zuordnet (C6) — sonst NULL-Aktor.
    const { error: upErr } = await client
      .from('viertl_licenses')
      .update({
        hardware_needed: true,
        updated_by_id: CAMPAIGN_ACTOR.id,
        updated_by_name: CAMPAIGN_ACTOR.name,
      })
      .eq('id', recipient.subject_id);
    if (upErr) throw upErr;
  }

  const { error: noteErr } = await client.from('viertl_events').insert({
    license_id: recipient.subject_id,
    type: 'note',
    message: noteForOutcome(outcome, payload),
    actor_id: CAMPAIGN_ACTOR.id,
    actor_name: CAMPAIGN_ACTOR.name,
  });
  if (noteErr) throw noteErr;

  return { recorded: true, wroteBack: true, idempotent: false };
}
