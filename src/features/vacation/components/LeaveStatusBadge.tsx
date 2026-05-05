import type { LeaveStatus } from '../types';

interface BadgeConfig { label: string; color: string }

const STATUS_CONFIG: Record<LeaveStatus, BadgeConfig> = {
  pending:   { label: 'Offen',      color: 'bg-amber-100 text-amber-800' },
  approved:  { label: 'Genehmigt',  color: 'bg-emerald-100 text-emerald-700' },
  rejected:  { label: 'Abgelehnt',  color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Storniert',  color: 'bg-slate-100 text-slate-500' },
};

export default function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${cfg.color}`}
      style={{ fontSize: 11 }}
    >
      {cfg.label}
    </span>
  );
}
