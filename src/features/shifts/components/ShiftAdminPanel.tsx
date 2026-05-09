import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Loader2,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import {
  assignShift,
  fillRemainingShifts,
  listRoster,
  listShifts,
  listSlotKinds,
  removeRosterEntry,
  scaffoldShiftYear,
  unassignShift,
  upsertRosterEntry,
} from '../api/shiftApi';
import type { Employee } from '../../vacation/types';
import type { RosterEntry, Shift, ShiftSlotKind } from '../types';
import { longSlotLabel } from '../lib/format';
import { formatGermanDate } from '../../vacation/lib/formatDate';

interface ShiftAdminPanelProps {
  // All active employees — used by roster + the "assign person" dropdowns.
  employees: Employee[];
}

// Approver-only admin surface. Year picker + two big buttons
// (Slots erstellen / Rest auffüllen), roster editor, and a list of
// every unassigned shift in the year for fast manual seeding.
export default function ShiftAdminPanel({ employees }: ShiftAdminPanelProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [open, setOpen] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [slotKinds, setSlotKinds] = useState<ShiftSlotKind[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [addEmployeeId, setAddEmployeeId] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      listShifts({ rangeStart: `${year}-01-01`, rangeEnd: `${year}-12-31` }),
      listSlotKinds(),
      listRoster(),
    ]).then(([s, k, r]) => {
      if (cancelled) return;
      setShifts(s);
      setSlotKinds(k);
      setRoster(r);
    }).catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [year, reload, open]);

  const employeeById = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees],
  );
  const slotKindById = useMemo(
    () => new Map<number, ShiftSlotKind>(slotKinds.map((k) => [k.id, k])),
    [slotKinds],
  );

  const unassigned = useMemo(
    () => shifts.filter((s) => s.status === 'unassigned'),
    [shifts],
  );
  const assignedCount = shifts.length - unassigned.length;

  const rosterEmployeeIds = useMemo(
    () => new Set(roster.map((r) => r.employeeId)),
    [roster],
  );
  const addCandidates = useMemo(
    () =>
      employees
        .filter((e) => e.active && !rosterEmployeeIds.has(e.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [employees, rosterEmployeeIds],
  );

  async function run(label: string, fn: () => Promise<unknown>): Promise<void> {
    setBusy(label);
    setError(null);
    try {
      await fn();
      setReload((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleScaffold() {
    await run('scaffold', () => scaffoldShiftYear(year));
  }
  async function handleFill() {
    await run('fill', () => fillRemainingShifts(year));
  }
  async function handleAssign(shiftId: string, employeeId: string) {
    if (!employeeId) {
      await run(`unassign-${shiftId}`, () => unassignShift(shiftId));
    } else {
      await run(`assign-${shiftId}`, () => assignShift(shiftId, employeeId));
    }
  }
  async function handleAddRoster() {
    if (!addEmployeeId) return;
    const nextPos = roster.length === 0
      ? 1
      : Math.max(...roster.map((r) => r.position)) + 1;
    await run('roster-add', () => upsertRosterEntry(addEmployeeId, nextPos, true));
    setAddEmployeeId('');
  }
  async function handleRemoveRoster(employeeId: string) {
    await run(`roster-remove-${employeeId}`, () => removeRosterEntry(employeeId));
  }
  async function handleToggleActive(entry: RosterEntry) {
    await run(
      `roster-toggle-${entry.employeeId}`,
      () => upsertRosterEntry(entry.employeeId, entry.position, !entry.active),
    );
  }
  async function handleMove(entry: RosterEntry, dir: -1 | 1) {
    const sorted = [...roster].sort((a, b) => a.position - b.position);
    const i = sorted.findIndex((r) => r.employeeId === entry.employeeId);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    const other = sorted[j]!;
    await run(`roster-move-${entry.employeeId}`, async () => {
      // Two-step swap to avoid the unique constraint on position.
      await upsertRosterEntry(entry.employeeId, -1 * (i + 1), entry.active);
      await upsertRosterEntry(other.employeeId, entry.position, other.active);
      await upsertRosterEntry(entry.employeeId, other.position, entry.active);
    });
  }

  return (
    <div className="bg-white rounded-xl border-2 border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="shift-admin-toggle"
        className="w-full bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
          <CalendarPlus size={14} className="text-slate-500" />
          <span className="font-bold text-slate-600" style={{ fontSize: 12 }}>
            Schichten-Verwaltung
          </span>
        </div>
        {open && (
          <div
            className="flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <span
              role="button"
              tabIndex={0}
              onClick={() => setYear((y) => y - 1)}
              onKeyDown={(e) => { if (e.key === 'Enter') setYear((y) => y - 1); }}
              className="rounded-md px-2 py-0.5 text-slate-500 hover:bg-slate-200 cursor-pointer"
              style={{ fontSize: 11 }}
              aria-label="Vorheriges Jahr"
            >
              ←
            </span>
            <span className="font-semibold text-slate-700" style={{ fontSize: 12 }}>{year}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={() => setYear((y) => y + 1)}
              onKeyDown={(e) => { if (e.key === 'Enter') setYear((y) => y + 1); }}
              className="rounded-md px-2 py-0.5 text-slate-500 hover:bg-slate-200 cursor-pointer"
              style={{ fontSize: 11 }}
              aria-label="Nächstes Jahr"
            >
              →
            </span>
          </div>
        )}
      </button>

      {open && (
      <div className="p-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-start gap-2 text-red-700" style={{ fontSize: 12 }}>
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <div className="font-mono break-all">{error}</div>
          </div>
        )}

        {/* Year actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={handleScaffold}
            className="rounded-lg bg-slate-700 text-white hover:bg-slate-800 px-3 py-1.5 disabled:opacity-50 flex items-center gap-1.5"
            style={{ fontSize: 12 }}
            data-testid="shift-admin-scaffold"
          >
            {busy === 'scaffold' ? <Loader2 size={11} className="animate-spin" /> : <CalendarPlus size={11} />}
            Slots erstellen
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={handleFill}
            className="rounded-lg bg-red-600 text-white hover:bg-red-700 px-3 py-1.5 disabled:opacity-50 flex items-center gap-1.5"
            style={{ fontSize: 12 }}
            data-testid="shift-admin-fill"
          >
            {busy === 'fill' ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
            Rest auffüllen
          </button>
          {!loading && (
            <span className="text-slate-500" style={{ fontSize: 11 }}>
              {assignedCount} zugewiesen · {unassigned.length} offen
            </span>
          )}
          {loading && (
            <span className="flex items-center gap-1 text-slate-400" style={{ fontSize: 11 }}>
              <Loader2 size={11} className="animate-spin" /> lädt…
            </span>
          )}
        </div>

        {/* Roster editor */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 font-semibold text-slate-600" style={{ fontSize: 11 }}>
            Roster ({roster.length})
          </div>
          {roster.length === 0 ? (
            <div className="px-3 py-3 text-slate-500 italic" style={{ fontSize: 12 }}>
              Noch niemand im Roster.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...roster].sort((a, b) => a.position - b.position).map((entry, i, arr) => {
                const emp = employeeById.get(entry.employeeId);
                return (
                  <li key={entry.employeeId} className="px-3 py-2 flex items-center gap-2">
                    <span className="text-slate-400 font-mono" style={{ fontSize: 11, width: 24 }}>{i + 1}.</span>
                    <span className={`flex-1 ${entry.active ? 'text-slate-700' : 'text-slate-400 line-through'}`} style={{ fontSize: 13 }}>
                      {emp?.name ?? entry.employeeId}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(entry)}
                      disabled={busy !== null}
                      className={`rounded-md px-2 py-0.5 ${entry.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'} disabled:opacity-50`}
                      style={{ fontSize: 10 }}
                    >
                      {entry.active ? 'aktiv' : 'inaktiv'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(entry, -1)}
                      disabled={busy !== null || i === 0}
                      className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                      aria-label="Hoch"
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(entry, 1)}
                      disabled={busy !== null || i === arr.length - 1}
                      className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                      aria-label="Runter"
                    >
                      <ArrowDown size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveRoster(entry.employeeId)}
                      disabled={busy !== null}
                      className="rounded-md p-1 text-red-500 hover:bg-red-50 disabled:opacity-50"
                      aria-label="Entfernen"
                    >
                      <Trash2 size={11} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {addCandidates.length > 0 && (
            <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
              <select
                value={addEmployeeId}
                onChange={(e) => setAddEmployeeId(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700"
                style={{ fontSize: 12 }}
              >
                <option value="">— Mitarbeiter zum Roster hinzufügen —</option>
                {addCandidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!addEmployeeId || busy !== null}
                onClick={handleAddRoster}
                className="rounded-md bg-slate-700 text-white hover:bg-slate-800 px-2 py-1 disabled:opacity-50"
                style={{ fontSize: 11 }}
              >
                Hinzufügen
              </button>
            </div>
          )}
        </div>

        {/* Unassigned list — fast manual seeding */}
        {unassigned.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 font-semibold text-slate-600" style={{ fontSize: 11 }}>
              Offene Slots ({unassigned.length})
            </div>
            <ul className="divide-y divide-slate-100 max-h-80 overflow-auto">
              {unassigned.map((s) => (
                <li key={s.id} className="px-3 py-2 flex items-center gap-2">
                  <span className="font-medium text-slate-700 flex-1 truncate" style={{ fontSize: 12 }}>
                    {formatGermanDate(s.date)}
                  </span>
                  <span className="text-slate-500 truncate" style={{ fontSize: 11 }}>
                    {longSlotLabel(slotKindById.get(s.slotKindId), s.slotKindCode)}
                  </span>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      handleAssign(s.id, v);
                    }}
                    disabled={busy !== null}
                    className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-slate-700 disabled:opacity-50"
                    style={{ fontSize: 11 }}
                  >
                    <option value="">— zuweisen —</option>
                    {[...roster]
                      .sort((a, b) => a.position - b.position)
                      .filter((r) => r.active)
                      .map((r) => {
                        const emp = employeeById.get(r.employeeId);
                        return <option key={r.employeeId} value={r.employeeId}>{emp?.name ?? r.employeeId}</option>;
                      })}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Assigned list */}
        {assignedCount > 0 && (
          <details className="border border-slate-200 rounded-lg overflow-hidden">
            <summary className="bg-slate-50 px-3 py-2 border-b border-slate-200 font-semibold text-slate-600 cursor-pointer" style={{ fontSize: 11 }}>
              Zugewiesene Slots ({assignedCount}) — anzeigen
            </summary>
            <ul className="divide-y divide-slate-100 max-h-80 overflow-auto">
              {shifts
                .filter((s) => s.status !== 'unassigned')
                .map((s) => {
                  const emp = s.employeeId ? employeeById.get(s.employeeId) : null;
                  return (
                    <li key={s.id} className="px-3 py-2 flex items-center gap-2">
                      <span className="font-medium text-slate-700 flex-1 truncate" style={{ fontSize: 12 }}>
                        {formatGermanDate(s.date)}
                      </span>
                      <span className="text-slate-500 truncate" style={{ fontSize: 11 }}>
                        {longSlotLabel(slotKindById.get(s.slotKindId), s.slotKindCode)}
                      </span>
                      <span className="font-medium text-slate-700 truncate" style={{ fontSize: 12, minWidth: 120 }}>
                        {emp?.name ?? s.employeeId ?? '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAssign(s.id, '')}
                        disabled={busy !== null || s.status === 'swap_pending'}
                        className="rounded-md p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30"
                        aria-label="Aufheben"
                        title={s.status === 'swap_pending' ? 'Tausch offen — kann nicht aufgehoben werden' : 'Zuweisung aufheben'}
                      >
                        <X size={11} />
                      </button>
                    </li>
                  );
                })}
            </ul>
          </details>
        )}
      </div>
      )}
    </div>
  );
}
