// Pure digest helpers — no Deno or DOM imports so this file compiles
// both in Deno (the edge function) and Node (the vitest unit tests).
//
// The bucketing logic mirrors src/features/offers/followUpBuckets.ts.
// We keep a separate copy here on purpose: edge functions are bundled
// independently and we don't want to couple deploy to src/ paths.

export interface DigestOffer {
  id: string;
  stage: string | null;
  sent_at: string | null;
  last_activity_at: string | null;
  next_followup_at: string | null;
  total_period: number | string | null;
  total_monthly: number | string | null;
  customer_name: string | null;
  customer_company: string | null;
  creator_id: string | null;
  creator_name: string | null;
}

export type BucketKey = 'hot' | 'overdue' | 'dueToday';

export interface BucketedOffer {
  offer: DigestOffer;
  bucket: BucketKey;
}

export interface CreatorGroup {
  creatorId: string;
  creatorName: string;
  hot: DigestOffer[];
  overdue: DigestOffer[];
  dueToday: DigestOffer[];
}

export interface DigestData {
  generatedAt: Date;
  total: number;
  totalHot: number;
  totalOverdue: number;
  totalDueToday: number;
  groups: CreatorGroup[];
  // Per-offer recent open count (last 7 days). Used by the renderer
  // to show "👁 ×N" next to hot offers.
  opensByOfferId: Map<string, number>;
}

// "More than 2 opens in 7 days" → ≥3.
export const HOT_TRAIL_OPEN_THRESHOLD = 3;
export const HOT_TRAIL_LOOKBACK_DAYS = 7;

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function dealValue(o: DigestOffer): number {
  const period = Number(o.total_period || 0);
  if (period > 0) return period;
  return Number(o.total_monthly || 0);
}

// Returns 'hot' / 'overdue' / 'dueToday' / null.
//
// 'hot' takes precedence: an offer the customer keeps reopening is
// the strongest signal we have, and we want it at the top of the
// digest regardless of any scheduled follow-up date. We deliberately
// skip the in-app 'stale' bucket here — stale offers without any
// scheduled follow-up date would otherwise dominate the inbox.
export function classifyOffer(
  o: DigestOffer,
  now: Date,
  recentOpens: number,
): BucketKey | null {
  if (o.stage !== 'offer_sent') return null;

  if (recentOpens >= HOT_TRAIL_OPEN_THRESHOLD) return 'hot';

  if (!o.next_followup_at) return null;
  const due = new Date(o.next_followup_at);
  if (Number.isNaN(due.getTime())) return null;
  if (due.getTime() < now.getTime()) {
    return isSameLocalDay(due, now) ? 'dueToday' : 'overdue';
  }
  if (isSameLocalDay(due, now)) return 'dueToday';
  return null;
}

export function buildDigest(
  offers: DigestOffer[],
  now: Date,
  opensByOfferId: Map<string, number> = new Map(),
): DigestData {
  const byCreator = new Map<string, CreatorGroup>();
  let totalHot = 0;
  let totalOverdue = 0;
  let totalDueToday = 0;

  for (const o of offers) {
    const opens = opensByOfferId.get(o.id) || 0;
    const bucket = classifyOffer(o, now, opens);
    if (!bucket) continue;

    // Group key is creator_id when present so two reps with the same
    // display name still get separate sections; fall back to name.
    const key = o.creator_id || o.creator_name || '__unknown__';
    let group = byCreator.get(key);
    if (!group) {
      group = {
        creatorId: o.creator_id || '',
        creatorName: o.creator_name || 'Ohne Ersteller',
        hot: [],
        overdue: [],
        dueToday: [],
      };
      byCreator.set(key, group);
    }
    if (bucket === 'hot') {
      group.hot.push(o);
      totalHot++;
    } else if (bucket === 'overdue') {
      group.overdue.push(o);
      totalOverdue++;
    } else {
      group.dueToday.push(o);
      totalDueToday++;
    }
  }

  // Sort offers within each creator by deal value desc — biggest first.
  // Hot bucket also gets a secondary sort by open count desc so the
  // most engaged prospect bubbles up.
  const byValue = (a: DigestOffer, b: DigestOffer) => dealValue(b) - dealValue(a);
  const byOpensThenValue = (a: DigestOffer, b: DigestOffer) => {
    const oa = opensByOfferId.get(a.id) || 0;
    const ob = opensByOfferId.get(b.id) || 0;
    if (ob !== oa) return ob - oa;
    return byValue(a, b);
  };
  const groups = [...byCreator.values()];
  for (const g of groups) {
    g.hot.sort(byOpensThenValue);
    g.overdue.sort(byValue);
    g.dueToday.sort(byValue);
  }
  // Sort creators by total open count desc, then name asc for stability.
  groups.sort((a, b) => {
    const ac = a.hot.length + a.overdue.length + a.dueToday.length;
    const bc = b.hot.length + b.overdue.length + b.dueToday.length;
    if (bc !== ac) return bc - ac;
    return a.creatorName.localeCompare(b.creatorName);
  });

  return {
    generatedAt: now,
    total: totalHot + totalOverdue + totalDueToday,
    totalHot,
    totalOverdue,
    totalDueToday,
    groups,
    opensByOfferId,
  };
}

