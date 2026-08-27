-- ════════════════════════════════════════════════════════════════════
-- Viertl (Gastrotouch) Lizenz-Tracking
--
-- Ersetzt die geteilte Excel-Liste "Viertl aktiv". Jede Zeile =
-- eine Gastrotouch-Installation bei einem Mesonic-Kunden. Die
-- Mesonic-Kd.Nr. ist NICHT eindeutig — ein Kunde kann mehrere
-- Standorte/Installationen haben (z. B. Gackernkassa + Hauptkassa).
--
-- Wir tracken drei Dimensionen, die in der Excel in "Status"/"Modell"
-- vermischt waren:
--   • status          — Pipeline: new → waiting → offer_created →
--                        mailed → replied → done (= ATrust erledigt)
--   • hardware_needed  — alte HW kann das verpflichtende ATrust-Update
--                        nicht → neue Hardware nötig (Angebot RCH)
--   • customer_status  — active / closing / closed (Kunde sperrt zu →
--                        Viertl informieren)
--
-- viertl_events ist ein append-only Audit-Log (wer/wann/was) — genau
-- das, was die geteilte Excel nie liefern konnte. Feldänderungen an
-- viertl_licenses werden per Trigger automatisch protokolliert;
-- Aktionen (Mail versendet/geöffnet, Angebot angehängt, Viertl
-- informiert) fügt die App/Edge-Funktion explizit ein.
--
-- RLS ist bewusst permissiv (wie der Rest der App); die Ansicht wird
-- im Frontend abgesichert. actor_*/updated_by_* sind denormalisiert
-- (wie offer_activities.created_by_*), da die App-Auth user_profiles
-- ist, nicht employees.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE viertl_licenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mesonic_kdnr        TEXT NOT NULL,
  name                TEXT NOT NULL,
  contact             TEXT,                        -- z.H. (Ansprechperson)
  street              TEXT,
  plz                 TEXT,
  ort                 TEXT,
  email               TEXT,                        -- Phase 2: aus Mesonic gezogen
  gastrotouch_version TEXT,                        -- z. B. '67.24'
  last_update         DATE,                        -- letztes Software-Update
  hardware_model      TEXT,                        -- Modell (Freitext aus Excel)
  hardware_needed     BOOLEAN NOT NULL DEFAULT FALSE,
  wartung             TEXT NOT NULL DEFAULT 'none'
                      CHECK (wartung IN ('none','sww','sw_hww','miete')),
  status              TEXT NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new','waiting','offer_created','mailed','replied','done')),
  customer_status     TEXT NOT NULL DEFAULT 'active'
                      CHECK (customer_status IN ('active','closing','closed')),
  closed_reason       TEXT,
  closed_at           TIMESTAMPTZ,
  notes               TEXT,
  linked_offer_id     UUID REFERENCES offers(id) ON DELETE SET NULL,
  -- Vom Frontend vor jedem UPDATE gesetzt, damit der Audit-Trigger
  -- weiß, wer geändert hat.
  updated_by_id       TEXT,
  updated_by_name     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_viertl_licenses_kdnr   ON viertl_licenses(mesonic_kdnr);
CREATE INDEX idx_viertl_licenses_status ON viertl_licenses(status);
CREATE INDEX idx_viertl_licenses_cust   ON viertl_licenses(customer_status);
CREATE INDEX idx_viertl_licenses_hw     ON viertl_licenses(hardware_needed) WHERE hardware_needed;

CREATE TRIGGER trg_viertl_licenses_updated_at
  BEFORE UPDATE ON viertl_licenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- ────────────────────────────────────────────────────────────────────
