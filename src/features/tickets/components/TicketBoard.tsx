import type { Ticket, TicketStatus } from '../types';

interface TicketBoardProps {
  tickets: Ticket[];
  onTicketClick: (ticket: Ticket) => void;
  // When provided, tickets are grouped into per-pool swimlanes (rows),
  // each with the full set of status columns. Lanes with no tickets are
  // omitted. Without it, a single flat board is rendered.
  swimlanes?: Array<{ id: number | 'none'; name: string }>;
}

const BOARD_COLUMNS: Array<{ id: TicketStatus; label: string; cls: string }> = [
  { id: 'open',        label: 'Offen',       cls: 'border-blue-200 bg-blue-50/40' },
  { id: 'in_progress', label: 'In Arbeit',   cls: 'border-amber-200 bg-amber-50/40' },
  { id: 'waiting',     label: 'Wartend',     cls: 'border-slate-200 bg-slate-50' },
  { id: 'closed',      label: 'Geschlossen', cls: 'border-emerald-200 bg-emerald-50/40' },
];

const PRIORITY_DOT: Record<Ticket['priority'], string> = {
  low:    'bg-slate-300',
  normal: 'bg-slate-400',
  high:   'bg-amber-500',
  urgent: 'bg-red-500',
};

// The 4 status columns for a given set of tickets.
function StatusColumns({
  tickets,
  onTicketClick,
}: {
  tickets: Ticket[];
  onTicketClick: (ticket: Ticket) => void;
}) {
  const byStatus = new Map<TicketStatus, Ticket[]>();
  for (const t of tickets) {
    const arr = byStatus.get(t.status) ?? [];
    arr.push(t);
    byStatus.set(t.status, arr);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {BOARD_COLUMNS.map((col) => {
        const items = byStatus.get(col.id) ?? [];
        return (
          <div
            key={col.id}
            className={`rounded-xl border ${col.cls} p-2.5 flex flex-col min-h-32`}
            data-testid={`board-column-${col.id}`}
          >
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-xs font-semibold text-slate-700">{col.label}</span>
              <span className="text-xs text-slate-500">{items.length}</span>
            </div>
            <ul className="space-y-2 flex-1">
              {items.length === 0 ? (
                <li className="text-xs text-slate-400 text-center py-4">—</li>
              ) : (
                items.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-lg bg-white border border-slate-200 px-2.5 py-2 text-sm cursor-pointer hover:border-slate-300 transition"
                    onClick={() => onTicketClick(t)}
                    data-testid="board-card"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                      <span className="font-mono text-xs text-slate-400">{t.ticketNumber}</span>
                    </div>
                    <div className="font-medium text-slate-800 leading-tight" style={{ fontSize: 13 }}>
                      {t.title}
                    </div>
                    {t.customerName && (
                      <div className="text-xs text-slate-500 truncate mt-0.5">{t.customerName}</div>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export default function TicketBoard({ tickets, onTicketClick, swimlanes }: TicketBoardProps) {
  if (!swimlanes) {
    return (
      <div data-testid="ticket-board">
        <StatusColumns tickets={tickets} onTicketClick={onTicketClick} />
      </div>
    );
  }

  // Group tickets by pool once, then render a lane per non-empty pool.
  const byPool = new Map<number | 'none', Ticket[]>();
  for (const t of tickets) {
    const key = t.poolAbteilungId ?? 'none';
    const arr = byPool.get(key) ?? [];
    arr.push(t);
    byPool.set(key, arr);
  }

  const lanes = swimlanes.filter((l) => (byPool.get(l.id)?.length ?? 0) > 0);

  return (
    <div className="space-y-4" data-testid="ticket-board">
      {lanes.map((lane) => {
        const laneTickets = byPool.get(lane.id) ?? [];
        return (
          <section key={String(lane.id)} data-testid={`board-lane-${lane.id}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="text-sm font-semibold text-slate-700">{lane.name}</h3>
              <span className="text-xs text-slate-400">{laneTickets.length}</span>
            </div>
            <StatusColumns tickets={laneTickets} onTicketClick={onTicketClick} />
          </section>
        );
      })}
    </div>
  );
}
