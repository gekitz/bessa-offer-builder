-- Workforce / Vacation Planner schema for KITZ Computer + Office GmbH.
-- See docs/workforce/Urlaubsplaner_Konzept_v4.docx for the full requirements
-- and docs/workforce/CONTEXT.md section 2 for the team this migration seeds.

-- ============================================================
--  Lookup tables
-- ============================================================

CREATE TABLE standorte (
  id     SMALLINT PRIMARY KEY,
  name   TEXT NOT NULL UNIQUE
);

CREATE TABLE abteilungen (
  id     SMALLINT PRIMARY KEY,
  name   TEXT NOT NULL UNIQUE
);

CREATE TABLE leave_types (
  id                 SMALLINT PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  label              TEXT NOT NULL,
  -- Whether absences of this type are subtracted from the employee's
  -- annual entitlement balance (Urlaub yes; Krankenstand no, etc.).
  deducts_from_balance BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================
--  Employees
-- ============================================================

CREATE TABLE employees (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Short stable slug used in URLs and joins (e.g. 'hrussnig').
  code                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  email               TEXT,
  standort_id         SMALLINT NOT NULL REFERENCES standorte(id),
  -- Birth date, hire date, and weekly_hours feed accrual + part-time math.
  birth_date          DATE,
  hire_date           DATE,
  weekly_hours        NUMERIC(4,1) NOT NULL DEFAULT 38.5,
  employment_type     TEXT NOT NULL DEFAULT 'fulltime'
                      CHECK (employment_type IN ('fulltime','parttime','apprentice','marginal')),
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employees_standort ON employees(standort_id);
CREATE INDEX idx_employees_code ON employees(code);

-- ============================================================
--  Employee roles (Hauptrolle + Aushilfe)
-- ============================================================
-- Each employee has at least one 'primary' role and may have one or
-- more 'secondary' (Aushilfe) roles. Secondary roles can be conditional
-- on a supervisor (e.g. Heimo's MFP-Aushilfe is only valid while Mario
-- Graf is available — supervisor_employee_id points at Mario).

CREATE TABLE employee_roles (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  abteilung_id             SMALLINT NOT NULL REFERENCES abteilungen(id),
  standort_id              SMALLINT NOT NULL REFERENCES standorte(id),
  kind                     TEXT NOT NULL CHECK (kind IN ('primary','secondary')),
  valid_from               DATE,
  valid_to                 DATE,
  -- Set when the role is conditionally valid: only applies while the
  -- supervisor employee is themselves available (not on leave / still
  -- employed).
  supervisor_employee_id   UUID REFERENCES employees(id),
  -- Free-form qualifier — e.g. 'Spezialist' for Christian's primary
  -- Kassen role, or 'Lehrling' for Marc.
  qualifier                TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employee_roles_employee ON employee_roles(employee_id);
CREATE INDEX idx_employee_roles_abteilung ON employee_roles(abteilung_id);

-- ============================================================
--  Substitutes (Vertreter)
-- ============================================================
-- Ordered list of preferred substitutes per employee. Lower priority
-- comes first. Cross-Standort substitutes trigger a *warning* (not
-- a block) — used to flag "telephone-only" Vertretung. The
-- enforcement of that lives in the rules engine, not in the schema.

CREATE TABLE substitutes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  substitute_employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  priority                 SMALLINT NOT NULL DEFAULT 1,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, substitute_employee_id),
  CHECK (employee_id <> substitute_employee_id)
);

CREATE INDEX idx_substitutes_employee ON substitutes(employee_id);

-- ============================================================
--  Coverage rules
-- ============================================================
-- Generic capacity rule: at most N employees can be on leave
-- simultaneously within the given scope.
--
-- Scope is composed of any non-null filter:
--   * scope_standort_id    -- restrict to a Standort
--   * scope_abteilung_id   -- restrict to an Abteilung
--   * applies_to_employees -- restrict to specific employees
--                             (e.g. the global Stefan ↔ Mario block)
--
-- kind='hard' rejects the leave request; kind='soft' produces a warning.

CREATE TABLE coverage_rules (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL,
  scope_standort_id        SMALLINT REFERENCES standorte(id),
  scope_abteilung_id       SMALLINT REFERENCES abteilungen(id),
  applies_to_employees     UUID[],
  max_concurrent_on_leave  SMALLINT NOT NULL,
  kind                     TEXT NOT NULL CHECK (kind IN ('hard','soft')),
  active                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  Blackout periods
-- ============================================================
-- Off-limit ranges, e.g. Wörthersee end-April → June for Klagenfurt
-- gastro/handel, or Skigebiete mid-November → mid-December.
-- severity decides whether the engine blocks or warns.

CREATE TABLE blackout_periods (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL,
  start_date                  DATE NOT NULL,
  end_date                    DATE NOT NULL,
  applies_to_standort_ids     SMALLINT[],
  applies_to_abteilung_ids    SMALLINT[],
  severity                    TEXT NOT NULL DEFAULT 'block'
                              CHECK (severity IN ('block','warn')),
  active                      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

-- ============================================================
--  Leave balances per year
-- ============================================================

CREATE TABLE leave_balances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year            SMALLINT NOT NULL,
  leave_type_id   SMALLINT NOT NULL REFERENCES leave_types(id),
  entitled        NUMERIC(5,1) NOT NULL DEFAULT 0,
  carried_over    NUMERIC(5,1) NOT NULL DEFAULT 0,
  used            NUMERIC(5,1) NOT NULL DEFAULT 0,
  planned         NUMERIC(5,1) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, year, leave_type_id)
);

CREATE INDEX idx_leave_balances_employee_year ON leave_balances(employee_id, year);

-- ============================================================
--  Leave requests
-- ============================================================
-- The core entity: a request from an employee for time off. Approvers
-- are Georg + Herbert (either can approve). Status transitions:
--   pending -> approved | rejected | cancelled
-- Half-day flags allow the start/end day to be a half day.

CREATE TABLE leave_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id       SMALLINT NOT NULL REFERENCES leave_types(id),
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  half_day_start      BOOLEAN NOT NULL DEFAULT FALSE,
  half_day_end        BOOLEAN NOT NULL DEFAULT FALSE,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','cancelled')),
  reason              TEXT,
  substitute_id       UUID REFERENCES employees(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at          TIMESTAMPTZ,
  decided_by          UUID REFERENCES employees(id),
  decision_note       TEXT,
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_leave_requests_dates ON leave_requests(start_date, end_date);

-- ============================================================
--  Audit log
-- ============================================================
-- AK / Betriebsrat traceability: every state change on a leave request
-- (and other workforce records) goes here.

CREATE TABLE workforce_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      UUID REFERENCES employees(id),
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     UUID,
  details       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workforce_audit_entity ON workforce_audit_log(entity_type, entity_id);
CREATE INDEX idx_workforce_audit_created ON workforce_audit_log(created_at DESC);

-- ============================================================
--  Row Level Security
-- ============================================================
-- The app authenticates the team through Supabase auth + the
-- user_profiles table. Vacation policies will eventually filter so
-- employees can only see their own balance and the team calendar
-- (without sensitive fields). For now, mirror the offers convention:
-- permissive policies so the engine + admin tooling can read freely.
-- Tighten later when RLS-aware UI lands.

ALTER TABLE standorte              ENABLE ROW LEVEL SECURITY;
ALTER TABLE abteilungen            ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types            ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees              ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE substitutes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE coverage_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE blackout_periods       ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances         ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_audit_log    ENABLE ROW LEVEL SECURITY;

CREATE POLICY workforce_all ON standorte           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY workforce_all ON abteilungen         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY workforce_all ON leave_types         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY workforce_all ON employees           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY workforce_all ON employee_roles      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY workforce_all ON substitutes         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY workforce_all ON coverage_rules      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY workforce_all ON blackout_periods    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY workforce_all ON leave_balances      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY workforce_all ON leave_requests      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY workforce_all ON workforce_audit_log FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
--  Seed data — lookup tables
-- ============================================================

INSERT INTO standorte (id, name) VALUES
  (1, 'Klagenfurt'),
  (2, 'Wolfsberg');

INSERT INTO abteilungen (id, name) VALUES
  (1, 'Kassen'),
  (2, 'IT'),
  (3, 'Verkauf'),
  (4, 'Büro'),
  (5, 'MFP'),
  (6, 'Geschäftsführung');

INSERT INTO leave_types (id, code, label, deducts_from_balance) VALUES
  (1, 'urlaub',       'Urlaub',                     TRUE),
  (2, 'zeitausgleich','Zeitausgleich',              FALSE),
  (3, 'krankenstand', 'Krankenstand',               FALSE),
  (4, 'schule',       'Schule (Berufsschule)',      FALSE),
  (5, 'pflege',       'Pflegeurlaub',               FALSE),
  (6, 'schulung',     'Schulung / Seminar / Messe', FALSE),
  (7, 'sonderurlaub', 'Sonderurlaub',               FALSE);

-- ============================================================
--  Seed data — employees
-- ============================================================
-- 19 employees per docs/workforce/CONTEXT.md section 2.
-- weekly_hours and birth_date/hire_date are placeholders to be
-- filled in by HR once the module is live; the schema is correct
-- but those values must not be trusted yet.

INSERT INTO employees (code, name, standort_id, employment_type, weekly_hours) VALUES
  ('hrussnig',     'Heimo Russnig',          1, 'fulltime',   38.5),
  ('ahuber',       'Anton Huber',            1, 'fulltime',   38.5),
  ('aflagl',       'Alexander Flagl',        1, 'fulltime',   38.5),
  ('anowak',       'Andreas Nowak',          1, 'fulltime',   38.5),
  ('gtriebelnig',  'Gudrun Triebelnig',      1, 'fulltime',   38.5),
  ('gkitz',        'Georg Kitz',             1, 'fulltime',   38.5),
  ('mbuchbauer',   'Marko Buchbauer',        2, 'fulltime',   38.5),
  ('coberlerchner','Christian Oberlerchner', 2, 'fulltime',   38.5),
  ('skumpusch',    'Sandro Kumpusch',        2, 'fulltime',   38.5),
  ('sbauer',       'Stefan Bauer',           2, 'fulltime',   38.5),
  ('mgraf',        'Mario Graf',             2, 'fulltime',   38.5),
  ('mmaier',       'Marc Maier',             2, 'apprentice', 38.5),
  ('hbauer',       'Helmut Bauer',           2, 'fulltime',   38.5),
  ('dscharf',      'Daniel Scharf',          2, 'fulltime',   38.5),
  ('wkriegl',      'Waltraud Kriegl',        2, 'fulltime',   38.5),
  ('sriedl',       'Sabine Riedl',           2, 'fulltime',   38.5),
  ('dthorer',      'Daniela Thorer',         2, 'fulltime',   38.5),
  ('bzmug',        'Birgit Zmug',            2, 'fulltime',   38.5),
  ('hkitz',        'Herbert Kitz',           2, 'fulltime',   38.5);

-- ============================================================
--  Seed data — primary roles (Hauptrolle)
-- ============================================================

INSERT INTO employee_roles (employee_id, abteilung_id, standort_id, kind, qualifier)
SELECT e.id, a.id, e.standort_id, 'primary', q.qualifier
FROM (VALUES
  ('hrussnig',     'Kassen',           NULL),
  ('ahuber',       'Kassen',           NULL),
  ('aflagl',       'IT',               NULL),
  ('anowak',       'Verkauf',          NULL),
  ('gtriebelnig',  'Büro',             NULL),
  ('gkitz',        'Geschäftsführung', NULL),
  ('mbuchbauer',   'Kassen',           NULL),
  ('coberlerchner','Kassen',           'Spezialist'),
  ('skumpusch',    'IT',               NULL),
  ('sbauer',       'MFP',              NULL),
  ('mgraf',        'MFP',              NULL),
  ('mmaier',       'MFP',              'Lehrling'),
  ('hbauer',       'Verkauf',          NULL),
  ('dscharf',      'Verkauf',          NULL),
  ('wkriegl',      'Büro',             NULL),
  ('sriedl',       'Büro',             NULL),
  ('dthorer',      'Büro',             NULL),
  ('bzmug',        'Büro',             NULL),
  ('hkitz',        'Geschäftsführung', NULL)
) AS q(code, abteilung_name, qualifier)
JOIN employees   e ON e.code = q.code
JOIN abteilungen a ON a.name = q.abteilung_name;

-- ============================================================
--  Seed data — secondary roles (Aushilfe / Zusatzrolle)
-- ============================================================
-- Heimo Russnig is a Klagenfurt MFP Aushilfe, but only valid while
-- Mario Graf is available — recorded as supervisor_employee_id.
-- Christian Oberlerchner has an IT-Aushilfe role at Wolfsberg
-- (no supervisor — he is the senior backup).

INSERT INTO employee_roles
  (employee_id, abteilung_id, standort_id, kind, supervisor_employee_id, qualifier)
SELECT e.id, a.id, s.id, 'secondary', sup.id, q.qualifier
FROM (VALUES
  ('hrussnig',     'MFP', 'Klagenfurt', 'mgraf', 'Aushilfe'),
  ('coberlerchner','IT',  'Wolfsberg',  NULL,    'Aushilfe')
) AS q(code, abteilung_name, standort_name, supervisor_code, qualifier)
JOIN employees   e   ON e.code = q.code
JOIN abteilungen a   ON a.name = q.abteilung_name
JOIN standorte   s   ON s.name = q.standort_name
LEFT JOIN employees sup ON sup.code = q.supervisor_code;

-- ============================================================
--  Seed data — substitutes
-- ============================================================
-- Lower priority comes first. Cross-Standort entries are kept
-- (the rules engine flags them as warnings, not blocks).

INSERT INTO substitutes (employee_id, substitute_employee_id, priority)
SELECT e.id, sub.id, q.priority
FROM (VALUES
  -- Klagenfurt
  ('hrussnig',     'coberlerchner', 1),
  ('hrussnig',     'mbuchbauer',    2),
  ('ahuber',       'coberlerchner', 1),
  ('ahuber',       'mbuchbauer',    2),
  ('ahuber',       'hrussnig',      3),
  ('aflagl',       'skumpusch',     1),
  ('aflagl',       'coberlerchner', 2),
  ('gtriebelnig',  'anowak',        1),
  -- Wolfsberg
  ('mbuchbauer',   'hrussnig',      1),
  ('mbuchbauer',   'coberlerchner', 2),
  ('coberlerchner','hrussnig',      1),
  ('coberlerchner','mbuchbauer',    2),
  ('skumpusch',    'aflagl',        1),
  ('skumpusch',    'coberlerchner', 2),
  ('sbauer',       'mgraf',         1),
  ('mgraf',        'sbauer',        1),
  ('hbauer',       'dscharf',       1),
  ('dscharf',      'hbauer',        1),
  ('wkriegl',      'sriedl',        1),
  ('sriedl',       'wkriegl',       1),
  ('dthorer',      'bzmug',         1),
  ('bzmug',        'dthorer',       1)
) AS q(code, sub_code, priority)
JOIN employees e   ON e.code   = q.code
JOIN employees sub ON sub.code = q.sub_code;

-- ============================================================
--  Seed data — coverage rules
-- ============================================================
-- The Stefan ↔ Mario hard block: at most one of them on leave
-- simultaneously. Implemented as a coverage rule scoped to the
-- two specific employees (applies_to_employees) instead of the
-- whole MFP/Wolfsberg department, so other team additions do not
-- accidentally inherit the constraint.

INSERT INTO coverage_rules (name, applies_to_employees, max_concurrent_on_leave, kind)
SELECT
  'Stefan ↔ Mario MFP Wolfsberg (hard block)',
  ARRAY[s.id, m.id]::UUID[],
  1,
  'hard'
FROM employees s, employees m
WHERE s.code = 'sbauer' AND m.code = 'mgraf';

-- ============================================================
--  updated_at trigger for employees / leave_balances
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at_now() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER trg_leave_balances_updated_at
  BEFORE UPDATE ON leave_balances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();
