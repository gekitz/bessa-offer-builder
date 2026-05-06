// Reusable follow-up email templates for the SendFollowupModal.
// All copy is in formal Sie-form to match how reps already write to
// customers. Templates render against a small offer projection so we
// don't pull in the full DB row shape — keeps this file Deno- and
// Node-compatible if we ever want to use it from an edge function.

export interface TemplateOfferShape {
  id: string;
  customer_name?: string | null;
  customer_company?: string | null;
  creator_name?: string | null;
  creator_email?: string | null;
  total_monthly?: number | string | null;
  total_period?: number | string | null;
  total_once?: number | string | null;
  sent_at?: string | null;
  email_subject?: string | null;
  // Internal briefing — shown to the rep in the modal so the
  // original ask is anchored next to the compose area. Never
  // rendered into outgoing email bodies.
  briefing?: string | null;
}

export interface RenderedTemplate {
  subject: string;
  body: string;
}

export type FollowupTemplateId =
  | 'sanity_check'
  | 'soft_nudge'
  | 'value_reframe'
  | 'breakup'
  | 'free_form';

export interface FollowupTemplate {
  id: FollowupTemplateId;
  label: string;
  description: string;
  // Order matters in the UI — earlier = "softer" stage. The modal
  // uses this for the chip ordering.
  order: number;
  render(offer: TemplateOfferShape, ctx: TemplateContext): RenderedTemplate;
}

export interface TemplateContext {
  // Recent open count from email_events. Used by the suggester and
  // by templates that can reference engagement.
  recentOpens?: number;
  // The "now" used for date math; injected so tests are deterministic.
  now?: Date;
}

function safeName(o: TemplateOfferShape): string {
  return o.customer_name || o.customer_company || 'Sehr geehrte Damen und Herren';
}

function greeting(o: TemplateOfferShape): string {
  if (o.customer_name) return `Sehr geehrte/r Frau / Herr ${o.customer_name},`;
  if (o.customer_company) return `Sehr geehrte Damen und Herren bei ${o.customer_company},`;
  return 'Sehr geehrte Damen und Herren,';
}

function signature(o: TemplateOfferShape): string {
  const name = o.creator_name || 'Ihr Kitz Team';
  return `Mit freundlichen Grüßen\n${name}\nKitz Computer & Office GmbH`;
}

function fmtEur(n: number): string {
  return n.toLocaleString('de-AT', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function dealValueLine(o: TemplateOfferShape): string {
  const monthly = Number(o.total_monthly || 0);
  const once = Number(o.total_once || 0);
  if (monthly > 0 && once > 0) {
    return `€ ${fmtEur(monthly)} pro Monat zzgl. € ${fmtEur(once)} einmalig`;
  }
  if (monthly > 0) return `€ ${fmtEur(monthly)} pro Monat`;
  if (once > 0) return `€ ${fmtEur(once)} einmalig`;
  return '';
}

export function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / (24 * 60 * 60 * 1000));
}

function reSubject(o: TemplateOfferShape): string {
  // Use the persisted subject if available so we thread cleanly even
  // when the rep customized the original send. Fallback mirrors the
  // default subject used by send-offer.
  const original = o.email_subject
    || `Ihr Angebot von Kitz Computer & Office GmbH – ${o.customer_company || o.customer_name || 'Angebot'}`;
  // Don't double-prefix if the original already starts with Re:.
  return /^re:/i.test(original) ? original : `Re: ${original}`;
}

const SANITY_CHECK: FollowupTemplate = {
  id: 'sanity_check',
  label: 'Zustellung prüfen',
  description: 'Kurzer Check, ob das Angebot angekommen ist',
  order: 1,
  render(o) {
    const body = `${greeting(o)}

ich wollte kurz nachfragen, ob mein Angebot vom letzten Mal bei Ihnen angekommen ist. Manchmal landen E-Mails im Spam-Ordner, daher die Sicherheitsabfrage.

Falls Sie Fragen zum Inhalt haben oder weitere Informationen benötigen, melden Sie sich bitte jederzeit – telefonisch oder per Antwort auf diese E-Mail.

${signature(o)}`;
    return { subject: reSubject(o), body };
  },
};

