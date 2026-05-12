import { useEffect, useMemo, useState } from 'react';
import { Calendar, CalendarClock, ChevronLeft, ChevronRight, LayoutGrid, Loader2, MapPin, Plus, Users } from 'lucide-react';
import LeaveCalendar from '../../vacation/components/LeaveCalendar';
import TeamView from './TeamView';
import WeekGridView from './WeekGridView';
import AppointmentForm from '../../tickets/components/AppointmentForm';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import {
  DEFAULT_LAYER_VISIBILITY,
  LAYER_LABEL_BY_TYPE,
  type CalendarEvent,
  type CalendarEventType,
  type LayerColor,
  type LayerVisibility,
} from '../types';

// UnifiedCalendar wraps the existing LeaveCalendar and supplements
// it with an appointment-layer summary panel + per-layer visibility
// toggles. LeaveCalendar continues to render leaves/shifts/holidays
// in-cell. The Sprint-5 work (in-cell appointment indicators,
// DayDetailModal extension) will plug into this same data stream.

const LS_KEY = 'kitz.calendar.layerVisibility.v1';
const LS_VIEW_KEY = 'kitz.calendar.viewMode.v1';

type ViewMode = 'month' | 'team' | 'week';

function loadViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'month';
  const stored = window.localStorage.getItem(LS_VIEW_KEY);
  if (stored === 'team' || stored === 'week') return stored;
  return 'month';
}
function saveViewMode(v: ViewMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_VIEW_KEY, v);
  } catch {
    /* ignore quota / private-mode errors */
  }
}

const LAYER_DOT_CLASS: Record<LayerColor, string> = {
  lila: 'bg-violet-500',
  rot: 'bg-red-500',
  orange: 'bg-orange-500',
  gruen: 'bg-emerald-500',
};

const LAYER_RING_CLASS: Record<LayerColor, string> = {
  lila: 'ring-violet-300 bg-violet-50 text-violet-700',
  rot: 'ring-red-300 bg-red-50 text-red-700',
  orange: 'ring-orange-300 bg-orange-50 text-orange-700',
  gruen: 'ring-emerald-300 bg-emerald-50 text-emerald-700',
};

const LAYER_TYPES: CalendarEventType[] = ['appointment', 'leave', 'shift', 'holiday'];

function loadVisibility(): LayerVisibility {
  if (typeof window === 'undefined') return DEFAULT_LAYER_VISIBILITY;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_LAYER_VISIBILITY;
    const parsed = JSON.parse(raw) as Partial<LayerVisibility>;
    return { ...DEFAULT_LAYER_VISIBILITY, ...parsed };
  } catch {
    return DEFAULT_LAYER_VISIBILITY;
  }
}

function saveVisibility(v: LayerVisibility): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(v));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

function appointmentDayLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
}

function appointmentTimeLabel(ev: CalendarEvent): string {
  if (ev.allDay) return 'Ganztägig';
  const start = new Date(ev.startsAt);
  return start.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
}

interface UnifiedCalendarProps {
  reloadKey?: number;
  currentEmployeeId?: string | null;
  onAddRequest?: (start: string, end: string) => void;
}