function fmtEur(n: number): string {
  return n.toLocaleString('de-AT', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-AT');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function offerLabel(o: DigestOffer): string {
  return o.customer_company || o.customer_name || 'Ohne Name';
}

function offerValueLabel(o: DigestOffer): string {
  const period = Number(o.total_period || 0);
  if (period > 0) return `€ ${fmtEur(period)}`;
  const monthly = Number(o.total_monthly || 0);
  if (monthly > 0) return `€ ${fmtEur(monthly)}/Mo`;
  return '';
}

// Build the deep-link to the SendFollowupModal for a specific offer.
// When the rep taps a row in the digest email, this URL drops them
// straight into the compose modal — Phase 2 of the follow-up flow.
// Returns null when no app URL is configured (renderer falls back to
// a non-link row).
function buildFollowupDeepLink(appBaseUrl: string | null | undefined, offerId: string): string | null {
  if (!appBaseUrl) return null;
  const trimmed = appBaseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({
    action: 'send-followup',
    offer: offerId,
    utm_source: 'digest',
  });
  return `${trimmed}/?${params.toString()}`;
}

function renderRow(
  o: DigestOffer,
  kind: BucketKey,
  opens: number,
  appBaseUrl: string | null | undefined,
): string {
  const label = escapeHtml(offerLabel(o));
  const value = escapeHtml(offerValueLabel(o));
  let meta = '';
  if (kind === 'hot') {
    meta = `${opens}× geöffnet in den letzten ${HOT_TRAIL_LOOKBACK_DAYS} Tagen`;
  } else if (kind === 'overdue') {
    meta = `Fällig ${escapeHtml(fmtDateTime(o.next_followup_at || ''))}`;
  } else if (kind === 'dueToday') {
    meta = `Heute ${escapeHtml(fmtDateTime(o.next_followup_at || ''))}`;
  }
  const sentBit = o.sent_at ? ` · gesendet ${escapeHtml(fmtDate(o.sent_at))}` : '';

  // Wrap the entire row content in an <a> when we have an app URL.
  // We use display:block on the anchor inside the table cell so the
  // whole row remains tappable. Mail clients vary in how they style
  // <a>, so we explicitly reset color and underline.
  const deepLink = buildFollowupDeepLink(appBaseUrl, o.id);
  const labelCell = deepLink
    ? `<a href="${escapeHtml(deepLink)}" style="display:block;color:inherit;text-decoration:none;">
         <div style="font-weight:600;color:#1e293b;font-size:13px;">${label}</div>
         <div style="color:#64748b;font-size:11px;margin-top:2px;">${meta}${sentBit}</div>
         <div style="color:#2563eb;font-size:10px;margin-top:4px;text-decoration:underline;">→ Folgemail senden</div>
       </a>`
    : `<div style="font-weight:600;color:#1e293b;font-size:13px;">${label}</div>
       <div style="color:#64748b;font-size:11px;margin-top:2px;">${meta}${sentBit}</div>`;

  return `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">
        ${labelCell}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#475569;font-size:12px;white-space:nowrap;">
        ${value}
      </td>
    </tr>`;
}

function renderGroup(
  g: CreatorGroup,
  opensByOfferId: Map<string, number>,
  appBaseUrl: string | null | undefined,
): string {
  const total = g.hot.length + g.overdue.length + g.dueToday.length;
  const sections: string[] = [];

  if (g.hot.length > 0) {
    sections.push(`
      <tr><td colspan="2" style="padding:10px 12px 6px;background:#fdf2f8;color:#be185d;font-weight:700;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;">
        Heiße Spur (${g.hot.length}) — Kaufsignal
      </td></tr>
      ${g.hot.map((o) => renderRow(o, 'hot', opensByOfferId.get(o.id) || 0, appBaseUrl)).join('')}
    `);
  }
  if (g.overdue.length > 0) {
    sections.push(`
      <tr><td colspan="2" style="padding:10px 12px 6px;background:#fef2f2;color:#b91c1c;font-weight:700;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;">
        Überfällig (${g.overdue.length})
      </td></tr>
      ${g.overdue.map((o) => renderRow(o, 'overdue', opensByOfferId.get(o.id) || 0, appBaseUrl)).join('')}
    `);
  }
  if (g.dueToday.length > 0) {
    sections.push(`
      <tr><td colspan="2" style="padding:10px 12px 6px;background:#fffbeb;color:#b45309;font-weight:700;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;">
        Heute fällig (${g.dueToday.length})
      </td></tr>
      ${g.dueToday.map((o) => renderRow(o, 'dueToday', opensByOfferId.get(o.id) || 0, appBaseUrl)).join('')}
    `);
  }

  return `
  <div style="margin:0 0 24px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
    <div style="padding:12px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:baseline;">
      <span style="font-weight:700;color:#1e293b;font-size:14px;">${escapeHtml(g.creatorName)}</span>
      <span style="color:#64748b;font-size:12px;">${total} offen</span>
    </div>
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
      ${sections.join('')}
    </table>
  </div>`;
}

export interface RenderOptions {
  // Public base URL of the SPA (e.g. https://app.kitz.example). When
  // provided, each digest row becomes a deep-link that pre-opens the
  // SendFollowupModal for that offer (Phase 2 of the follow-up flow).
  // Omit / null for plain rows.
  appBaseUrl?: string | null;
}

export function renderDigestHtml(data: DigestData, opts: RenderOptions = {}): string {
  const dateStr = data.generatedAt.toLocaleDateString('de-AT', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  const appBaseUrl = opts.appBaseUrl ?? null;

  const groupsHtml = data.groups.length === 0
    ? `<p style="color:#64748b;font-size:14px;">Keine offenen oder überfälligen Follow-ups.</p>`
    : data.groups.map((g) => renderGroup(g, data.opensByOfferId, appBaseUrl)).join('');

  const summary = [
    data.totalHot > 0 ? `${data.totalHot} heiße Spur` : null,
    `${data.totalOverdue} überfällig`,
    `${data.totalDueToday} heute fällig`,
  ].filter(Boolean).join(' · ');

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;">
    <div style="background:#32373c;padding:20px 28px;">
      <div style="display:inline-block;background:#ffffff;color:#dc2626;font-weight:bold;padding:6px 12px;border-radius:6px;font-size:14px;">KITZ</div>
      <span style="color:#ffffff;margin-left:12px;font-size:13px;">Follow-up Digest</span>
    </div>
    <div style="padding:24px 28px;">
      <h1 style="color:#1e293b;font-size:18px;margin:0 0 6px;">${escapeHtml(dateStr)}</h1>
      <p style="color:#64748b;font-size:13px;margin:0 0 20px;">${summary}</p>
      ${groupsHtml}
      <p style="color:#94a3b8;font-size:11px;margin:24px 0 0;">
        Automatisch generiert · ${data.groups.length} Ersteller mit offenen Follow-ups
      </p>
    </div>
  </div>
</body></html>`;
}

export function digestSubject(data: DigestData): string {
  const dateStr = data.generatedAt.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
  const hotPrefix = data.totalHot > 0 ? `🔥 ${data.totalHot} heiße Spur · ` : '';
  return `Follow-ups ${dateStr} — ${hotPrefix}${data.totalOverdue} überfällig, ${data.totalDueToday} heute`;
}
