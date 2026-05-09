import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Bell, BellOff, CalendarDays, ChevronRight, Loader2, Smartphone, X } from 'lucide-react';
import {
  listRoster,
  listShifts,
  listSlotKinds,
  listSwaps,
} from '../api/shiftApi';
import type { Employee } from '../../vacation/types';
import type {
  RosterEntry,
  Shift,
  ShiftSlotKind,
  ShiftSwap,
} from '../types';
import { longSlotLabel } from '../lib/format';
import { formatGermanDate } from '../../vacation/lib/formatDate';
import ShiftDetailModal from './ShiftDetailModal';
import { usePushSubscription } from '../hooks/usePushSubscription';

const PUSH_DISMISSED_KEY = 'kitz.push.banner.dismissed';

interface MyShiftsPanelProps {
  // All active employees — passed to the detail modal so it can render
  // names for the swap partner.
  employees: Employee[];
  // Logged-in employee. The panel renders nothing when null.
  currentEmployeeId: string | null;
  // Externally bumped key forcing a re-fetch (e.g. after a leave
  // request was created/edited that might affect shift overlap).
  reloadKey?: number;
}

const VISIBLE_LIMIT = 6;

// "Meine Schichten" strip — compact list of the logged-in employee's
// next assigned (or swap-pending) shifts. Renders nothing when:
//   * no logged-in employee match (currentEmployeeId is null), or
//   * the employee isn't in the active rotation roster.
//
// Each row is a button that opens the shift detail modal — same
// surface as clicking a chip on the calendar, but reachable in one
// scan from the page top.
export default function MyShiftsPanel({
  employees,
  currentEmployeeId,
  reloadKey = 0,
}: MyShiftsPanelProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [slotKinds, setSlotKinds] = useState<ShiftSlotKind[]>([]);
  const [pendingSwaps, setPendingSwaps] = useState<ShiftSwap[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  // null until the first fetch completes — drives the "is this
  // employee in the rotation" check that gates the entire render.
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalReload, setInternalReload] = useState(0);
  const [openShift, setOpenShift] = useState<Shift | null>(null);
  // Push opt-in. Banner shows when permission is 'prompt' and the
  // user hasn't dismissed it this session, or always when iOS needs
  // PWA install. 'subscribed' / 'denied' / 'unsupported' are silent.
  const push = usePushSubscription(currentEmployeeId);
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem(PUSH_DISMISSED_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (!currentEmployeeId) return;
    let cancelled = false;
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      listShifts({
        employeeId: currentEmployeeId,
        rangeStart: today,
        status: ['assigned', 'swap_pending'],
      }),
      listSlotKinds(),
      listSwaps({ status: 'pending', involvingEmployeeId: currentEmployeeId }),
      listRoster(),
    ]).then(([s, k, sw, r]) => {
      if (cancelled) return;
      setShifts(s);
      setSlotKinds(k);
      setPendingSwaps(sw);
      setRoster(r);
    }).catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    }).finally(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [currentEmployeeId, reloadKey, internalReload]);

  const slotKindById = useMemo(
    () => new Map<number, ShiftSlotKind>(slotKinds.map((k) => [k.id, k])),
    [slotKinds],
  );
  const employeeById = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees],
  );
  const pendingSwapByShiftId = useMemo(() => {
    const out = new Map<string, ShiftSwap>();
    for (const sw of pendingSwaps) {
      out.set(sw.requesterShiftId, sw);
      out.set(sw.targetShiftId, sw);
    }
    return out;
  }, [pendingSwaps]);

  // For the detail modal, we want all shifts (not just mine) so the
  // swap form can pick partner shifts. But that fetch is heavier;
  // load it lazily when the modal opens.
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  async function ensureAllShiftsLoaded() {
    if (allShifts.length > 0) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const all = await listShifts({
        rangeStart: today,
        status: ['assigned', 'swap_pending'],
      });
      setAllShifts(all);
    } catch {
      // Non-fatal; the modal will work but the swap form will see no
      // partner shifts. The error is already surfaced on the page.
    }
  }

  // Hide entirely when not logged in OR not in the active roster.
  const inRoster = !!currentEmployeeId
    && roster.some((r) => r.employeeId === currentEmployeeId && r.active);
  if (!currentEmployeeId) return null;
  if (loaded && !inRoster) return null;

  function handleDismissBanner() {
    setBannerDismissed(true);
    try { sessionStorage.setItem(PUSH_DISMISSED_KEY, '1'); } catch { /* private mode */ }
  }
  const showPushBanner = !bannerDismissed
    && (push.status === 'prompt'
        || push.status === 'permission-granted-no-sub'
        || push.status === 'ios-needs-pwa');

  const visible = shifts.slice(0, VISIBLE_LIMIT);
  const overflow = shifts.length - visible.length;

  return (
    <div className="bg-white rounded-xl border-2 border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
        <CalendarDays size={14} className="text-slate-500" />
        <span className="font-bold text-slate-600" style={{ fontSize: 12 }}>
          Meine Schichten
        </span>
        {!loaded && (
          <Loader2 size={11} className="animate-spin text-slate-400" />
        )}
        {loaded && shifts.length > 0 && (
          <span className="text-slate-400 ml-auto" style={{ fontSize: 11 }}>
            nächste {Math.min(visible.length, VISIBLE_LIMIT)}
          </span>
        )}
      </div>

      {showPushBanner && (
        <div
          className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-start gap-2"
          data-testid="push-opt-in-banner"
        >
          {push.status === 'ios-needs-pwa' ? (
            <Smartphone size={14} className="text-amber-700 flex-shrink-0 mt-0.5" />
          ) : (
            <Bell size={14} className="text-amber-700 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            {push.status === 'ios-needs-pwa' ? (
              <div style={{ fontSize: 12 }}>
                <div className="font-semibold text-amber-900">Push am iPhone</div>
                <div className="text-amber-800 mt-0.5">
                  Im Safari-Menü „Zum Home-Bildschirm“ wählen, dann die App von dort öffnen,
                  um Tausch-Benachrichtigungen zu erhalten.
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12 }}>
                <div className="font-semibold text-amber-900">
                  Tauschanfragen direkt aufs Handy?
                </div>
                <div className="text-amber-800 mt-0.5">
                  Push-Benachrichtigungen aktivieren, damit du sofort weißt, wenn jemand
                  mit dir tauschen möchte.
                </div>
                {push.error && (
                  <div className="mt-1 text-red-700" style={{ fontSize: 11 }}>{push.error}</div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {push.status !== 'ios-needs-pwa' && (
              <button
                type="button"
                onClick={() => void push.request()}
                disabled={push.busy}
                className="rounded-md bg-amber-700 text-white hover:bg-amber-800 px-2.5 py-1 disabled:opacity-50 flex items-center gap-1.5"
                style={{ fontSize: 11 }}
                data-testid="push-opt-in-cta"
              >
                {push.busy && <Loader2 size={10} className="animate-spin" />}
                Aktivieren
              </button>
            )}
            <button
              type="button"
              onClick={handleDismissBanner}
              className="rounded-md p-1 text-amber-700 hover:bg-amber-100"
              aria-label="Schließen"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {push.status === 'subscribed' && (
        <div
          className="px-4 py-1.5 bg-green-50 border-b border-green-100 flex items-center gap-2 text-green-800"
          style={{ fontSize: 11 }}
          data-testid="push-active-strip"
        >
          <Bell size={11} />
          <span>Push aktiv auf diesem Gerät.</span>
          <button
            type="button"
            onClick={() => void push.revoke()}
            disabled={push.busy}
            className="ml-auto inline-flex items-center gap-1 text-green-700 hover:text-green-900 disabled:opacity-50"
          >
            <BellOff size={10} /> Deaktivieren
          </button>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 bg-red-50 text-red-700 font-mono break-all" style={{ fontSize: 11 }}>
          {error}
        </div>
      )}

      {loaded && !error && shifts.length === 0 && (
        <div className="px-4 py-4 text-slate-500 italic" style={{ fontSize: 12 }}>
          Keine kommenden Schichten.
        </div>
      )}

      {loaded && !error && visible.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {visible.map((s) => {
            const kind = slotKindById.get(s.slotKindId);
            const swap = pendingSwapByShiftId.get(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  data-testid={`my-shift-${s.id}`}
                  onClick={() => {
                    void ensureAllShiftsLoaded();
                    setOpenShift(s);
                  }}
                  className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left"
                >
                  <span className="font-medium text-slate-700 flex-shrink-0" style={{ fontSize: 13, width: 130 }}>
                    {formatGermanDate(s.date)}
                  </span>
                  <span className="text-slate-500 flex-1 truncate" style={{ fontSize: 12 }}>
                    {longSlotLabel(kind, s.slotKindCode)}
                  </span>
                  {swap && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5" style={{ fontSize: 10 }}>
                      <ArrowLeftRight size={10} />
                      {swap.requesterId === currentEmployeeId ? 'Anfrage offen' : 'Tauschwunsch'}
                    </span>
                  )}
                  <ChevronRight size={13} className="text-slate-300 flex-shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {loaded && !error && overflow > 0 && (
        <div className="px-4 py-2 border-t border-slate-100 text-slate-400 text-center" style={{ fontSize: 11 }}>
          +{overflow} weitere im Kalender
        </div>
      )}

      {openShift && (
        <ShiftDetailModal
          shift={openShift}
          allShifts={allShifts.length > 0 ? allShifts : shifts}
          slotKinds={slotKindById}
          employees={employeeById}
          pendingSwap={pendingSwapByShiftId.get(openShift.id) ?? null}
          currentEmployeeId={currentEmployeeId}
          onClose={() => setOpenShift(null)}
          onChange={() => setInternalReload((k) => k + 1)}
        />
      )}
    </div>
  );
}
