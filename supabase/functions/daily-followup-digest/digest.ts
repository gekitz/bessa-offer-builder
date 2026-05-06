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

export type BucketKey = 'overdue' | 'dueToday';

export interface BucketedOffer {
  offer: DigestOffer;
  bucket: BucketKey;
}

export interface CreatorGroup {
  creatorId: string;
  creatorName: string;
  overdue: DigestOffer[];
  dueToday: DigestOffer[];
}

export interface DigestData {
  generatedAt: Date;
  total: number;
  totalOverdue: number;
  totalDueToday: number;
  groups: CreatorGroup[];
}

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

// Returns 'overdue' / 'dueToday' / null. Unlike the in-app FollowUpsPage
// we deliberately skip the 'stale' bucket: the digest is a daily nudge
// for time-sensitive items, and stale offers without any scheduled
// follow-up date would otherwise dominate the inbox forever.
export function classifyOffer(o: DigestOffer, now: Date): BucketKey | null {
  if (o.stage !== 'offer_sent') return null;
  if (!o.next_followup_at) return null;
  const due = new Date(o.next_followup_at);
  if (Number.isNaN(due.getTime())) return null;
  if (due.getTime() < now.getTime()) {
    return isSameLocalDay(due, now) ? 'dueToday' : 'overdue';
  }
  if (isSameLocalDay(due, now)) return 'dueToday';
  return null;
}

export function buildDigest(offers: DigestOffer[], now: Date): DigestData {
  const byCreator = new Map<string, CreatorGroup>();
  let totalOverdue = 0;
  let totalDueToday = 0;

  for (const o of offers) {
    const bucket = classifyOffer(o, now);
    if (!bucket) continue;

    // Group key is creator_id when present so two reps with the same
    // display name still get separate sections; fall back to name.
    const key = o.creator_id || o.creator_name || '__unknown__';
    let group = byCreator.get(key);
    if (!group) {
      group = {
        creatorId: o.creator_id || '',
        creatorName: o.creator_name || 'Ohne Ersteller',
        overdue: [],
        dueToday: [],
      };
      byCreator.set(key, group);
    }
    if (bucket === 'overdue') {
      group.overdue.push(o);
      totalOverdue++;
    } else {
      group.dueToday.push(o);
      totalDueToday++;
    }
  }

  // Sort offers within each creator by deal value desc — biggest first.
  const byValue = (a: DigestOffer, b: DigestOffer) => dealValue(b) - dealValue(a);
  const groups = [...byCreator.values()];
  for (const g of groups) {
    g.overdue.sort(byValue);
    g.dueToday.sort(byValue);
  }
  // Sort creators by total open count desc, then name asc for stability.
  groups.sort((a, b) => {
    const ac = a.overdue.length + a.dueToday.length;
    const bc = b.overdue.length + b.dueToday.length;
    if (bc !== ac) return bc - ac;
    return a.creatorName.localeCompare(b.creatorName);
  });

  return {
    generatedAt: now,
    total: totalOverdue + totalDueToday,
    totalOverdue,
    totalDueToday,
    groups,
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

function renderRow(o: DigestOffer, kind: BucketKey): string {
  const label = escapeHtml(offerLabel(o));
  const value = escapeHtml(offerValueLabel(o));
  const meta = kind === 'overdue'
    ? `Fällig ${escapeHtml(fmtDateTime(o.next_followup_at || ''))}`
    : `Heute ${escapeHtml(fmtDateTime(o.next_followup_at || ''))}`;
  const sentBit = o.sent_at ? ` · gesendet ${escapeHtml(fmtDate(o.sent_at))}` : '';
  return `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">
        <div style="font-weight:600;color:#1e293b;font-size:13px;">${label}</div>
        <div style="color:#64748b;font-size:11px;margin-top:2px;">${meta}${sentBit}</div>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#475569;font-size:12px;white-space:nowrap;">
        ${value}
      </td>
    </tr>`;
}

function renderGroup(g: CreatorGroup): string {
  const total = g.overdue.length + g.dueToday.length;
  const sections: string[] = [];

  if (g.overdue.length > 0) {
    sections.push(`
      <tr><td colspan="2" style="padding:10px 12px 6px;background:#fef2f2;color:#b91c1c;font-weight:700;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;">
        Überfällig (${g.overdue.length})
      </td></tr>
      ${g.overdue.map((o) => renderRow(o, 'overdue')).join('')}
    `);
  }
  if (g.dueToday.length > 0) {
    sections.push(`
      <tr><td colspan="2" style="padding:10px 12px 6px;background:#fffbeb;color:#b45309;font-weight:700;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;">
        Heute fällig (${g.dueToday.length})
      </td></tr>
      ${g.dueToday.map((o) => renderRow(o, 'dueToday')).join('')}
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

export function renderDigestHtml(data: DigestData): string {
  const dateStr = data.generatedAt.toLocaleDateString('de-AT', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  const groupsHtml = data.groups.length === 0
    ? `<p style="color:#64748b;font-size:14px;">Keine offenen oder überfälligen Follow-ups.</p>`
    : data.groups.map(renderGroup).join('');

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
      <p style="color:#64748b;font-size:13px;margin:0 0 20px;">
        ${data.totalOverdue} überfällig · ${data.totalDueToday} heute fällig
      </p>
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
  return `Follow-ups ${dateStr} — ${data.totalOverdue} überfällig, ${data.totalDueToday} heute`;
}