export default function UnifiedCalendar({
  reloadKey = 0,
  currentEmployeeId = null,
  onAddRequest,
}: UnifiedCalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [visibility, setVisibility] = useState<LayerVisibility>(loadVisibility);
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  // Standalone-create modal — opens with no fromTicket, customer
  // picked via Mesonic CustomerPicker. Optional defaultStartsAt is
  // used by the week-grid click-empty-slot flow.
  const [createState, setCreateState] = useState<
    | { open: true; defaultStartsAt?: string; defaultEndsAt?: string }
    | { open: false }
  >({ open: false });
  // Bumped after a successful create so children that own their own
  // data fetching (TeamView, WeekGridView) re-load.
  const [localReloadKey, setLocalReloadKey] = useState(0);

  useEffect(() => saveVisibility(visibility), [visibility]);
  useEffect(() => saveViewMode(viewMode), [viewMode]);

  const { events, loading, error } = useCalendarEvents(viewYear, viewMonth);

  const appointments = useMemo(
    () => events.filter((e) => e.type === 'appointment'),
    [events],
  );

  function toggleLayer(type: CalendarEventType) {
    setVisibility((v) => ({ ...v, [type]: !v[type] }));
  }

  function gotoToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }
  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('de-AT', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div>
      {/* View-mode toggle + standalone "Neuer Termin" CTA */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setViewMode('month')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition ${
              viewMode === 'month' ? 'bg-white text-red-600 shadow-sm font-medium' : 'text-slate-600 hover:text-slate-800'
            }`}
            data-testid="view-mode-month"
            aria-pressed={viewMode === 'month'}
          >
            <LayoutGrid size={12} />
            Monat
          </button>
          <button
            type="button"
            onClick={() => setViewMode('week')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition ${
              viewMode === 'week' ? 'bg-white text-red-600 shadow-sm font-medium' : 'text-slate-600 hover:text-slate-800'
            }`}
            data-testid="view-mode-week"
            aria-pressed={viewMode === 'week'}
          >
            <CalendarClock size={12} />
            Arbeitswoche
          </button>
          <button
            type="button"
            onClick={() => setViewMode('team')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition ${
              viewMode === 'team' ? 'bg-white text-red-600 shadow-sm font-medium' : 'text-slate-600 hover:text-slate-800'
            }`}
            data-testid="view-mode-team"
            aria-pressed={viewMode === 'team'}
          >
            <Users size={12} />
            Team
          </button>
        </div>
        <button
          type="button"
          onClick={() => setCreateState({ open: true })}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700"
          data-testid="calendar-new-appointment"
        >
          <Plus size={12} />
          Neuer Termin
        </button>
      </div>

      {/* Layer-Filter-Toggles */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-slate-500 mr-1">Ebenen:</span>
        {LAYER_TYPES.map((type) => {
          const isOn = visibility[type];
          const color = type === 'appointment' ? 'lila' : type === 'leave' ? 'rot' : type === 'shift' ? 'orange' : 'gruen';
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleLayer(type)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 transition ${
                isOn ? LAYER_RING_CLASS[color] : 'bg-slate-50 text-slate-400 ring-slate-200 line-through'
              }`}
              data-testid={`layer-toggle-${type}`}
              aria-pressed={isOn}
            >
              <span className={`inline-block w-2 h-2 rounded-full ${LAYER_DOT_CLASS[color]}`} />
              {LAYER_LABEL_BY_TYPE[type]}
            </button>
          );
        })}
      </div>

      {/* Appointment-Layer Summary — only shown in month mode. In
          team mode the grid cells already surface appointments
          (violet dot per day per employee). */}
      {viewMode === 'month' && visibility.appointment && (
        <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-violet-600" />
              <span className="text-xs font-semibold text-violet-800">
                Termine — {monthLabel}
              </span>
              <span className="text-xs text-violet-700/70">
                ({appointments.length} {appointments.length === 1 ? 'Termin' : 'Termine'})
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={prevMonth}
                className="rounded p-1 text-slate-500 hover:bg-white"
                aria-label="Vorheriger Monat"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={gotoToday}
                className="rounded px-2 py-0.5 text-xs text-slate-600 hover:bg-white"
              >
                Heute
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="rounded p-1 text-slate-500 hover:bg-white"
                aria-label="Nächster Monat"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-violet-700/70">
              <Loader2 size={12} className="animate-spin" />
              Lade Termine…
            </div>
          ) : error ? (
            <div className="text-xs text-red-600">{error}</div>
          ) : appointments.length === 0 ? (
            <div className="text-xs text-slate-500">
              Keine Termine in {monthLabel}.{' '}
              <span className="text-slate-400">
                (Termine können ab Sprint 5 direkt im Kalender erstellt werden.)
              </span>
            </div>
          ) : (
            <ul className="space-y-1">
              {appointments.slice(0, 6).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 text-xs text-slate-700"
                >
                  <span className="font-mono text-slate-400 w-12 flex-shrink-0">
                    {appointmentDayLabel(a.startsAt)}
                  </span>
                  <span className="text-slate-400 w-12 flex-shrink-0">
                    {appointmentTimeLabel(a)}
                  </span>
                  <span className="font-medium truncate flex-1">{a.title}</span>
                  {(a.metadata.location as string | undefined) && (
                    <span className="hidden sm:flex items-center gap-1 text-slate-400">
                      <MapPin size={10} />
                      <span className="truncate max-w-32">{a.metadata.location as string}</span>
                    </span>
                  )}
                </li>
              ))}
              {appointments.length > 6 && (
                <li className="text-xs text-slate-400 pl-14">
                  + {appointments.length - 6} weitere
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Switch the main calendar surface based on view mode.
          - Monat: LeaveCalendar with appointment-badge overlay
          - Arbeitswoche: time-grid week (hours × days) with blocks
          - Team: employee × day grid with dot-summary */}
      {viewMode === 'month' && (
        <LeaveCalendar
          initialYear={viewYear}
          initialMonth={viewMonth}
          reloadKey={reloadKey}
          currentEmployeeId={currentEmployeeId}
          onAddRequest={onAddRequest}
          appointments={visibility.appointment ? appointments : []}
        />
      )}
      {viewMode === 'week' && (
        <WeekGridView
          visibility={visibility}
          reloadKey={localReloadKey}
          currentEmployeeId={currentEmployeeId}
          onCreateAt={(start, end) =>
            setCreateState({ open: true, defaultStartsAt: start, defaultEndsAt: end })
          }
        />
      )}
      {viewMode === 'team' && <TeamView visibility={visibility} />}

      {createState.open && (
        <AppointmentForm
          currentEmployeeId={currentEmployeeId}
          defaultStartsAt={createState.defaultStartsAt}
          defaultEndsAt={createState.defaultEndsAt}
          onClose={() => setCreateState({ open: false })}
          onSaved={() => {
            setCreateState({ open: false });
            setLocalReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
