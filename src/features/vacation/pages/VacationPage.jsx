import { useEffect, useState } from 'react';
import { AlertCircle, Calendar, Loader2, MapPin, Users } from 'lucide-react';
import { listEmployees, listStandorte } from '../api/vacationApi';

// Placeholder Urlaubsplaner page — wires the AppShell nav entry to a
// real screen and verifies the API + migration round-trip.
//
// Once the rules-engine UI lands (Phase F-3 onwards: leave-request
// form, calendar view, approver inbox, balance dashboard) this file
// becomes the layout/router for those subviews.
export default function VacationPage() {
  const [employees, setEmployees] = useState([]);
  const [standorte, setStandorte] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [es, ss] = await Promise.all([listEmployees(), listStandorte()]);
        if (cancelled) return;
        setEmployees(es);
        setStandorte(ss);
      } catch (e) {
        if (!cancelled) setError(e.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex-1 overflow-auto px-4 py-4 md:px-8 md:py-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={20} className="text-red-600" />
          <h1 className="font-bold text-slate-700" style={{ fontSize: 18 }}>Urlaubsplaner</h1>
        </div>

        <div className="bg-white rounded-xl border-2 border-slate-200 p-5 mb-4">
          <p className="text-slate-600" style={{ fontSize: 13 }}>
            Modul in Entwicklung. Datenmodell und Regelwerk sind verdrahtet,
            die UI (Antrag stellen, Kalenderansicht, Genehmigungs-Inbox)
            folgt in den nächsten Schritten.
          </p>
        </div>

        {/* State: loading */}
        {loading && (
          <div className="text-center py-12 text-slate-400">
            <Loader2 size={28} className="mx-auto mb-3 animate-spin" />
            <p style={{ fontSize: 13 }}>Mitarbeiter werden geladen…</p>
          </div>
        )}

        {/* State: error (probably migration not yet applied) */}
        {!loading && error && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-900 mb-1" style={{ fontSize: 14 }}>
                  Mitarbeiterdaten konnten nicht geladen werden
                </div>
                <p className="text-amber-800 mb-2" style={{ fontSize: 12 }}>
                  Wahrscheinlich wurde die Migration noch nicht angewendet.
                  Pfad:{' '}
                  <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">
                    supabase/migrations/20260504120000_create_workforce.sql
                  </code>
                </p>
                <p className="text-amber-700 font-mono" style={{ fontSize: 11 }}>{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* State: success — read-only employee list grouped by Standort */}
        {!loading && !error && employees.length > 0 && (
          <div className="bg-white rounded-xl border-2 border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
              <Users size={14} className="text-slate-500" />
              <span className="font-bold text-slate-600" style={{ fontSize: 12 }}>
                Mitarbeiter ({employees.length})
              </span>
            </div>
            {standorte.map((s) => {
              const ours = employees.filter((e) => e.standortId === s.id);
              if (ours.length === 0) return null;
              return (
                <div key={s.id} className="border-b border-slate-100 last:border-b-0">
                  <div className="px-4 py-2 bg-slate-50/50 flex items-center gap-1.5 text-slate-500" style={{ fontSize: 11 }}>
                    <MapPin size={11} />
                    <span className="font-semibold uppercase tracking-wider">{s.name}</span>
                    <span className="text-slate-400">({ours.length})</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {ours.map((e) => (
                      <div key={e.id} className="px-4 py-2.5 flex items-center justify-between">
                        <div>
                          <div className="font-medium text-slate-700" style={{ fontSize: 13 }}>{e.name}</div>
                          <div className="text-slate-400" style={{ fontSize: 11 }}>{e.code}</div>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400" style={{ fontSize: 11 }}>
                          <span>{e.weeklyHours}h/Woche</span>
                          {e.employmentType !== 'fulltime' && (
                            <span className="bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
                              {e.employmentType}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* State: success but no employees (migration applied but seed didn't run?) */}
        {!loading && !error && employees.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Users size={32} className="mx-auto mb-2 opacity-50" />
            <p style={{ fontSize: 13 }}>Noch keine Mitarbeiter im System.</p>
          </div>
        )}
      </div>
    </div>
  );
}
