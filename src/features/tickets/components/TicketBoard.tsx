import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { Ticket, TicketStatus } from '../types';
import { resolveDrop, type DropTarget, type TicketMove } from '../lib/boardDnd';

interface TicketBoardProps {
  tickets: Ticket[];
  onTicketClick: (ticket: Ticket) => void;
  // When provided, tickets are grouped into per-pool swimlanes (rows),
  // each with the full set of status columns. Lanes with no tickets are
  // omitted. Without it, a single flat board is rendered.
  swimlanes?: Array<{ id: number | 'none'; name: string }>;
  // Called when a card is dropped somewhere that changes it. Omit to
  // render a read-only board.
  onCardMove?: (ticket: Ticket, move: TicketMove) => void;
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

// A drop id encodes the target cell so onDragEnd can read (status, pool)
// back off the droppable's data. poolKey 'flat' = the single-pool board.
function poolKey(pool: number | 'none' | undefined): string {
  return pool === undefined ? 'flat' : String(pool);
}

function TicketCardBody({ ticket }: { ticket: Ticket }) {
  return (
    <>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[ticket.priority]}`} />
        <span className="font-mono text-xs text-slate-400">{ticket.ticketNumber}</span>
      </div>
      <div className="font-medium text-slate-800 leading-tight" style={{ fontSize: 13 }}>
        {ticket.title}
      </div>
      {ticket.customerName && (
        <div className="text-xs text-slate-500 truncate mt-0.5">{ticket.customerName}</div>
      )}
    </>
  );
}

function DraggableCard({
  ticket,
  draggable,
  onTicketClick,
}: {
  ticket: Ticket;
  draggable: boolean;
  onTicketClick: (ticket: Ticket) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ticket.id,
    disabled: !draggable,
  });
  return (
    <li
      ref={setNodeRef}
      className={`rounded-lg bg-white border border-slate-200 px-2.5 py-2 text-sm hover:border-slate-300 transition ${
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } ${isDragging ? 'opacity-40' : ''}`}
      onClick={() => onTicketClick(ticket)}
      data-testid="board-card"
      {...attributes}
      {...listeners}
    >
      <TicketCardBody ticket={ticket} />
    </li>
  );
}

function DroppableColumn({
  status,
  pool,
  label,
  cls,
  children,
}: {
  status: TicketStatus;
  pool: number | 'none' | undefined;
  label: string;
  cls: string;
  children: React.ReactNode;
  count: number;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${poolKey(pool)}:${status}`,
    data: { status, pool } satisfies DropTarget,
  });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border ${cls} p-2.5 flex flex-col min-h-32 transition ${
        isOver ? 'ring-2 ring-red-400/60' : ''
      }`}
      data-testid={`board-column-${status}`}
    >
      {children}
    </div>
  );
}

function StatusColumns({
  tickets,
  pool,
  draggable,
  onTicketClick,
}: {
  tickets: Ticket[];
  pool: number | 'none' | undefined;
  draggable: boolean;
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
          <DroppableColumn
            key={col.id}
            status={col.id}
            pool={pool}
            label={col.label}
            cls={col.cls}
            count={items.length}
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
                  <DraggableCard key={t.id} ticket={t} draggable={draggable} onTicketClick={onTicketClick} />
                ))
              )}
            </ul>
          </DroppableColumn>
        );
      })}
    </div>
  );
}

export default function TicketBoard({ tickets, onTicketClick, swimlanes, onCardMove }: TicketBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // A small movement threshold so a plain click still opens the ticket
  // rather than starting a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const draggable = !!onCardMove;
  const activeTicket = activeId ? tickets.find((t) => t.id === activeId) ?? null : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const target = e.over?.data.current as DropTarget | undefined;
    if (!target || !onCardMove) return;
    const ticket = tickets.find((t) => t.id === e.active.id);
    if (!ticket) return;
    const move = resolveDrop(ticket, target);
    if (move) onCardMove(ticket, move);
  }

  const board = !swimlanes ? (
    <StatusColumns tickets={tickets} pool={undefined} draggable={draggable} onTicketClick={onTicketClick} />
  ) : (
    (() => {
      const byPool = new Map<number | 'none', Ticket[]>();
      for (const t of tickets) {
        const key = t.poolAbteilungId ?? 'none';
        const arr = byPool.get(key) ?? [];
        arr.push(t);
        byPool.set(key, arr);
      }
      const lanes = swimlanes.filter((l) => (byPool.get(l.id)?.length ?? 0) > 0);
      return (
        <div className="space-y-4">
          {lanes.map((lane) => {
            const laneTickets = byPool.get(lane.id) ?? [];
            return (
              <section key={String(lane.id)} data-testid={`board-lane-${lane.id}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="text-sm font-semibold text-slate-700">{lane.name}</h3>
                  <span className="text-xs text-slate-400">{laneTickets.length}</span>
                </div>
                <StatusColumns
                  tickets={laneTickets}
                  pool={lane.id}
                  draggable={draggable}
                  onTicketClick={onTicketClick}
                />
              </section>
            );
          })}
        </div>
      );
    })()
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div data-testid="ticket-board">{board}</div>
      <DragOverlay>
        {activeTicket ? (
          <div className="rounded-lg bg-white border border-slate-300 shadow-lg px-2.5 py-2 text-sm w-56">
            <TicketCardBody ticket={activeTicket} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