const SOFT_NUDGE: FollowupTemplate = {
  id: 'soft_nudge',
  label: 'Sanfte Erinnerung',
  description: 'Frage nach offenen Punkten, kurz und freundlich',
  order: 2,
  render(o) {
    const value = dealValueLine(o);
    const valueLine = value
      ? `Zur Erinnerung – das Angebot liegt bei ${value}.`
      : '';
    const body = `${greeting(o)}

ich wollte mich noch einmal kurz melden zu meinem Angebot. ${valueLine}

Gibt es offene Fragen, die ich für Sie klären kann, oder einen Punkt, der einer Entscheidung im Weg steht? Eine kurze Rückmeldung – auch ein „aktuell nicht relevant" – hilft mir, Sie nicht unnötig zu kontaktieren.

${signature(o)}`;
    return { subject: reSubject(o), body };
  },
};

const VALUE_REFRAME: FollowupTemplate = {
  id: 'value_reframe',
  label: 'Mehrwert hervorheben',
  description: 'Bezug zu Nutzen / ROI, ideal nach 2 Wochen ohne Reaktion',
  order: 3,
  render(o) {
    const monthly = Number(o.total_monthly || 0);
    const valueHook = monthly > 0
      ? `Zur Einordnung: bei € ${fmtEur(monthly)} pro Monat amortisiert sich die Lösung in der Regel über die Effizienzgewinne im Tagesgeschäft – schnellere Bonierung, weniger Doppelarbeit, saubere Auswertungen.`
      : 'Unsere Bestandskunden berichten regelmäßig, dass sich die Investition über schnellere Abläufe und sauberere Auswertungen kurzfristig amortisiert.';
    const body = `${greeting(o)}

ich möchte Ihnen kurz noch einen Gedanken zu meinem Angebot mitgeben.

${valueHook}

Falls es bei Ihnen einen konkreten Punkt gibt, den ich genauer erläutern oder anpassen soll, schicke ich Ihnen gerne eine angepasste Variante – oder wir vereinbaren ein kurzes Telefonat von 10 Minuten.

${signature(o)}`;
    return { subject: reSubject(o), body };
  },
};

const BREAKUP: FollowupTemplate = {
  id: 'breakup',
  label: 'Abschluss-Mail',
  description: 'Ehrliche Schluss-Anfrage – erfahrungsgemäß die effektivste',
  order: 4,
  render(o) {
    const body = `${greeting(o)}

da ich von Ihnen seit einiger Zeit nichts gehört habe, gehe ich davon aus, dass das Thema bei Ihnen aktuell keine Priorität hat. Das ist absolut nachvollziehbar – ich möchte Ihren Posteingang nicht weiter belasten.

Ich werde mein Angebot daher zunächst schließen. Sollten Sie zu einem späteren Zeitpunkt darauf zurückkommen wollen, genügt eine kurze Antwort auf diese E-Mail – ich melde mich dann sofort wieder.

${signature(o)}`;
    return { subject: reSubject(o), body };
  },
};

const FREE_FORM: FollowupTemplate = {
  id: 'free_form',
  label: 'Frei formulieren',
  description: 'Leere Vorlage zum freien Schreiben',
  order: 5,
  render(o) {
    return {
      subject: reSubject(o),
      body: `${greeting(o)}

\n\n${signature(o)}`,
    };
  },
};

export const FOLLOWUP_TEMPLATES: FollowupTemplate[] = [
  SANITY_CHECK,
  SOFT_NUDGE,
  VALUE_REFRAME,
  BREAKUP,
  FREE_FORM,
];

export function getTemplate(id: FollowupTemplateId): FollowupTemplate {
  const t = FOLLOWUP_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown template id: ${id}`);
  return t;
}

// Pick the template most likely to land given how long the offer has
// been out there and what engagement we've seen. The decision tree
// reflects standard B2B cadence theory: probe → nudge → reframe →
// break up. Free-form is never auto-suggested — it's an explicit
// override the rep selects.
export function suggestTemplate(o: TemplateOfferShape, ctx: TemplateContext = {}): FollowupTemplateId {
  const now = ctx.now || new Date();
  const days = daysSince(o.sent_at ?? null, now) ?? 0;
  const opens = ctx.recentOpens ?? 0;

  if (days >= 21) return 'breakup';
  if (days >= 14) return 'value_reframe';
  if (days >= 7) return 'soft_nudge';
  // Days 3–6: if they've never opened, sanity-check; if they have,
  // nudge already.
  if (opens === 0) return 'sanity_check';
  return 'soft_nudge';
}
