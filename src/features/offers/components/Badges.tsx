interface BadgeConfig {
  label: string;
  color: string;
}

export const STATUS_CONFIG: Record<string, BadgeConfig> = {
  draft:     { label: 'Entwurf',     color: 'bg-slate-100 text-slate-600' },
  sent:      { label: 'Gesendet',    color: 'bg-blue-100 text-blue-700' },
  delivered: { label: 'Zugestellt',  color: 'bg-green-100 text-green-700' },
  opened:    { label: 'Gelesen',     color: 'bg-yellow-100 text-yellow-700' },
  accepted:  { label: 'Angenommen',  color: 'bg-emerald-100 text-emerald-700' },
  rejected:  { label: 'Abgelehnt',   color: 'bg-red-100 text-red-700' },
  expired:   { label: 'Abgelaufen',  color: 'bg-slate-100 text-slate-400' },
  bounced:   { label: 'Unzustellbar', color: 'bg-red-100 text-red-700' },
};

export const STAGE_CONFIG: Record<string, BadgeConfig> = {
  new:        { label: 'Neu',                color: 'bg-slate-100 text-slate-600' },
  offer_sent: { label: 'Angebot gesendet',   color: 'bg-blue-100 text-blue-700' },
  closed:     { label: 'Abgeschlossen',      color: 'bg-emerald-100 text-emerald-700' },
  lost:       { label: 'Verloren',            color: 'bg-red-100 text-red-700' },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft!;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${cfg.color}`} style={{ fontSize: 11 }}>
      {cfg.label}
    </span>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  const cfg = STAGE_CONFIG[stage] ?? STAGE_CONFIG.new!;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${cfg.color}`} style={{ fontSize: 11 }}>
      {cfg.label}
    </span>
  );
}

export const ACTIVITY_KIND_CONFIG: Record<string, BadgeConfig> = {
  call:    { label: 'Telefonat', color: 'bg-blue-100 text-blue-700' },
  email:   { label: 'E-Mail',    color: 'bg-purple-100 text-purple-700' },
  meeting: { label: 'Meeting',   color: 'bg-amber-100 text-amber-700' },
  note:    { label: 'Notiz',     color: 'bg-slate-100 text-slate-600' },
};

export const ACTIVITY_OUTCOME_CONFIG: Record<string, BadgeConfig> = {
  no_answer:          { label: 'Nicht erreicht',     color: 'bg-slate-100 text-slate-600' },
  voicemail:          { label: 'Mailbox',            color: 'bg-slate-100 text-slate-600' },
  callback_scheduled: { label: 'Rückruf vereinbart', color: 'bg-blue-100 text-blue-700' },
  postponed:          { label: 'Verschoben',         color: 'bg-amber-100 text-amber-700' },
  interested:         { label: 'Interessiert',       color: 'bg-emerald-100 text-emerald-700' },
  hesitant:           { label: 'Zögerlich',          color: 'bg-yellow-100 text-yellow-700' },
  not_interested:     { label: 'Kein Interesse',     color: 'bg-red-100 text-red-700' },
  decision_pending:   { label: 'Entscheidet',        color: 'bg-indigo-100 text-indigo-700' },
  sent_info:          { label: 'Info gesendet',      color: 'bg-purple-100 text-purple-700' },
};

// Default outcome ordering for the picker. Most-used first.
export const ACTIVITY_OUTCOME_ORDER = [
  'no_answer',
  'voicemail',
  'callback_scheduled',
  'postponed',
  'interested',
  'hesitant',
  'decision_pending',
  'sent_info',
  'not_interested',
] as const;

export function ActivityKindBadge({ kind }: { kind: string }) {
  const cfg = ACTIVITY_KIND_CONFIG[kind] ?? ACTIVITY_KIND_CONFIG.note!;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${cfg.color}`} style={{ fontSize: 11 }}>
      {cfg.label}
    </span>
  );
}

export function ActivityOutcomeBadge({ outcome }: { outcome: string }) {
  const cfg = ACTIVITY_OUTCOME_CONFIG[outcome];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${cfg.color}`} style={{ fontSize: 11 }}>
      {cfg.label}
    </span>
  );
}