-- viertl_events — append-only Audit-Log + Aktionshistorie
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE viertl_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id  UUID NOT NULL REFERENCES viertl_licenses(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'field_change'
              CHECK (type IN ('field_change','note','email_sent','email_opened','offer_attached','viertl_notified')),
  field       TEXT,                                -- bei field_change
  old_value   TEXT,
  new_value   TEXT,
  message     TEXT,                                -- freier Text (note / Aktionen)
  actor_id    TEXT,
  actor_name  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_viertl_events_license ON viertl_events(license_id, created_at DESC);
CREATE INDEX idx_viertl_events_type    ON viertl_events(type);

-- Audit-Trigger: protokolliert je geänderter (getrackter) Spalte eine
-- Zeile in viertl_events. o IS DISTINCT FROM n fängt NULL-Übergänge
-- sauber ab und verhindert No-op-Logs (z. B. reines updated_at-Touch).
CREATE OR REPLACE FUNCTION log_viertl_license_change() RETURNS TRIGGER AS $$
DECLARE
  fld TEXT; oldv TEXT; newv TEXT;
BEGIN
  FOR fld, oldv, newv IN
    SELECT t.f, t.o, t.n FROM (VALUES
      ('status',              OLD.status,                  NEW.status),
      ('customer_status',     OLD.customer_status,         NEW.customer_status),
      ('wartung',             OLD.wartung,                 NEW.wartung),
      ('gastrotouch_version', OLD.gastrotouch_version,     NEW.gastrotouch_version),
      ('hardware_model',      OLD.hardware_model,          NEW.hardware_model),
      ('hardware_needed',     OLD.hardware_needed::text,   NEW.hardware_needed::text),
      ('email',               OLD.email,                   NEW.email),
      ('closed_reason',       OLD.closed_reason,           NEW.closed_reason),
      ('notes',               OLD.notes,                   NEW.notes)
    ) AS t(f,o,n)
    WHERE t.o IS DISTINCT FROM t.n
  LOOP
    INSERT INTO viertl_events (license_id, type, field, old_value, new_value, actor_id, actor_name)
    VALUES (NEW.id, 'field_change', fld, oldv, newv, NEW.updated_by_id, NEW.updated_by_name);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_viertl_license_audit
  AFTER UPDATE ON viertl_licenses
  FOR EACH ROW EXECUTE FUNCTION log_viertl_license_change();

ALTER TABLE viertl_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE viertl_events   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on viertl_licenses" ON viertl_licenses
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on viertl_events" ON viertl_events
  FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────
-- Seed: 341 Installationen aus "Viertl aktiv 2025-12.xlsx"
-- (Status/Wartung normalisiert, hardware_needed aus Angebot-RCH/
--  Windows-7/32bit-Hinweisen abgeleitet, letztes Update als Datum)
-- ────────────────────────────────────────────────────────────────────
INSERT INTO viertl_licenses
  (mesonic_kdnr, name, contact, street, plz, ort, gastrotouch_version,
   last_update, notes, status, wartung, hardware_model, hardware_needed,
   customer_status, closed_reason)
VALUES
  ('272765', 'Almgasthaus Glocknerblick', 'Elisabeth Granig', 'Allas 13', '9843', 'Großkirchheim', '67.19', '2024-06-25', NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('234409', 'Alpen Adria Hotel GmbH', NULL, 'Presseggersee 2', '9620', 'Hermagor', '67.21', '2025-03-26', 'Hogast: 9687', 'replied', 'none', 'HP 600PD?', FALSE, 'active', NULL),
  ('271825', 'Alpengasthof "Druckerhütte"', 'Inh. Andreas Felfernig', 'St. Oswald 58', '9372', 'Eberstein', '67.10', '2022-04-01', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('233942', 'Alpengasthof Giesslhütte', 'Daniel Markus Fössl', 'Aichberg 77', '9411', 'St. Michael', '67.18', '2023-12-07', NULL, 'replied', 'none', 'PP9635C 2022, PP9635A 2017', FALSE, 'active', NULL),
  ('272228', 'Alpengasthof Hochalmblick', 'Gfrerer Josef und Heidi', 'Stappitz 44', '9822', 'Mallnitz', '66.00', '2017-05-08', 'HGP: 91105', 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('24924', 'Alpengasthof Hoiswirt', 'Fam.Gruber', 'Winkel 161', '8583', 'Modriach', '67.18', '2023-12-11', NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('233702', 'Alte Zollhüttn', 'Sabine Kolar', 'Unterort 42', '9143', 'St. Michael / Bleiburg', '67.19', '2024-07-17', 'HGP: 93176', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236225', 'Altes Brauhaus', 'Riepl Georg', 'Bürgerlustgasse 2', '9100', 'Völkermarkt', '67.08', '2021-11-17', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('231780', 'Altes Brauhaus', 'Breznik GmbH & CoKG', '10. Oktoberplatz 9', '9150', 'Bleiburg', '67.24', '2026-03-10', 'Hogast: 9765', 'done', 'none', 'Übernahme', FALSE, 'active', NULL),
  ('271579', 'Annenhof', 'Grün Gunther', 'Rennsteinerstraße 11', '9500', 'Villach', '67.08', '2021-09-22', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('29821', 'Anton Reinwald & Co OHG', 'Bäckerei - Cafe Konditroei', 'Eisenkappel 74', '9135', 'Bad Eisenkappel', '67.19', NULL, NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236183', 'Apfelschenke Pauliwirt', 'Riedl KG', 'Dorfplatz 1', '9423', 'St.Georgen', '67.18', '2024-02-15', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('23895', 'Aplengasthof Hochegger GmbH', NULL, 'Klippitzthörl 25', '9462', 'Bad St. Leonhard', '67.21', '2024-12-30', 'Hogast: 9304', 'replied', 'none', 'OM CX5', FALSE, 'active', NULL),
  ('29667', 'Bäckerei Haimburger GmbH', 'Franz Haimburger', 'St. Michael 31', '9143', 'St. Michael/Bleiburg', '67.22', '2025-05-08', NULL, 'mailed', 'none', '32bit system', TRUE, 'active', NULL),
  ('236862', 'Bad Kiosk', 'Sulzer Gerald', 'Schwarzviertler Straße 4', '9470', 'St. Paul', '67.19', '2024-05-16', 'vormals Madritsch', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('23804', 'Baldauf Christian', 'Gasthof-Forsterwirt', 'Forst 39', '9412', 'St. Margarethen', '67.24', '2024-04-30', 'Baldauf Christian', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('231993', 'Bäuerle Johann', NULL, 'Hadergassen 4', '9844', 'Heiligenblut', '67.18', '2023-11-29', 'Bäuerle Johann', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('234967', 'Bella Italia Pizzeria', 'Angela Bisignano', 'Kühnsdorf Mitte 18', '9125', 'Kühnsdorf', '67.06', '2021-03-24', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235350', 'Berghof Götschl', 'Kriegl Manfred', 'Theisenegg 5', '9441', 'Twimberg', '67.24', '2024-02-19', NULL, 'done', 'none', 'Pulse P40', FALSE, 'active', NULL),
  ('235278', 'Bettina Maier', 'Naturfreundehaus Klippitztörl', 'Klippitztörl 4', '9462', 'Bad St. Leonhard', '67.18', '2024-03-01', NULL, 'replied', 'none', 'Pulse P40', FALSE, 'active', NULL),
  ('22811', 'Biogasthaus - Pension Wanker', 'Biobauernhof', 'Hadanig 2', '9212', 'Teschelberg', '67.08', '2021-09-27', NULL, 'replied', 'none', 'PP9635C', FALSE, 'active', NULL),
  ('237909', 'Bistro Lorett', 'Claudia Pongratz', 'Loretto Hof 8', '9433', 'St. Andrä', '67.24', '2026-04-16', NULL, 'done', 'none', 'OM C800', FALSE, 'active', NULL),
  ('237875', 'Bistro Siamo OG', NULL, 'Töschling 21', '9212', 'Techelsberg am Wörth', '67.19', '2024-05-08', 'SW-Wartung', 'mailed', 'sww', NULL, FALSE, 'active', NULL),
  ('271713', 'Botzenhart Gesellschaft m.b.H', NULL, 'Wörthersee-Süduferstr.108', '9081', 'Reifnitz am Wörthers', '67.22', '2025-04-30', 'Seehotel Sille', 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('272086', 'Bratwurstkönig', 'Horst Ball', 'Radnig 103', '9620', 'Hermagor', NULL, NULL, 'Standort: Draulände, Villach', 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('235335', 'Buschenschank Tatzer', 'Pirker Dagmar', 'Tatzerweg 5', '9400', 'Wolfsberg', '67.18', '2023-12-06', 'schließt im Sommer den Betrieb', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272457', 'Butchers Steak & More', 'Robert Cirkovic', 'Kaiser-Franz-Josef-Straße 331', '9872', 'Millstatt', '67.03', '2020-06-10', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('238460', 'BWE KG Manuel Wutscher', 'Schirmbar Koralpe', 'Flurgasse 10', '9431', 'St. Stefan', '67.17', '2023-09-26', 'vormals WTM', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('270160', 'C.E.N.T.R.I.S. Betriebs GmbH Nfg.KG', NULL, 'St. Johann 114', '9162', 'Strau', '67.18', '2023-11-07', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235798', 'Cafe 4 you OG', 'Theuermann Gerit', 'Waldweg 2', '9431', 'St. Stefan', '67.18', '2023-11-17', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('232468', 'Cafe 7', 'Inh.: Wolfgang Schuster', 'Hauptstraße 7', '9431', 'St. Stefan', '67.18', '2024-01-02', NULL, 'mailed', 'none', 'abgemeldet seit 1.6.2026', FALSE, 'closed', 'Abgemeldet (aus Excel übernommen)'),
  ('238549', 'Cafe 7', 'Inh.: Denise Koppe', 'Hauptstraße 7', '9431', 'St.Stefan', '67.24', '2026-06-01', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('234507', 'Cafe Bar 16er', 'Am Seecorso GesmbH', 'Seecorso 16', '9220', 'Velden', '67.17', '2023-07-06', 'Status: Termin Hr. Kitz', 'new', 'none', NULL, FALSE, 'active', NULL),
  ('270243', 'Cafe Bar Da Vinci', 'Gaststättenbetrieb GmbH', 'Alter Platz 5', '9020', 'Klagenfurt', '67.10', '2022-01-26', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235935', 'Cafe Bar Salito', 'Michael Brunn', 'Hauptstraße 34', '8650', 'Kindberg', '67.18', '2024-01-08', 'Cafe Bar Salito, Michael Brunn', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('231044', 'Cafe Bettina und´s Krügel', 'Sulzer-Gallant Bettina', 'Lavamünd 40', '9473', 'Lavamünd', '67.21', '2024-10-31', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('273555', 'Cafe Bistro Mahlzeit', 'Amira Kombic', 'Kirchengasse 50', '9020', 'Klagenfurt', '67.18', '2024-03-01', 'vormals 273429', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('273682', 'Cafe Bistro Tec', NULL, 'Lastenstraße 15', '9020', 'Klagenfurt', '67.23', '2025-10-02', 'vormals MTEC', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('234502', 'Cafe Börserl', 'Schneider Gastronomie GmbH', 'Am Corso 23-25', '9220', 'Velden am Wörthersee', '67.19', '2024-05-22', 'Hogast: 9068', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('233623', 'Cafe Cappuccino', 'Elke Hofer', 'Villacher Straße 57', '9800', 'Spittal/Drau', '67.22', '2025-04-17', NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('233947', 'Cafe Europapark GmbH', NULL, 'Magazingasse 12', '9020', 'Klagenfurt', '67.23', '2025-07-10', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235958', 'Cafe Evi', 'Kuchar Evelyn', 'Kirchplatz 6', '9141', 'Eberndorf', '67.21', '2024-12-13', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('270354', 'Cafe Heiligengeistplatz', 'Zado Kara Gastronomie KG', 'Heiligengeistplatz 10', '9020', 'Klagenfurt', '67.03', '2020-06-12', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236088', 'Cafe Herzig', 'Christina Fussi KG', 'Neuer Platz 4', '9020', 'Klagenfurt', '67.22', '2025-03-18', NULL, 'replied', 'none', 'OM C400', FALSE, 'active', NULL),
  ('236043', 'Cafe Kaputtschino', 'Kainz Christian', 'Klagenfurter Straße 35', '9400', 'Wolfsberg', '67.20', '2024-08-30', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('24437', 'Cafe Konditorei Sternweiss', 'Andrea Oberhauser', 'Lobisserplatz 1', '9470', 'St.Paul im Lav', '67.24', '2026-02-24', 'HGP: 93871', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('238344', 'Cafe Kramer', 'Kadis Mineja', 'Lavamünd 16', '9473', 'Lavamünd', NULL, NULL, NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272934', 'Cafe La Giocanda', 'Miriam Cibien', 'Alter Platz 20', '9020', 'Klagenfurt', '67.15', '2023-01-30', 'Eiscafe La Gioconda', 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('26098', 'Cafe Latte', 'Siculi OG', 'Herzog Bernhard Platz 8', '9100', 'Völkermarkt', '67.18', '2024-01-09', 'Siculi OG', 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('238218', 'Cafe Macchiato', 'Inh. Nico Grilz', 'Bahnhofplatz 1', '9400', 'Wolfsberg', '67.21', NULL, NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('233168', 'Cafe Palais', 'Josef Berglitsch', 'Am Weiher 7', '9400', 'Wolfsberg', '67.18', '2023-11-15', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('273175', 'Cafe Piccadilly', NULL, 'Felix-Hahn-Straße 2', '9073', 'Viktring', '67.18', '2023-11-15', 'Konkurs? | ?', 'new', 'none', NULL, FALSE, 'active', NULL),
  ('233991', 'Cafe PLAZA', 'Michaela Höberl', 'Hauptplatz 20', '9100', 'Völkermarkt', '67.17', '2023-10-11', NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('236263', 'Cafe Quo Vadis', 'Inh.: Petra Hofmeister', 'Am Industriepark 9a', '9400', 'Wolfsberg', '67.07', '2021-07-14', 'HW-Kauf: Fa. Hota', 'offer_created', 'none', 'PP1635', TRUE, 'active', NULL),
  ('234366', 'Cafe Restaurant Seerose', 'Seerose Jernej Gastro GmbH', 'Ostuferstraße 22', '9122', 'St. Kanzian', '67.24', '2026-01-30', 'update bekommen, Kartetausch noch ausständig', 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('237876', 'Cafe Satz', 'Katja Brand', 'Ort 7', '9411', 'St. Michael', '67.21', '2025-02-21', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272100', 'Cafe Schickeria', 'Wolfgang Payer', 'Siebenhügelstraße 25', '9020', 'Klagenfurt', '66.00', '2017-05-24', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235981', 'Cafe s''Häferl', 'Weinberger Sylvia', 'Sporergasse 17', '9400', 'Wolfsberg', '67.09', '2022-01-03', NULL, 'mailed', 'none', 'Angebot RCH aber noch warten', TRUE, 'active', NULL),
  ('237803', 'Cafe Sonja', 'Kuss Sonja', 'Nord 54', '9125', 'Kühnsdorf', '67.18', '2024-01-30', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('237161', 'Cafe Syno', 'Ja Na Gastro KG', 'Feschnigstrasse 72', '9020', 'Klagenfurt', '67.22', '2025-07-23', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('238104', 'Cafe Wede Drinks and Snacks', 'Inh.: Wedenig Rene Herbert', 'Hoher Platz 17', '9400', 'Wolfsberg', '67.19', '2024-06-10', 'Cafe Wede', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('271874', 'Cafe-Bar My Way', NULL, 'Wienergasse 6', '9020', 'Klagenfurt', '67.21', '2025-03-20', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('273572', 'Cafe-Bistro Scheer''s ', 'Michael Scheer', 'Wirtschaftspark 11', '9130', 'Poggersdorf', NULL, NULL, NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('23184', 'Cafe-Restaurant Schattleitner', 'Breitenhuber Gislinde', 'St. Veiter Straße 1', '9371', 'Brückl', '67.24', '2026-03-18', 'HGP: 92551', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('234979', 'Cafino', 'LBI Lavantaler Beschäftigungs.', 'Offnerplatzl 1', '9400', 'Wolfsberg', '67.16', '2023-04-12', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('2910153', 'Camping Cafe Flaschberger', 'Bernhard Josef Flaschberger', 'Obervellach 27', '9620', 'Hermagor', '67.18', '2024-01-16', NULL, 'replied', 'none', '?', FALSE, 'active', NULL),
  ('271527', 'Cat & Coffee', NULL, 'Paulitschgasse 9', '9020', 'Klagenfurt', '67.03', '2020-03-09', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272040', 'Ciao, Ciao City', 'Pizzeria GmbH', 'Bahnhofstraße 18', '9020', 'Klagenfurt', '67.08', '2021-10-07', NULL, 'mailed', 'none', 'C500/C300', FALSE, 'active', NULL),
  ('24645', 'Cimenti Manuel Thomas', 'Gasthaus Hüttenwirt', 'Pfarrdorf 1', '9473', 'Lavamünd', '67.24', '2024-11-07', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('271515', 'City Express', 'Otto Sereinig', 'Schulstrasse 1', '9073', 'Viktring', '67.22', '2025-06-25', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('233994', 'City-Cafe', 'Armin Suntinger', 'Herzog-Bernhardplatz 8', '9300', 'St.Veit', '67.21', '2024-10-31', NULL, 'replied', 'none', 'C500', FALSE, 'active', NULL),
  ('236609', 'Clubdorf Galtür GmbH', 'Veldener Traumschiff', 'Seecorso 40', '9220', 'Velden', '67.19', '2024-05-15', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('232080', 'Craigher GmbH', NULL, 'Hauptplatz 3', '9360', 'Friesach', '67.22', '2025-06-24', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('234939', 'Dany`s Stüberl', 'Daniela Saiti', 'Am Neudauerfeld 1', '9400', 'Wolfsberg', '67.22', '2025-04-30', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272966', 'Debby Gastro- u. Handels GmbH', NULL, 'Hofergartenweg 20', '9521', 'Treffen', '67.18', '2024-06-19', NULL, 'replied', 'sww', 'CX7', FALSE, 'active', NULL),
  ('236030', 'Didi''s Restaurant zur Schiene', 'Thonhauser Dietmar Franz', 'Bündlweg 4', '9150', 'Bleiburg', '67.21', '2025-03-18', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272625', 'Die Kosterei', 'Cafe-Bar-Feines', 'Osterwitzgasse 5', '9020', 'Klagenfurt', '67.17', NULL, NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('233483', 'Dipl. Ing. Dr. Zettl Andreas', 'Gestüt Wisperndorf', 'Wisperndorf 6', '9462', 'Bad St. Leonhard', '67.12', '2022-07-19', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('23763', 'Dirnberger Daniel', 'Gasthof Geiger', 'Hauptplatz 67', '9432', 'Bad St. Leonhard', '67.15', '2023-01-16', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('29000', 'DKS Betriebs GmbH', NULL, 'Am See V/6', '9122', 'St. Kanzian', '67.11', NULL, 'Hotelresort Klopeinersee Marolt', 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('29000', 'DKS Betriebs GmbH', 'Marolt', 'Am See V/6', '9122', 'St. Kanzian', '67.22', '2025-06-11', 'Strandhotel Marolt', 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('237633', 'DTM Gastro GmbH', 'Gasthof Deutscher', 'Wölzing - St. Andrä 15', '9433', 'St. Andrä', '67.24', '2025-05-27', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('237633', 'DTM Gastro GmbH', 'Gasthof Deutscher', 'Wölzing - St. Andrä 15', '9433', 'St. Andrä', '67.22', '2025-07-25', 'Gackern Kassa', 'done', 'none', 'wird vorm Gackern erledigt', FALSE, 'active', NULL),
  ('25292', 'Eberhard Alois', 'Cafe-Konditorei', 'St. Johanner Straße 3', '9400', 'Wolfsberg', '67.24', '2023-11-08', 'Hogast: 9168, SW-Wartung', 'done', 'sww', NULL, FALSE, 'active', NULL),
  ('272329', 'Espresso 21er', 'Inh. Thomas Bleimfeldner', 'Rennsteinerstraße 20', '9500', 'Villach', '67.08', '2021-09-22', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236691', 'Euphrat Kebap & Pizza Haus', 'Sari Mustafa', 'St. Andrä 63', '9433', 'St. Andrä', '67.21', '2025-01-21', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('271631', 'Eve Alps', 'Mag. Matthias Sibitz', 'Kleinkirchheim 5', '9546', 'Bad Kleinkirchheim', '67.12', '2022-06-29', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('28478', 'Familienhotel Silvia', 'Pukart GmbH', 'Westuferstraße 26', '9122', 'St. Kanzian', '67.24', '2023-05-10', 'Gastro +RCH', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('236336', 'Familienparadies Reichenhauser', NULL, 'Reauz 3', '9074', 'Keutschach', '67.10', '2022-04-27', NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('232189', 'Familienresort Petschnighof GmbH', NULL, 'Diex 6', '9103', 'Diex', '67.21', '2025-02-24', 'vormals Petschnighof Kitz Gerwald e.U.', 'mailed', 'sww', NULL, FALSE, 'active', NULL),
  ('29534', 'Fischrestaurant Sicher KG', NULL, 'Mühlenweg 2', '9121', 'Tainach', '67.22', '2025-03-27', NULL, 'replied', 'none', 'Angebot RCH', TRUE, 'active', NULL),
  ('271475', 'Forellenwirt Bacher', NULL, 'Kirchberg 14', '9374', 'Wieting', '67.00', '2019-02-19', 'Forellenwirt Bacher, HGP: 91182', 'replied', 'none', 'OM C300', FALSE, 'active', NULL),
  ('272058', 'Frattnig Gastro KG ', 'Badwandl', 'Marktplatz 1', '9363', 'Mettnitz', '67.16', '2023-04-27', 'vormals Hoga Gmbh', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272058', 'Frattnig Gastro KG ', 'Burgerhütte / Könhof', 'Marktplatz 1', '9363', 'Metnitz', '67.21', '2024-10-31', 'Frattnig Kölnhof', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('238214', 'Freizeitanlage Walderlebniswelt ', 'Klopeiner See GmbH', 'Schulstraße 8', '9122', 'St. Kanzian', '67.21', '2024-11-07', 'Cafe Bistro Eis Novello', 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('25042', 'Friesacherhof', 'Hotel - Restaurant', 'Prebl 61', '9461', 'Prebl', '67.15', '2023-01-25', NULL, 'replied', 'none', 'OM C400 wird verkauft Ende 2026', FALSE, 'active', NULL),
  ('237263', 'Frühstückspension Zirben Diamant', NULL, 'Siedlung 30', '8742', 'Obdach', '67.05', '2021-01-26', 'Daniel Sattler', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272162', 'Funky', 'Tanja Kovac', 'Theatergasse 7', '9020', 'Klagenfurt', '67.05', '2021-03-15', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('237998', 'Gasthaus Brugger', 'Daniel Gönitzer', 'Maria Rojach 107', '9422', 'Maria Rojach', '67.17', '2023-10-25', 'vormals Moro, 235833', 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('236105', 'Gasthaus Fastlwirt', 'Aexandra Slugoutz', 'Dobrowa 13', '9113', 'Ruden', '67.21', '2025-02-18', 'vormals Johann Slugoutz', 'replied', 'none', 'RZE601', FALSE, 'active', NULL),
  ('237191', 'Gasthaus Fiedlwirt', 'Birgit Rieger', 'Granitzen 12', '8742', 'Obdach', '67.24', '2026-03-26', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('235687', 'Gasthaus Karner', 'Josef Karner', 'Klippitztörlstraße 94', '6462', 'Bad St. Leonhard', '67.18', '2024-01-26', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('27298', 'Gasthaus Kirchenwirt', 'Fam. Edlmann', 'Kirchenweg 58', '9161', 'Maria Rain', '67.14', '2022-12-12', NULL, 'replied', 'none', 'RZX655', FALSE, 'active', NULL),
  ('235468', 'Gasthaus Kuchling', NULL, 'Hauptplatz 31', '9112', 'Griffen', '67.21', '2025-02-21', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('272254', 'Gasthaus Ponderosa', 'Inh. Wilhelm Müller', 'Waidmannsdorferstraße 183', '9020', 'Klagenfurt', '67.21', '2025-02-18', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('23651', 'Gasthaus Poppmeier', NULL, 'Hauptstraße 4', '9470', 'St. Paul', '67.22', '2025-05-26', 'SW-Wartung', 'replied', 'sw_hww', NULL, FALSE, 'active', NULL),
  ('235744', 'Gasthaus Presser', 'Wolfgang Presser', 'Krappfelderstraße 8', '9321', 'Passering', '67.24', '2025-12-30', NULL, 'replied', 'none', 'RZX655', FALSE, 'active', NULL),
  ('23186', 'Gasthaus Pucher', 'Familie Darmann', 'Glein 2', '9431', 'St. Stefan', '67.18', '2024-02-20', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('237579', 'Gasthaus Rösslwirt', 'Philip Walter Stefitz', 'Koschatstraße 4', '9150', 'Bleiburg', '67.18', '2023-11-14', 'Philip Walter Stefitz', 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('236583', 'Gasthaus Seher Paul', NULL, 'Wellersdorf 4', '9072', 'Ludmansdorf', '67.16', '2024-03-31', NULL, 'replied', 'none', 'PP9635A', FALSE, 'active', NULL),
  ('235929', 'Gasthaus Wulz', 'Shop 013', 'Bruggen 8', '9761', 'Greifenburg', '67.19', NULL, NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('237180', 'Gasthaus Zum Goldenen Ochsen', 'Inh.: Hanno Schilcher', 'Hauptplatz 30', '9100', 'Völkermarkt', '67.24', '2025-02-25', 'SW-Wartung', 'done', 'sww', NULL, FALSE, 'active', NULL),
  ('271889', 'Gasthaus Zur alten Stadtgrenze', NULL, 'Alte Stadtgrenze 16', '9020', 'Klagenfurt', '67.17', '2023-08-24', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235997', 'Gasthaus-Cafe Krone', 'Adele Gnamusch', 'Lavamünd 15', '9473', 'Lavamünd', '67.18', '2023-11-07', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235011', 'Gasthof - Pension "Deutscher Peter"', 'Fam. Tschauko', 'Loiblpass 4', '9163', 'Unterbergen', '67.22', '2025-06-30', 'SW-Wartung', 'replied', 'sw_hww', NULL, FALSE, 'active', NULL),
  ('271247', 'Gasthof - Pension Thomashof', 'Thomas Dobernik', 'Mühlbach 31', '9184', 'St. Jakob im Rosenta', '67.18', '2024-10-31', NULL, 'replied', 'none', 'Pulse P40', FALSE, 'active', NULL),
  ('233637', 'Gasthof - Restaurant Sonnhof', 'Fam. Rainer', 'Völkermarkterstrasse 37', '9300', 'St. Veit an der Glan', '67.23', '2025-08-16', 'Windows 7', 'mailed', 'none', 'Angebot RCH', TRUE, 'active', NULL),
  ('232838', 'Gasthof Adlerwirt', NULL, 'Lavamünd 46', '9473', 'Lavamünd', '67.22', '2025-03-31', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('24888', 'Gasthof Brenner', 'Inh.: Johanna Jäger', 'Zellbach 42', '9433', 'St. Andrä', '67.24', '2026-01-22', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('235835', 'Gasthof Fleissner', NULL, 'Zollfeld 3', '9063', 'Maria Saal', '67.21', '2025-02-18', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('232025', 'Gasthof Gössnitzer', NULL, 'Granitztal 9', '9470', 'St.Paul im Lav', '67.21', '2025-01-21', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('271839', 'Gasthof Gutmann', 'Roman u. Christine Pliemitsche', 'Mirnig 11', '9372', 'Eberstein', '66.00', '2017-06-28', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('271703', 'Gasthof Hallegger KG', NULL, 'Göriach 1', '9161', 'Maria Rain', '66.03', '2017-07-24', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('238277', 'Gasthof Hanslwirt', 'Daniela Wieser', 'Dorfstraße 20', '9431', 'St. Stefan', '67.22', NULL, 'Konkurs', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('2910156', 'Gasthof Hillepold', 'Stefan Hillepold', 'Postran 9', '9620', 'Hermagor', '67.06', '2021-05-11', 'keine Info über HW ev Windows 7', 'replied', 'none', 'Angebot über RCH mit Drucker + Fiskalisierung', TRUE, 'active', NULL),
  ('235910', 'Gasthof Jöbstl', 'Inh.: Valentin Taferner', 'Schulstraße 45', '9431', 'St. Stefan', '67.21', '2025-01-21', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236021', 'Gasthof Johannesmesner', 'Martin Thonhauser', 'Johannesberg 2', '9470', 'St. Paul', '67.21', '2024-10-31', NULL, 'replied', 'none', 'RZX745F?', FALSE, 'active', NULL),
  ('270300', 'Gasthof Karawankenblick', 'Heinrich Filipp Esterl', 'Ruhstatt 17', '9100', 'Völkermarkt', '67.24', '2026-02-24', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('236313', 'Gasthof Kirchenwirt', 'Inh.: Michaela Vielhaber', 'Kirchplatz 4', '9141', 'Eberndorf', '67.21', '2024-12-13', 'vormals Kolleritsch', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('271601', 'Gasthof Knafl - Bäckwirt', 'Peter Knafl', 'St.-Wolfgang-Straße 1', '9362', 'Grades', '67.21', '2024-12-09', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235658', 'Gasthof Kropf', 'Inh. Andreas Morolz', 'Lind 1', '9112', 'Griffen', '67.21', '2025-02-21', NULL, 'replied', 'sww', NULL, FALSE, 'active', NULL),
  ('270317', 'Gasthof Neugebauer', NULL, 'Graben 6', '9335', 'Lölling', '67.18', '2024-03-01', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('232401', 'Gasthof Ölberger', 'Familie Plöck', 'Hintergumitsch 28', '9400', 'Wolfsberg', '67.24', '2026-04-01', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('24995', 'Gasthof Pension Buchbauer', 'Inh.: Schatz Walter', 'Kliening 53', '9462', 'Bad St.Leonhar', '67.13', '2022-10-27', 'HGP: 91989', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272273', 'Gasthof Pension Innerfraganter Wirt', 'Familie Reiter', 'Innerfragant 24', '9831', 'Flattach', '67.16', '2023-05-09', 'vormals Gasthof Pension Reiter', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236260', 'Gasthof Pension Linder', NULL, 'Dorfstraße 22', '9542', 'Afritz am See', '67.22', '2025-04-17', NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('29337', 'Gasthof Pension Waldwirt', 'Barbara Santner', 'Josefwaldweg 2', '9020', 'Klagenfurt', '67.02', '2019-11-20', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('271188', 'Gasthof Podobnik', 'Fam. Piskernik', 'Vellach 157', '9135', 'Bad Eisenkappel', '67.19', '2024-05-16', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('232221', 'Gasthof Pollheimerwirt', 'Jöbstl Claudia', 'Pollheim 4', '9411', 'St. Michael', '67.24', '2026-03-25', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('22763', 'Gasthof Poltl', NULL, 'Maria Rojach 14', '9422', 'Maria Rojach', '67.22', '2025-05-30', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('22763', 'Gasthof Poltl', '"Gackernkassa"', NULL, '9422', 'St. Andrä', '67.20', '2024-08-29', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('270336', 'Gasthof Postwirt', 'Familie Schmidt', 'Hauptstrasse 64-66', '9871', 'Seeboden', '67.24', '2026-06-16', NULL, 'done', 'none', 'OM CX7', FALSE, 'active', NULL),
  ('232486', 'Gasthof Puck GmbH', NULL, 'Zollfeld 1', '9063', 'Maria Saal', '67.24', '2026-04-13', 'HGP: 91483, SW-Wartung', 'done', 'sww', 'CX7', FALSE, 'active', NULL),
  ('25180', 'Gasthof Rabensteiner', 'Inh.: Fam. Handl', 'Unterhaus 3', '9470', 'St. Paul', '67.18', '2024-03-19', NULL, 'replied', 'none', 'C 700Windows 7', TRUE, 'active', NULL),
  ('235417', 'Gasthof Sandwirt', 'Zlatko Konec', 'Hauptplatz 5', '9063', 'Maria Saal', '67.02', '2019-12-04', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('233357', 'Gasthof Schaar KEG', NULL, 'Markplatz 14', '9363', 'Metnitz', '67.18', '2024-04-16', 'Metnitzerhof', 'replied', 'none', 'OM C900', FALSE, 'active', NULL),
  ('271702', 'Gasthof Schaidabauer', NULL, 'Schaidaweg 4', '9170', 'Ferlach', '67.16', '2023-07-13', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235287', 'Gasthof Schlosswirt', 'Familie Egger', 'St. Veiter Straße 247', '9020', 'Klagenfurt', '67.24', '2026-03-24', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('26258', 'Gasthof Sieber', 'Trippolt Wolfgang', 'Lamm 51', '9433', 'St. Andrä', '67.17', '2023-08-10', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('271556', 'Gasthof Sonnwirt', 'Ingo u. Manuela Fabbro', 'Waggendorf 3', '9556', 'Liebenfels', '67.08', '2021-10-21', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235877', 'Gasthof Sternjak', 'Sternjak Harald', 'Pudlach 65', '9155', 'Neuhaus', '67.21', '2025-02-18', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('232207', 'Gasthof Thadeushof', 'Familie Lepuschitz', 'Sekull 19', '9210', 'Pörtschach', '67.24', '2026-03-20', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('238259', 'Gasthof Torwirt', 'Mitter Esther', 'Lavamünd 45', '9473', 'Lavamünd', '67.16', '2023-03-09', 'vormals Taumberger', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('235832', 'Gasthof Trappitsch OG', NULL, 'Ruden 14', '9113', 'Ruden', '67.18', '2024-03-05', NULL, 'replied', 'none', 'RZX655 Angebot RCH', TRUE, 'active', NULL),
  ('232402', 'Gasthof Weberwirt', NULL, 'Prebl 45', '9461', 'Prebl', '67.24', '2026-04-23', NULL, 'done', 'none', 'C900 +Pulse P40', FALSE, 'active', NULL),
  ('26187', 'Gasthof Zoller', 'Familie Stückler', 'Forst 57', '9412', 'St. Margarethen', '67.24', '2023-04-06', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('235743', 'Gasthof/Pension Jamnig Alexander GmbH', NULL, 'Gonowetz 15', '9150', 'Bleiburg', '67.18', '2023-12-12', 'vormals Gasthof Petzenblick', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235462', 'Gasthof-Cafe-Bar Fremdenzimmzer', 'Alfred Ogertschnig', 'Hauptstraße 44', '9061', 'Wölfnitz', '67.16', '2023-06-26', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('271633', 'Gasthof-Hotel Thomann', 'Fam. Jürgen Wohlfahrt', 'Thomannweg 6', '9220', 'Velden am Wörthersee', '67.10', '2022-03-10', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272000', 'Gasthof-Pension Ratz', 'Gudrun Ressi', 'Kirschentheuer 6', '9162', 'Strau', '67.21', '2024-11-19', NULL, 'replied', 'none', 'Pulse P40', FALSE, 'active', NULL),
  ('234245', 'Gaze GmbH & Co KG', 'Standort: Lockstan', 'Sonnleitn 4', '9620', 'Hermagor', '67.04', '2020-11-03', 'Kunde möchte Angebot für 4x neue Hardware', 'replied', 'none', 'RZX650', TRUE, 'active', NULL),
  ('234245', 'Gaze GmbH & Co KG', 'Standort: Pavillon', 'Sonnleitn 4', '9620', 'Hermagor', '67.04', '2020-11-18', 'Kunde möchte Angebot für 4x neue Hardware', 'replied', 'none', NULL, TRUE, 'active', NULL),
  ('270573', 'Gelateria del Corso', NULL, 'Westuferstrasse 17', '9122', 'St.Kanzia', '67.16', '2023-05-12', NULL, 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('27478', 'Gelter GesbR', NULL, 'Goggerwenig 18', '9300', 'St. Veit/Glan', '67.17', '2023-09-06', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272587', 'Gerhard Glanzl GmbH', NULL, 'Hauptplatz 13', '9900', 'Lienz', '67.23', '2025-11-11', 'City Cafe Glanzl', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('235989', 'Glockenhütte', 'Betriebs GmbH', 'Nockalmstraße', '9565', 'Ebene Reichenau', '67.18', '2024-03-15', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('233886', 'Graf''s Gastronomy e.U.', 'Graf''s Markt Cafe e.U (St. Andrä)', 'Bahnhofplatz 1', '9400', 'Wolfsberg', '67.06', '2021-03-08', 'Hogast: 9260', 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('272754', 'Granögger Nathalie', NULL, 'Hof 38', '9844', 'Heiligenblut', '67.18', '2023-11-28', NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('272741', 'Griechisches Restaurant Rhodos', NULL, 'Ferdinand-Wedenig-Straße 2', '9073', 'Viktring', '67.18', '2024-06-10', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('233724', 'Grosser Gastronomiebetriebe GmbH', NULL, 'Am Feldrain 4', '9400', 'Wolfsberg', '67.24', '2026-04-22', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('270370', 'Habich Hotel GmbH & OG', NULL, 'Walterskirchenweg 10', '9201', 'Krumpendorf', '67.16', '2023-05-23', 'Strandhotel Habich', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272330', 'HAKA Tankstellen Betriebs GmbH', NULL, 'Drautalstrasse 14', '9170', 'Neu-Feffernitz', '67.18', '2024-04-25', 'ABC Auto Bedarf Center', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236789', 'Harem Kebab', 'Metin Kalan', 'Am Weiher 10', '9400', 'Wolfsberg', '67.17', '2023-09-27', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('237428', 'Harem Kebap', 'Serpil Ay', 'Supantschitschstraße 2', '9400', 'Wolfsberg', '67.19', '2024-03-21', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('234480', 'Hartl & Hartl Stadl', 'Gasthof vlg. Zum Wirt', 'Neuhaus 3', '9155', 'Neuhaus', '67.25', '2026-08-27', 'Hartl & Hartl Stadl', 'done', 'none', 'Pulse P40', FALSE, 'active', NULL),
  ('23215', 'Hecher Gesellschaft m.b.H.', 'Hotel-Konditorei-Cafe-Bäckerei', 'Wiener Straße 6', '9400', 'Wolfsberg', '67.25', '2026-07-09', 'Signatureinheit noch nicht getauscht', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272171', 'Herkuleshof', 'Johann Viehhauser', 'Preisdorf 18', '9815', 'Reisseick', '67.24', '2026-05-04', 'Johann Viehhauser, HGP: 92198', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('236238', 'Hofer & Lagler GmbH & Co KG', 'Panorama Drautal Perle Restaurant', 'Am Bahndamm 14', '9800', 'Spittal/Drau', '67.23', NULL, 'Drautal-Perle', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('233368', 'Hotel am See', 'Picey Daniel', 'Obersammelsdorf 12', '9122', 'St. Kanzian', '67.21', '2024-10-14', 'Hotel am See Picey', 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('232248', 'Hotel Astoria GmbH', 'Mag. Karin Hinteregger', 'Annastraße 43', '9210', 'Pörtschach', '67.18', '2023-11-29', 'HGP: 91316, Cafe - Bar Hausboot', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('231600', 'Hotel Berghof', 'Kohlmaier GmbH', 'Innerkrems 2', '9862', 'Kremsbrücke', '67.09', '2021-12-16', NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('233545', 'Hotel Brunnwirt', 'Michael Sattlegger e.U.', 'Weissbriach 20', '9622', 'Weissbriach', '67.24', '2026-03-10', 'Hogast: 9049', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('232718', 'Hotel Fantur', NULL, 'Aich 96', '9220', 'Velden Am Wört', '67.22', '2025-05-08', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('24489', 'Hotel Florianihof', 'Trinkl GmbH', 'Seelach, Seenweg 17', '9122', 'St. Kanzian', '67.24', '2025-05-26', 'Angebot für RCH folgt Feb/Maz 2027', 'waiting', 'none', 'C500 Win7 C300 W7', TRUE, 'active', NULL),
  ('22840', 'Hotel Löffele', 'Waldner GmbH', 'Weissbriach 88', '9622', 'Weißbriach', '67.24', '2026-05-12', 'Hogast: 9450', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('273619', 'Hotel Marko', 'Habernig Anra GmbH', 'Kranzlhofenstraße 70', '9220', 'Velden', '67.10', '2022-03-10', NULL, 'replied', 'sw_hww', 'OM C700', FALSE, 'active', NULL),
  ('29459', 'Hotel Orchidee', 'Fam. Marolt', 'Am See VIII/3', '9122', 'St. Kanzian', '67.22', '2025-05-12', NULL, 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('236509', 'Hotel Petzenland GmbH', NULL, 'Unterort 27', '9143', 'Feistritz', '67.21', '2025-04-22', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236509', 'Hotel Petzenland GmbH', 'Oben Panorama & Genuss am Berg', 'Unterort 310', '9143', 'Feistritz ob Bleiburg', '67.18', NULL, 'Hotel Petzenland', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('270538', 'Hotel Restaurant Rosmann', NULL, 'Seenstraße 22', '9081', 'Reifnitz', '67.17', '2023-09-05', 'Hotel Restaurant Rosmann, Reifnitz?', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('271849', 'Hotel Rosenheim - Lubas', NULL, 'Golfweg 1', '9122', 'Seelach St.Kanzian', '67.24', '2026-05-20', 'Angebot für RCH folgt Feb/Maz 2027', 'waiting', 'none', 'Sharp RZX 655 Windows 7', TRUE, 'active', NULL),
  ('270996', 'Hotel Schloss Lerchenhof', 'Steinwender Johann e.U.', 'Untermöschach 8', '9620', 'Hermagor', '67.24', '2025-05-08', 'HGP: 93691,update ohne Kartentausch', 'replied', 'sww', 'Glancetron GT15plus', FALSE, 'active', NULL),
  ('270849', 'Hotel Schönblick', 'Fam. Schneider', 'Augsdorfer Straße 23', '9220', 'Velden', '67.17', '2023-08-01', 'Hogast: 9771', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235326', 'Hotel Seewirt', 'Fam. Motschiunig', 'Fischerweg 12', '9082', 'Maria Wörth/Dellach', '67.24', '2026-05-11', 'Angebot für RCH folgt Feb/Maz 2027', 'replied', 'none', 'Angebote RCH + dieKassa', FALSE, 'active', NULL),
  ('27323', 'Hotel Sonnengrund', 'Fam. Dermuth', 'Annastraße 9', '9210', 'Pörtschach', '67.06', '2021-06-16', 'Hogast: 9124', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('234969', 'Hotel Torwirt', 'Mostor GmbH', 'Am Weiher 4', '9400', 'Wolfsberg', '67.23', '2025-06-30', 'Mostor', 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('235117', 'Hotel-Restaurant Menüwirt', 'Richler GmbH', 'Schulstraße 3', '9122', 'St. Kanzian', '67.16', '2023-03-16', NULL, 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('270707', 'Huaba Hittn', 'Willi Pilgram', 'Sauerwald 47', '9543', 'Arriach', '67.14', '2022-12-01', NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('25245', 'Ikarus Stüberl', 'Isolde Struckl', 'Reinfelsdorf 17', '9431', 'St. Stefan', '67.21', '2024-12-12', 'sperrt ende 2026 zu', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('270723', 'Jammer Events', 'Jammer Michael', 'Messeplatz 1', '9020', 'Klagenfurt', '67.12', '2022-07-14', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235983', 'Jausenstation Eckveidl', 'Graf Alexandra', 'Burgstall 12a', '9433', 'St. Andrä', '67.24', '2023-09-21', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('271538', 'Kadöllawirt', 'Sabrina Pappler', 'Kadöll 19', '9555', 'Glanegg', '67.18', '2024-05-22', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('232696', 'Kaimbacher Christian', 'Gasthaus-Trafik-Fleischerei', 'Ettendorf 28', '9472', 'Ettendorf', '67.21', '2024-10-22', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236166', 'Kainz Das Restaurant', NULL, 'Getreidemarkt 6', '9400', 'Wolfsberg', '67.18', '2023-12-13', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('271533', 'Karlis Gasthaus', 'Karl Max Heider', 'St. Veiter Straße 130', '9020', 'Klagenfurt', '67.21', '2024-11-05', 'Karlis Gasthaus', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236716', 'Kinderhotel Ramsi GmbH', NULL, 'Kameritsch 8', '9620', 'Hermagor', '67.13', '2022-10-06', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235972', 'Klein-Henner', 'Michael Grillitsch', 'Vorderwölch 19', '9413', 'St. Gertraud', '67.21', '2024-11-12', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('21221', 'Kohler Georg', NULL, 'Unterpreitenegg 3', '9451', 'Preitenegg', '67.18', '2024-02-19', 'Angebot für RCH folgt Feb/Maz 2027', 'mailed', 'none', 'Angebot RCH aber noch warten', TRUE, 'active', NULL),
  ('271575', 'Koschutahaus', 'Schütz Michael', 'Zell Koschuta 4', '9172', 'Zell Pfarre', '67.01', '2019-07-01', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('271981', 'Kraners Alpenhof', 'Familie Mösslacher', 'Oberdorf 13', '9762', 'Weissensee', '67.06', '2021-06-15', 'SW-Wartung', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('270567', 'Kummer Ernst', 'Grinzing Heuriger', 'Steinerberg 22', '9123', 'St.Primus', '67.16', '2023-05-03', 'Angebot für RCH folgt Feb/Maz 2027', 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('272238', 'La Baita', 'Clausero KG', 'Benediktiner Platz 5', '9020', 'Klagenfurt', '67.02', '2019-11-05', NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('272545', 'La mia Casa', 'Skelzen Proksi', 'Kirschentheuer 42', '9162', 'Strau', '67.24', '2026-05-08', NULL, 'done', 'none', 'W10', FALSE, 'active', NULL),
  ('232906', 'Landgasthaus Hafner', NULL, 'Oberdorf 14', '9155', 'Neuhaus', '67.20', '2024-09-19', 'Hogast: 9315', 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('232601', 'Landgasthaus Hanslwirt', 'Gerhard Steinlechner', 'Preitenegg 12', '9451', 'Preitenegg', '67.22', '2024-02-19', 'Gerhard Steinlechner', 'replied', 'none', 'CX7 Win 10', FALSE, 'active', NULL),
  ('235867', 'Langhans Gasthof-Pension', 'Elisabeth Gutschi', 'Kamperkogel 10', '9413', 'St. Gertraud', '67.18', '2024-04-24', 'Angebot für RCH folgt Feb/Maz 2027', 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('238139', 'Lavanttaler Vereinshaus', NULL, 'Pichling 2', '9431', 'St. Stefan', '67.06', '2024-06-04', NULL, 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('271380', 'LINS Catering', 'Veranstaltungsplanung', 'Othmar-Crusiz-Straße 7', '9500', 'Villach', '67.18', '2024-05-03', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236820', 'Lisi - Cafe Restaurant', 'Fam. Tolan', 'Hart 23', '9141', 'Eberndorf', '67.05', '2021-01-21', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272348', 'LM Eisservice GmbH', 'Standort: Villach', 'Antoniensteig 19/2', '9500', 'Villach', NULL, NULL, NULL, 'replied', 'sw_hww', NULL, FALSE, 'active', NULL),
  ('272348', 'LM Eisservice GmbH', 'Standort: Spittal', 'Antoniensteig 19/2', '9500', 'Villach', NULL, NULL, NULL, 'mailed', 'sw_hww', NULL, FALSE, 'active', NULL),
  ('236585', 'Lokal', 'Yasmin Fritz', 'Hauptplatz 27', '9100', 'Völkermarkt', '67.15', '2023-01-26', 'Lokal', 'new', 'none', NULL, FALSE, 'active', NULL),
  ('272875', 'LR Eisservice Gmbh', '1x Südtiroler Platz, 1x Herrengasse', 'Südtiroler Platz 16', '8020', 'Graz', '67.22', NULL, 'stehen beide Südtirolerplatz', 'mailed', 'sw_hww', 'Kassa1 W10, Kassa2 W7', FALSE, 'active', NULL),
  ('235137', 'M P Gastro- und HandelsgmbH', 'Standort: Rudnigalm', 'Sonnenalpe Nassfeld 8', '9620', 'Hermagor', '66.00', '2017-07-19', '1x neue A-Trust Karte', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235137', 'M P Gastro- und HandelsgmbH', 'Standort: Centro', 'Sonnenalpe Nassfeld 8', '9620', 'Hermagor', '67.18', '2023-12-05', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235137', 'M P Gastro- und HandelsgmbH', 'Standort: Hotel Nassfeld', 'Sonnenalpe Nassfeld 8', '9620', 'Hermagor', '67.18', '2023-12-05', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235137', 'M P Gastro- und HandelsgmbH', 'Standort: Kristall', 'Sonnenalpe Nassfeld 8', '9620', 'Hermagor', '67.18', '2023-12-05', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('271381', 'Mag. Dr. Mario Moro', 'Cafe und Pizzeria Moro', 'Am Corso 8-15', '9220', 'Velden am Wörthersee', '67.22', '2025-05-08', 'Mag. Dr. Mario Moro', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('237044', 'Mein Garten', 'Luka Zaplotnik', 'Pischeldorfers Straße 93', '9020', 'Klagenfurt', '67.08', '2021-10-25', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235479', 'Misaela Lisjak', 'Rose Cupcake Shop & Cafè KG', 'Südpark 1', '9020', 'Klagenfurt', '67.21', '2025-03-31', 'Rose Cupcake Shop & Cafe', 'mailed', 'none', 'Nino II Anfrage upgrade auf W10', FALSE, 'active', NULL),
  ('235846', 'Mochoritsch Gastronomie GmbH', 'Griffenrast Mochoritsch', 'Gewerbestrasse 11', '9112', 'Griffen', '67.21', NULL, 'wird umgestellt auf dieKassa', 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('235846', 'Mochoritsch Gastronomie GmbH', '"Mochoritsch Eck"', 'Gewerbestrasse 11', '9112', 'Griffen', '67.24', '2025-05-30', 'Mochoritsch Gastronomie', 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('26616', 'Molly Malone - Orig. Irish Pub', 'Werner Schütz-Laufenstein', 'Theatergasse 7', '9020', 'Klagenfurt', '67.17', '2023-11-02', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('238366', 'Monte Lupo', 'Gritsch Günther', 'Johann-Offner-Straße 1', '9400', 'Wolfsberg', '67.03', '2020-03-02', 'Gritsch Günther, vormals Grilz Nico 236087', 'mailed', 'none', 'C800 W7', FALSE, 'active', NULL),
  ('238124', 'Moselebaueralm GmbH', NULL, 'Kliening 241', '9462', 'Bad. St. Leonhard', '67.19', '2024-05-14', 'Hogast 9009', 'replied', 'none', 'CX7', FALSE, 'active', NULL),
  ('235686', 'Mostschenke Linsendorf', 'Gerald Rauter', 'Linsendorf 2', '9131', 'Grafenstein', '67.08', '2021-09-21', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236192', 'Most-Weinschenke Tamerl', 'Inh. Richard Nuck', 'Kaunz 17', '9112', 'Griffen', '67.17', '2023-08-16', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('273044', 'MT Gastro GmbH', 'Restaurant Sissi, Inh. Blazevic Marijan', 'Hauptstrasse 160', '9210', 'Pörtschach', '67.24', '2026-04-10', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('271130', 'Naturbäckerei Lagler GmbH', NULL, 'St.Rupprechterstrasse 140', '9020', 'Klagenfurt', '67.22', '2025-05-13', 'Status: wird vermutlich heuer geschlossen', 'new', 'none', 'sonst nächstes Jahr neue Kassa', FALSE, 'closing', NULL),
  ('236422', 'Nawa', 'Kanjana Somosda', '8.-Mai-Straße 6', '9020', 'Klagenfurt', '67.17', '2023-09-13', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('27123', 'Niemetz Ralf und Andrea', 'Landgasthof Plöschenberg', 'Plöschenberg 4', '9071', 'Köttmansdorf', '67.18', '2024-02-20', NULL, 'offer_created', 'none', 'RZE601', FALSE, 'active', NULL),
  ('235004', 'Nont GmbH', 'Restaurant-Pizzeria Fam. Marko', 'Nötsch 47', '9611', 'Nötsch', '67.16', '2023-02-28', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('237018', 'Orpheo OG', 'Inh. Hr. Peinsitt und Hr. Gerebics', 'Bayerhofenstraße 1', '9400', 'Wolfsberg', '67.24', '2023-09-14', NULL, 'done', 'none', 'Magelan', FALSE, 'active', NULL),
  ('233365', 'Panoramahotel Balance GmbH', NULL, 'Winklernerstraße 68', '9210', 'Pörtschach', '67.18', '2024-02-19', NULL, 'mailed', 'miete', NULL, FALSE, 'active', NULL),
  ('237012', 'Papala Pub', 'Inh. Kamal Seyedi', 'Industriestraße 15', '9400', 'Wolfsberg', '67.18', '2023-11-17', 'laut Kunden wurde ein Wunschtermin vereinbart', 'replied', 'none', 'Jänner Feber 2027', FALSE, 'active', NULL),
  ('237837', 'Parkcafe', 'Pierre Fritzl', 'Lindhofstraße 2B', '9400', 'Wolfsberg', '67.16', '2023-02-16', 'Pierre Fritzl', 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('236757', 'Partak GmbH', 'Hütte am Berg', 'Hartelsberg 73', '9431', 'St. Stefan', '67.21', '2024-12-30', NULL, 'offer_created', 'none', 'OM C900', FALSE, 'active', NULL),
  ('272048+A329:L329', 'Penkerwirt GmbH', NULL, 'Penk 11', '9816', 'Penk', '67.16', '2023-05-10', 'HGP: 91171', 'replied', 'none', 'CX7', FALSE, 'active', NULL),
  ('23349', 'Pension Juri KG', 'Familie Zarfl & Lichtenegger', 'Obergösel 27a', '9413', 'St. Gertraud', '67.20', '2024-07-10', NULL, 'replied', 'none', 'RZX655', FALSE, 'active', NULL),
  ('273705', 'Peperoncino', 'Ruba Gurri', 'Waldweg 1', '9560', 'Feldkirchen', '67.23', '2025-12-10', 'vormals Pizzeria Venezia', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('271441', 'Perkonig Evelin', 'Gasthaus', 'Drasendorferstrasse 127', '9020', 'Klagenfurt', '67.03', '2020-08-14', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('238238', 'Pizzeria Bar Vinissimo', 'Corinna Allmeyer', 'Eggerstraße 9', '9620', 'Hermagor', '67.21', NULL, NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('22979', 'Pizzeria Ciao', 'Risteski Goran', 'St. Stefaner Straße 9', '9400', 'Wolfsberg', '67.18', '2024-02-15', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236496', 'Pizzeria da Piero l''originale', NULL, 'Johann-Offner-Straße 1', '9400', 'Wolfsberg', '67.03', '2020-03-05', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('210104', 'Pizzeria Don Carlo', 'Gertraud Calabro', 'Herzog-Bernhardplatz 8', '9100', 'Völkermarkt', '67.21', '2025-01-21', NULL, 'mailed', 'none', 'Pulse P40', FALSE, 'active', NULL),
  ('271616', 'Pizzeria El Piggo', NULL, 'Koschatstraße 6', '9371', 'Brückl', '67.04', '2020-11-02', NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('24649', 'Pizzeria Paolo', 'Anita Koller', 'Bahnhofplatz 2', '9400', 'Wolfsberg', '67.22', '2025-03-18', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('273431', 'Pizzeria Rialto', 'Albina Murtezani', 'Bahnhofstraße 5', '9220', 'Velden', '67.18', '2024-02-29', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('271018', 'Pizzeria Santa Maria KG', NULL, 'Kinoplatz 2', '9020', 'Klagenfurt', '67.14', '2022-12-30', 'Santa Maria', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236626', 'Pizzeria-Restaurant Bistro Italia', 'Gesualdo Falsetti', 'Zellbach 7B', '9413', 'St. Gertraud', '67.02', '2020-01-22', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('237521', 'PM-Tech e.U.', NULL, 'Schossbachstraße 21', '9400', 'Wolfsberg', '67.14', '2022-12-20', 'Cafe Lobisser', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('237901', 'PPP Fischerwirt Gastro KG', NULL, 'Villacherstraße 83', '9020', 'Klagenfurt', '67.21', '2024-12-12', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('273528', 'Prima Bottega GmbH', NULL, 'Siebenhügelstr. 3', '9020', 'Klagenfurt', '67.20', '2024-09-20', 'Prima Bottega', 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('233248', 'Prinz Hüttn', 'Gernot Prinz', 'Kanzlhöhe 25', '9521', 'Treffen', '67.21', '2024-12-30', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('23181', 'Rabl Gasthof', NULL, 'Mittertrixen 3', '9102', 'Mittertrixen', '67.25', '2026-07-30', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('236675', 'Ran Gastro KG', NULL, 'Primus-Lessiak Weg 1', '9071', 'Köttmansdorf', '67.22', '2025-07-23', 'Franz''l das Landkaffee', 'offer_created', 'none', 'PP1635', FALSE, 'active', NULL),
  ('272386', 'Rathauscafe', 'Pitschmann Regina', 'Hauptstrasse 31', '9300', 'St.Veit', '67.07', '2021-07-15', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('270994', 'Remo Seerestaurant', 'Omer Britvarevic', 'Villacher Straße 10', '9620', 'Hermagor', '67.09', '2021-12-14', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235806', 'Restaurant & Camping Juritz', NULL, 'Unterfeistritzerstraße 41', '9181', 'Feistritz im Rosent.', '67.18', '2024-04-29', NULL, 'replied', 'none', '?', FALSE, 'active', NULL),
  ('236015', 'Restaurant Erna', 'Astrid Pachoinig', 'Einersdorf 51', '9150', 'Bleiburg', '67.24', '2026-03-09', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('272365', 'Restaurant Josef Fleissner', NULL, 'Ranach 6', '9843', 'Großkirchheim', '67.21', '2024-12-30', 'vormals Roßbachklause, Fleissner', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('270389', 'Restaurant Kirchenwirt Schützer GmbH', NULL, 'Völkermarkter Straße 284', '9020', 'Klagenfurt', NULL, NULL, 'vormals Moar Wolfsberg', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236257', 'Restaurant Pizzeria Raffaele', NULL, 'Klagenfurter Straße 83', '9431', 'St. Stefan', '67.18', '2024-04-18', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('237437', 'Restaurant Rustica', 'Fam. Lakicevic', 'Globasnitz 110', '9142', 'Globasnitz', '67.17', '2023-10-24', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236817', 'Restaurant Stefan Gutschi', NULL, 'St. Gertraud 72', '9413', 'St. Gertraud', '67.22', '2025-03-18', NULL, 'replied', 'none', 'OM C400 Angebot RCH', TRUE, 'active', NULL),
  ('236453', 'Restaurant Tinos', NULL, 'Petersbergenstraße 11', '8042', 'Graz', NULL, NULL, NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272578', 'RHH-Heiligenblut Betriebs GmbH', NULL, 'Hof 12', '9844', 'Heiligenblut', '67.12', '2022-07-14', 'Hotel Rupertihaus', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('237731', 'Ristorante Pizzeria - Da Buki', 'Ahmetaj Bujar', 'Villacher Straße 76', '9800', 'Spittal', '67.18', '2024-03-25', 'Da Buki - vormals Al Mulino / Pfeffermühle', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272714', 'R-Nostro GmbH', 'Hotel Jägerhof', 'Hauptstraße 236', '9201', 'Krumpendorf', '67.24', '2026-01-22', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('270705', 'Rudolf Steinwender', 'Rudi''s Würstelbude', 'St. Niklas 24', '9580', 'Drobollach', '67.24', '2026-01-15', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('236850', 'Rundumservice-Pichler e.U.', 'Sonnencamp Gösselsdorf', 'Seestraße 21-23', '9141', 'Gösselsdorf', '67.13', '2022-10-04', NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('210123', 'Rutar GmbH & Co KG', 'Standort Klagenfurt', 'Eisenkappler Straße 10', '9141', 'Eberndorf', '67.17', '2023-08-14', 'Standort Klagenfurt', 'replied', 'none', 'C400?', FALSE, 'active', NULL),
  ('210123', 'Rutar GmbH & Co KG', 'Standort: Villach', 'Eisenkappler Straße 10', '9141', 'Eberndorf', '67.17', NULL, NULL, 'replied', 'none', 'C400?', FALSE, 'active', NULL),
  ('271051', 'Sabrina Lackner', 'Dorfstub''m', 'Hof 4', '9844', 'Heiligenblut', '67.21', '2024-12-30', 'vormals Dorfstüberl', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('238039', 'Sari Kebab Pizza', 'Sari Bayram', 'Mettingerstraße 8', '9100', 'Völkermarkt', '67.21', '2025-02-25', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('238054', 'Sari Müslüm', 'Uni Pizza & Kebap Haus', 'Universitätsstrasse 98', '9020', 'Klagenfurt', '67.18', '2024-01-03', 'Uni Pizza & Kebap Haus', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('273718', 'Savora Gmbh', 'Jakub Corej', 'Untervellach 7', '9620', 'Hermagor', NULL, NULL, 'vormals um John / Europarcs', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('232598', 'Schlanitzer Alm', 'Gogaras Martin', 'Sonnleitn 5', '9620', 'Nassfeld', '67.24', '2025-12-17', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('235034', 'Schloss Albeck Sickl e.U.', NULL, 'Schlossweg 5', '9571', 'Sirnitz', '67.18', '2024-04-16', NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('273150', 'Schneider Ralf und Sonja', NULL, 'Hauptstrasse 26', '9311', 'Kraig', '67.18', '2023-11-09', 'Weißbergerhütte', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('232449', 'Schulterkogelhütte', 'Fam. Rampitsch', 'Prebl 81', '9461', 'Prebl', '67.22', '2025-04-25', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('232214', 'Schweizerhaus am Kreuzbergl', 'Kruptschak GmbH', 'Kreuzbergl 11', '9020', 'Klagenfurt', '67.21', '2024-12-31', 'Hogast 9755', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235712', 'Seetalerhütte', 'Greilberger OG', 'Klippitzthörl 24', '9462', 'Bad St. Leonhard', '67.15', '2023-01-26', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('238181', 'Servas Gastro e.U.', 'Inh.: Alfred Rieger', 'Klagenfurter Straße 49A', '9400', 'Wolfsberg', '67.20', '2024-08-12', 'Pulse P40 /C800 W10 / Sharp655 W7', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236202', 'Simacek GmbH', NULL, 'Gabelsbergerstraße 5', '9020', 'Klagenfurt', '67.15', '2023-01-16', 'Simacek GmbH, Contento', 'replied', 'none', 'Pulse P40 + OM C300?', FALSE, 'active', NULL),
  ('237912', 'Sissy''s Cafe', 'Inh.: Mitterbacher Elisabeth', 'Hauptplatz 36', '9462', 'Bad St. Leonhard', '67.17', '2023-06-28', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('232206', 'SK Gastronomie GmbH', NULL, 'Salmstraße 3', '9020', 'Klagenfurt', '67.22', '2025-04-30', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('271898', 'SME Hotel GmbH', NULL, 'Techendorf 73', '9762', 'Techendorf', '67.19', '2024-05-07', 'Haus am See', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('273598', 'Spaghetteria Siciliana OG', NULL, 'Lastenstraße 8/1', '9020', 'Klagenfurt', NULL, NULL, NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272265', 'Sportcafe Liebenfels', 'Zucol Siegfried', 'Sportplatzstraße 9', '9556', 'Liebenfels', '67.21', '2024-10-31', 'vormals GSC Liebenfels Fußball', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('235714', 'Sporthotel Mölltal GmbH', 'Familie Huber', 'Kleindorf 10', '9831', 'Flattach', '67.05', '2021-01-12', NULL, 'replied', 'none', '? Auf bestehendem NW installiert', FALSE, 'active', NULL),
  ('238421', 'Sportspub Puzzles', 'Sebastian Tschrepetz', 'Reiserweg 1', '9400', 'Wolfsberg', '67.23', '2025-09-30', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('232533', 'Spotzl''s Hütte', 'Inh. u. Betreiber Gerald Unterweger', 'Turracherhöhe 129', '9565', 'Ebene Reichenau', '67.18', '2023-12-06', 'Spotzl''s Hütte', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272693', 'SRL Eisservice GmbH', NULL, 'Italiener Straße 13', '9500', 'Villach', '67.16', '2023-02-09', 'Gelateria italiana by Luis', 'replied', 'sw_hww', NULL, FALSE, 'active', NULL),
  ('27756', 'Stadtbistro', 'Fam. Pirker', 'Rossmarkt 3', '9400', 'Wolfsberg', '67.09', '2022-01-03', NULL, 'replied', 'none', NULL, FALSE, 'active', NULL),
  ('236020', 'Stadtcafe', 'D.B Umschaden', 'Burggasse 2', '9400', 'Wolfsberg', '67.16', '2023-02-22', 'geschlossen? | ?', 'new', 'none', NULL, FALSE, 'closing', NULL),
  ('270586', 'Stadtcafe', 'Inh.: Granit Osmani', '10.-Oktober-Straße 16', '9560', 'Feldkirchen', '67.18', '2024-01-31', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272976', 'Stammtisch AG', NULL, 'Benediktinerplatz Stand 3/4', '9020', 'Klagenfurt', '67.18', '2024-02-20', 'vormals Anna Grünwald, Gartnerwirt St. Georgen', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272422', 'Stamperl Bar', 'Inh. Klaudia Sieder', 'Am Corso 8', '9220', 'Velden', '67.08', '2021-08-13', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272548', 'Steirerhof Gspán Gesbr', NULL, 'Klagenfurter Straße 38', '9300', 'St.Veit', '67.13', NULL, 'Steirerhof Gspan', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236359', 'Sternenwirt', 'Sandra Strablegg', 'Hauptplatz 21', '8750', 'Judenburg', '67.12', '2022-08-31', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('270752', 'Stofflwirt', 'Bernd Mitterer', 'Deutschberg 6', '9551', 'Bodensdorf', '67.16', '2023-03-30', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('233810', 'Stölzl OG', 'Restaurant im Schloss', 'Schloss 1', '9400', 'Wolfsberg', '67.08', '2021-11-10', 'in Bearbeitung Termin 21.5.2026', 'replied', 'none', 'PP9635C', FALSE, 'active', NULL),
  ('273636', 'Strandcafe Heimathafen Bundschuh', 'Katrin Dörflinger Olipitz', 'Seecorso 90e', '9220', 'Velden am Wörthersee', '67.18', '2024-05-07', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('273480', 'Strandcamping Süd', 'Karachalios Konstantinos', 'Dobeinitz 30', '9074', 'Keutschach', '67.18', '2024-06-03', 'vormals Camping Buffet (Miliarakis)', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('237711', 'Sulzer''s Radltreff', 'Sulzer Gerald', 'Mühlviertel 10', '9470', 'St. Paul', '67.22', '2025-05-12', NULL, 'mailed', 'none', 'noch warten', FALSE, 'active', NULL),
  ('271840', 'Sun & See', 'Stefan Grasser', 'Am Göllgraben 1', '9875', 'Döbriach', '66.07', NULL, NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235428', 'Sunset Gastro GmbH', 'Hr. Thuller', 'Villacherstraße 83', '9020', 'Klagenfurt', '67.22', '2025-03-31', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272723', 'SZ Gastronomie KG', NULL, 'Griffenerstraße 16a', '9100', 'Völkermarkt', '67.21', '2025-02-28', 'Cafe Treff, vormals: 271842, 236961', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('238358', 'Taverna Mykonos', 'Mykonos G&V Gastro OG', 'Seenweg 3', '9122', 'St. Kanzian', '67.22', '2025-05-26', NULL, 'waiting', 'none', NULL, FALSE, 'active', NULL),
  ('238332', 'Taverna Zorbas', NULL, 'Landstraße 1a', '8753', 'Fohnsdorf', '67.22', NULL, NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('273654', 'Taverne Poseidon', NULL, 'Bundesstraße 16', '9551', 'Bodensdorf', '67.22', NULL, NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('272056', 'Taverne Santorini', 'Kokkas Zisis', 'Parkgasse 5', '9300', 'St. Veit/Glan', '67.16', '2023-02-28', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('270358', 'Tenniscenter Rath', 'Christian Rath e.U.', 'Hubertusstraße 80', '9020', 'Klagenfurt', '67.21', '2025-02-13', 'Tenniscafe, HGP: 93907', 'replied', 'none', 'Sharp Emb.Box PC J1900 RZE', FALSE, 'active', NULL),
  ('236536', 'Terbul Bierbaron KG', NULL, 'Herzog-Bernhard-Platz 6', '9100', 'Völkermarkt', '67.03', '2020-04-28', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236386', 'Terrassencamping Ronacher', NULL, 'Mösel 6', '9714', 'Stockenboi', '67.11', '2022-05-12', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('238118', 'Theissenegger Wirt', 'Dohr Ulrich', 'Vordertheissenegg 2', '9441', 'Theissenegg', '67.19', '2024-04-17', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('237639', 'Tressdorfer Alm', 'Manuel Glantschnig', 'Sonnenalpe Nassfeld 62', '9620', 'Hermagor', '67.18', '2023-12-05', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('271195', 'Tröpolacher Hof', 'Filippitsch GmbH & CoKG', 'Tröpolach 52', '9631', 'Tröpolach', '67.21', '2024-12-12', 'Kunde möchte Angebot für 4x neue Hardware', 'replied', 'none', NULL, TRUE, 'active', NULL),
  ('272774', 'Vinothek Vipresso', NULL, 'Kirchgasse 11', '9300', 'St. Veit an der Glan', '67.21', '2025-01-21', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('235520', 'WAC Betriebs GmbH', NULL, 'Herrengasse 4', '9400', 'Wolfsberg', '67.23', '2023-09-20', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('232715', 'Weinberger Andreas', 'Gasthaus', 'St. Marein 9', '9431', 'St.Stefan im L', '67.22', '2025-03-18', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('234204', 'WG Gastro & Event KG', 'Wastl Franz Josef', 'St. Micheal ob Bleiburg 34', '9143', 'St. Michael', '67.16', '2023-02-23', 'City Cafe', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('233181', 'Wirtshaus Kainz', NULL, 'Klein Rojach 5', '9431', 'St. Stefan', '67.22', '2025-05-30', 'Wirtshaus Kainz', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('238243', 'WME Gastronomie GmbH', 'Lokal Lavanty', 'St. Michaeler Straße 35', '9400', 'Wolfsbeg', '67.23', '2025-10-08', NULL, 'done', 'none', NULL, FALSE, 'active', NULL),
  ('272961', 'Wolitzenhütte', 'Schuss Alexander', 'St. Oswald 5', '9546', 'Bad Kleinkirchheim', '67.12', NULL, 'Wolitzenhütte', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('236462', 'WTM Gastro GmbH', NULL, 'St. Michaeler Straße 2', '9400', 'Wolfsberg', '67.24', '2025-10-03', 'Embassy', 'done', 'none', NULL, FALSE, 'active', NULL),
  ('272426', 'Zechner KG', NULL, 'Untermarkter Straße 2', '9330', 'Althofen', NULL, NULL, NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('27981', 'Zum Heiligen Josef', 'Sellak Ralf', 'Osterwitzgasse 7', '9020', 'Klagenfurt', '67.21', '2025-02-27', 'SW-Wartung', 'mailed', 'sw_hww', NULL, FALSE, 'active', NULL),
  ('29640', 'Zum Krainer', NULL, 'Longoweg 24', '9201', 'Krumpendorf', '67.16', '2023-06-12', 'Zum Krainer', 'mailed', 'none', NULL, FALSE, 'active', NULL),
  ('273210', 'Zum Schmankerl', NULL, 'Bahnhofstrasse 13', '9161', 'Maria Rain', '67.15', '2022-12-28', NULL, 'mailed', 'none', NULL, FALSE, 'active', NULL)
;

UPDATE viertl_licenses SET closed_at = NOW() WHERE customer_status = 'closed';
