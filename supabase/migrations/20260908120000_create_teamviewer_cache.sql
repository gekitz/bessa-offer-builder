-- Geteilter TeamViewer-Snapshot-Cache (Ein-Zeilen-Tabelle).
--
-- Warum: die TeamViewer Web-API bietet keine serverseitige Suche nach
-- Name/Kundennummer — man muss ALLE Gruppen + Geräte laden und selbst
-- filtern. Das bei jedem Öffnen eines Kunden zu tun wäre langsam und würde
-- unnötig gegen die API-Ratelimits laufen. Stattdessen legt der
-- teamviewer-proxy einen Snapshot (Gruppen + Geräte, normalisiert) hier ab
-- und frischt ihn nur auf, wenn er älter als das TTL ist.
--
-- Nur die Edge-Funktion (service_role) greift zu; RLS ohne Policy sperrt
-- anon/authenticated komplett aus (analog mesonic_session).
CREATE TABLE teamviewer_cache (
  id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  snapshot    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO teamviewer_cache (id, snapshot) VALUES (1, NULL)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE teamviewer_cache ENABLE ROW LEVEL SECURITY;
-- Bewusst KEINE Policy: nur service_role (Edge-Funktion) darf lesen/schreiben.
