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
