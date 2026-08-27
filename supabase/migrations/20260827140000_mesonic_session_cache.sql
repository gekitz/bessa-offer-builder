-- Geteilter Mesonic-Session-Cache (Ein-Zeilen-Tabelle).
--
-- Warum: Supabase Edge Functions laufen in kurzlebigen Isolates. Der
-- mesonic-proxy cachte die WinLine-Session bisher NUR pro Isolate → jede
-- kalte Instanz loggte sich neu ein. Unter Last (z. B. der Viertl-E-Mail-
-- Backfill) erzeugte das einen Login-Sturm, der WinLines kleinen
-- CRM_API-Session-Pool erschöpfte und ALLE Mesonic-Zugriffe sperrte
-- (die MDP-API hat keinen Logout — Sessions verfallen nur per ~4–5min TTL).
--
-- Mit diesem Cache teilen sich ALLE Isolates EINE Session: pro ~4-min-
-- Fenster entsteht höchstens ein Login, egal wie viele Aufrufe/Isolates.
-- Nur die Edge-Funktion (service_role) greift zu; RLS ohne Policy sperrt
-- anon/authenticated komplett aus.
CREATE TABLE mesonic_session (
  id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  session     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO mesonic_session (id, session) VALUES (1, NULL)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE mesonic_session ENABLE ROW LEVEL SECURITY;
-- Bewusst KEINE Policy: nur service_role (Edge-Funktion) darf lesen/schreiben.
