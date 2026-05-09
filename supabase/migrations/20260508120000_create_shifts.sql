-- Weekend + holiday shifts schema for KITZ.
--
-- Shift slots: Friday afternoon (13–18), Saturday (10–18), Sunday (10–18),
-- and Austrian bank holidays (10–18). The rotation is company-wide
-- (Klagenfurt + Wolfsberg combined) and seeded from the v1 paper
-- schedule on the office door.
--
-- Generation flow (see scaffold_shift_year + fill_remaining_shifts
-- below): admin clicks "Slots erstellen" to create empty rows for the
-- year, manually assigns the first N shifts (which teaches the
-- generator the order + Christmas/Easter splits), then clicks
-- "Rest auffüllen" to round-robin the remainder, skipping anyone on
-- approved/pending leave.
--
-- Swap flow: a shift_swaps row pairs two shift_ids (one from each
-- party). Single accept atomically reassigns both rows. Two unique
-- partial indexes prevent the same shift from being locked by more
-- than one pending swap.

-- ============================================================
--  Slot kinds
-- ============================================================

CREATE TABLE shift_slot_kinds (
  id          SMALLINT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL
);

INSERT INTO shift_slot_kinds (id, code, label, start_time, end_time) VALUES
  (1, 'fri_pm',  'Freitag Nachmittag', '13:00', '18:00'),
  (2, 'sat',     'Samstag',            '10:00', '18:00'),
  (3, 'sun',     'Sonntag',            '10:00', '18:00'),
  (4, 'holiday', 'Feiertag',           '10:00', '18:00');

-- ============================================================
--  Austrian bank holidays
-- ============================================================
-- Includes the de-facto half-day duty days (Heiliger Abend,
-- Silvester) since the shift roster treats them as full-day slots.
-- Years 2026 + 2027 seeded; admin extends via the admin panel
-- (or a future helper) for later years.

CREATE TABLE bank_holidays_at (
  holiday_date DATE PRIMARY KEY,
  name         TEXT NOT NULL
);

INSERT INTO bank_holidays_at (holiday_date, name) VALUES
  -- 2026
  ('2026-01-01', 'Neujahr'),
  ('2026-01-06', 'Heilige Drei Könige'),
  ('2026-04-06', 'Ostermontag'),
  ('2026-05-01', 'Staatsfeiertag'),
  ('2026-05-14', 'Christi Himmelfahrt'),
  ('2026-05-25', 'Pfingstmontag'),
  ('2026-06-04', 'Fronleichnam'),
  ('2026-08-15', 'Mariä Himmelfahrt'),
  ('2026-10-26', 'Nationalfeiertag'),
  ('2026-11-01', 'Allerheiligen'),
  ('2026-12-08', 'Mariä Empfängnis'),
  ('2026-12-24', 'Heiliger Abend'),
  ('2026-12-25', 'Christtag'),
  ('2026-12-26', 'Stefanitag'),
  ('2026-12-31', 'Silvester'),
  -- 2027
  ('2027-01-01', 'Neujahr'),
  ('2027-01-06', 'Heilige Drei Könige'),
  ('2027-03-29', 'Ostermontag'),
  ('2027-05-01', 'Staatsfeiertag'),
  ('2027-05-06', 'Christi Himmelfahrt'),
  ('2027-05-17', 'Pfingstmontag'),
  ('2027-05-27', 'Fronleichnam'),
  ('2027-08-15', 'Mariä Himmelfahrt'),
  ('2027-10-26', 'Nationalfeiertag'),
  ('2027-11-01', 'Allerheiligen'),
  ('2027-12-08', 'Mariä Empfängnis'),
  ('2027-12-24', 'Heiliger Abend'),
  ('2027-12-25', 'Christtag'),
  ('2027-12-26', 'Stefanitag'),
  ('2027-12-31', 'Silvester');

-- ============================================================
--  Roster (active rotation participants)
-- ============================================================
-- Ordered list of employees who participate in weekend duty.
-- Used by fill_remaining_shifts to pick the next assignee when
-- starting a new block. position is editable (deferrable so admin
-- can swap two positions atomically without intermediate offsets).

CREATE TABLE shift_roster (
  employee_id  UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  position     SMALLINT NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shift_roster_position_unique UNIQUE (position) DEFERRABLE INITIALLY IMMEDIATE
);

-- Seed from the v1 paper schedule order. 'Hr. Klein' and 'Fr. Mera'
-- on the paper schedule do not yet exist as employees rows — admins
-- add them via the roster editor once the corresponding records exist.
INSERT INTO shift_roster (employee_id, position)
SELECT e.id, q.position FROM (VALUES
  ('hrussnig',      1),
  ('coberlerchner', 2),
  ('mbuchbauer',    3),
  ('skumpusch',     4),
  ('gkitz',         5)
) AS q(code, position)
JOIN employees e ON e.code = q.code;

-- ============================================================
--  Shifts
-- ============================================================
-- One row per assigned (or unassigned) shift slot. The unique
-- constraint on (date, slot_kind) enforces "one person per slot
-- company-wide" — rotation does not respect Standort.

CREATE TABLE shifts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_date    DATE NOT NULL,
  slot_kind_id  SMALLINT NOT NULL REFERENCES shift_slot_kinds(id),
  employee_id   UUID REFERENCES employees(id),
  status        TEXT NOT NULL DEFAULT 'unassigned'
                CHECK (status IN ('unassigned','assigned','swap_pending','completed','cancelled')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shift_date, slot_kind_id),
  CHECK (
    (status = 'unassigned' AND employee_id IS NULL)
    OR (status <> 'unassigned' AND employee_id IS NOT NULL)
  )
);

CREATE INDEX idx_shifts_date          ON shifts(shift_date);
CREATE INDEX idx_shifts_employee_date ON shifts(employee_id, shift_date) WHERE employee_id IS NOT NULL;
CREATE INDEX idx_shifts_pending_swap  ON shifts(id) WHERE status = 'swap_pending';

CREATE TRIGGER trg_shifts_updated_at
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- ============================================================
--  Shift swaps
-- ============================================================
-- A swap is a *pair* of shifts trading owners. The requester gives
-- up requester_shift_id and takes target_shift_id in return. Single
-- accept atomically reassigns both rows; decline/cancel/expire
-- releases the locks on both rows.

CREATE TABLE shift_swaps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_shift_id  UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  target_shift_id     UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  requester_id        UUID NOT NULL REFERENCES employees(id),
  target_id           UUID NOT NULL REFERENCES employees(id),
  message             TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at          TIMESTAMPTZ,
  CHECK (requester_shift_id <> target_shift_id),
  CHECK (requester_id <> target_id)
);

-- Each shift can be locked by at most one pending swap. The two
-- partial unique indexes are the lock — paired with a status='assigned'
-- check inside create_shift_swap, they prevent races.
CREATE UNIQUE INDEX idx_swaps_pending_requester
  ON shift_swaps(requester_shift_id) WHERE status = 'pending';
CREATE UNIQUE INDEX idx_swaps_pending_target
  ON shift_swaps(target_shift_id)    WHERE status = 'pending';

CREATE INDEX idx_swaps_requester ON shift_swaps(requester_id);
CREATE INDEX idx_swaps_target    ON shift_swaps(target_id);

-- ============================================================
--  Row Level Security
-- ============================================================
-- Mirror the existing workforce convention: permissive policies for
-- now, tightened later when RLS-aware UI lands.

ALTER TABLE shift_slot_kinds  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_holidays_at  ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_roster      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_swaps       ENABLE ROW LEVEL SECURITY;

CREATE POLICY workforce_all ON shift_slot_kinds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY workforce_all ON bank_holidays_at FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY workforce_all ON shift_roster     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY workforce_all ON shifts           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY workforce_all ON shift_swaps      FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
--  scaffold_shift_year
-- ============================================================
-- Walks every Fri/Sat/Sun in the year + every bank_holidays_at row,
-- inserts an unassigned shifts row per (date, slot_kind). Holiday
-- slot wins over fri_pm/sat/sun when both apply. Idempotent — uses
-- ON CONFLICT DO NOTHING to skip slots that already exist.

CREATE OR REPLACE FUNCTION scaffold_shift_year(p_year INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_inserted   INTEGER := 0;
  v_inserted_now INTEGER;
  v_date       DATE;
  v_dow        INTEGER;
  v_is_holiday BOOLEAN;
  v_slot_id    SMALLINT;
BEGIN
  v_date := make_date(p_year, 1, 1);
  WHILE EXTRACT(YEAR FROM v_date)::INTEGER = p_year LOOP
    v_dow        := EXTRACT(ISODOW FROM v_date)::INTEGER;
    v_is_holiday := EXISTS (SELECT 1 FROM bank_holidays_at WHERE holiday_date = v_date);

    IF v_is_holiday THEN
      v_slot_id := 4;  -- holiday
    ELSIF v_dow = 5 THEN
      v_slot_id := 1;  -- fri_pm
    ELSIF v_dow = 6 THEN
      v_slot_id := 2;  -- sat
    ELSIF v_dow = 7 THEN
      v_slot_id := 3;  -- sun
    ELSE
      v_slot_id := NULL;
    END IF;

    IF v_slot_id IS NOT NULL THEN
      INSERT INTO shifts (shift_date, slot_kind_id, employee_id, status)
      VALUES (v_date, v_slot_id, NULL, 'unassigned')
      ON CONFLICT (shift_date, slot_kind_id) DO NOTHING;
      GET DIAGNOSTICS v_inserted_now = ROW_COUNT;
      v_inserted := v_inserted + v_inserted_now;
    END IF;

    v_date := v_date + INTERVAL '1 day';
  END LOOP;

  INSERT INTO workforce_audit_log (action, entity_type, entity_id, details)
  VALUES ('shift.scaffold', 'shift_year', NULL,
          jsonb_build_object('year', p_year, 'inserted', v_inserted));

  RETURN v_inserted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
--  fill_remaining_shifts
-- ============================================================
-- Assigns every still-unassigned shift in the year. Algorithm:
--   1. Walk shifts in (date, slot_kind) order.
--   2. For each unassigned row:
--      a. If the previous row was within 1 day and assigned, AND
--         that person is not on leave for this date, continue with
--         that person (block continuation).
--      b. Otherwise, pick the next active roster member, sorted
--         by (last_used ascending, position ascending), skipping
--         anyone with overlapping pending/approved leave.
--   3. If no one is available for a date, leave the row unassigned
--      and write a workforce_audit_log entry — the admin sees this
--      in the gap report and resolves manually.

CREATE OR REPLACE FUNCTION fill_remaining_shifts(p_year INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_assigned      INTEGER := 0;
  v_skipped       INTEGER := 0;
  v_row           RECORD;
  v_prev_date     DATE := NULL;
  v_prev_employee UUID := NULL;
  v_assignee      UUID;
BEGIN
  CREATE TEMP TABLE last_used_t (
    employee_id UUID PRIMARY KEY,
    last_date   DATE
  ) ON COMMIT DROP;

  -- Pre-populate last_used from existing assignments in this year.
  INSERT INTO last_used_t (employee_id, last_date)
  SELECT employee_id, MAX(shift_date)
  FROM shifts
  WHERE EXTRACT(YEAR FROM shift_date)::INTEGER = p_year
    AND employee_id IS NOT NULL
  GROUP BY employee_id;

  FOR v_row IN
    SELECT id, shift_date, slot_kind_id, employee_id, status
    FROM shifts
    WHERE EXTRACT(YEAR FROM shift_date)::INTEGER = p_year
    ORDER BY shift_date, slot_kind_id
  LOOP
    IF v_row.employee_id IS NOT NULL THEN
      v_prev_date     := v_row.shift_date;
      v_prev_employee := v_row.employee_id;
      CONTINUE;
    END IF;

    v_assignee := NULL;

    -- (2a) Block continuation: same person if prev was within 1 day
    -- and they're free.
    IF v_prev_employee IS NOT NULL
       AND v_prev_date IS NOT NULL
       AND v_row.shift_date - v_prev_date <= 1
       AND NOT EXISTS (
         SELECT 1 FROM leave_requests lr
         WHERE lr.employee_id = v_prev_employee
           AND lr.status IN ('pending','approved')
           AND v_row.shift_date BETWEEN lr.start_date AND lr.end_date
       )
    THEN
      v_assignee := v_prev_employee;
    END IF;

    -- (2b) New block: pick next rotation member (oldest last_used,
    -- tie-break by position).
    IF v_assignee IS NULL THEN
      SELECT r.employee_id
        INTO v_assignee
      FROM shift_roster r
      LEFT JOIN last_used_t lu ON lu.employee_id = r.employee_id
      WHERE r.active
        AND NOT EXISTS (
          SELECT 1 FROM leave_requests lr
          WHERE lr.employee_id = r.employee_id
            AND lr.status IN ('pending','approved')
            AND v_row.shift_date BETWEEN lr.start_date AND lr.end_date
        )
      ORDER BY COALESCE(lu.last_date, '1900-01-01'::DATE), r.position
      LIMIT 1;
    END IF;

    IF v_assignee IS NULL THEN
      INSERT INTO workforce_audit_log (action, entity_type, entity_id, details)
      VALUES ('shift.fill.skipped', 'shift', v_row.id,
              jsonb_build_object(
                'reason', 'no available roster member',
                'date',   v_row.shift_date,
                'slot',   v_row.slot_kind_id
              ));
      v_skipped       := v_skipped + 1;
      v_prev_date     := v_row.shift_date;
      v_prev_employee := NULL;
      CONTINUE;
    END IF;

    UPDATE shifts
       SET employee_id = v_assignee, status = 'assigned', updated_at = NOW()
     WHERE id = v_row.id;

    INSERT INTO last_used_t (employee_id, last_date) VALUES (v_assignee, v_row.shift_date)
    ON CONFLICT (employee_id) DO UPDATE SET last_date = EXCLUDED.last_date;

    v_assigned      := v_assigned + 1;
    v_prev_date     := v_row.shift_date;
    v_prev_employee := v_assignee;
  END LOOP;

  INSERT INTO workforce_audit_log (action, entity_type, entity_id, details)
  VALUES ('shift.fill', 'shift_year', NULL,
          jsonb_build_object('year', p_year, 'assigned', v_assigned, 'skipped', v_skipped));

  RETURN v_assigned;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
--  Shift swap RPCs
-- ============================================================

-- Create a swap. Locks both shifts (status='swap_pending'). Caller
-- is responsible for verifying the requester is actually the owner
-- of requester_shift_id (UI guard); the function enforces "shift
-- must be currently assigned" and the partial-unique indexes
-- enforce "no other pending swap touches this shift".
CREATE OR REPLACE FUNCTION create_shift_swap(
  p_requester_shift UUID,
  p_target_shift    UUID,
  p_message         TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_req       RECORD;
  v_tgt       RECORD;
  v_swap_id   UUID;
BEGIN
  SELECT id, employee_id, status, shift_date INTO v_req
  FROM shifts WHERE id = p_requester_shift FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'requester shift not found'; END IF;
  IF v_req.status <> 'assigned' THEN
    RAISE EXCEPTION 'requester shift is not assigned (status=%)', v_req.status;
  END IF;

  SELECT id, employee_id, status, shift_date INTO v_tgt
  FROM shifts WHERE id = p_target_shift FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'target shift not found'; END IF;
  IF v_tgt.status <> 'assigned' THEN
    RAISE EXCEPTION 'target shift is not assigned (status=%)', v_tgt.status;
  END IF;

  IF v_req.employee_id = v_tgt.employee_id THEN
    RAISE EXCEPTION 'cannot swap with self';
  END IF;

  INSERT INTO shift_swaps (
    requester_shift_id, target_shift_id, requester_id, target_id, message, status
  )
  VALUES (
    p_requester_shift, p_target_shift, v_req.employee_id, v_tgt.employee_id, p_message, 'pending'
  )
  RETURNING id INTO v_swap_id;

  UPDATE shifts SET status = 'swap_pending', updated_at = NOW()
  WHERE id IN (p_requester_shift, p_target_shift);

  INSERT INTO workforce_audit_log (action, entity_type, entity_id, details)
  VALUES ('shift_swap.created', 'shift_swap', v_swap_id,
          jsonb_build_object(
            'requester_shift', p_requester_shift,
            'target_shift',    p_target_shift,
            'requester',       v_req.employee_id,
            'target',          v_tgt.employee_id,
            'requester_date',  v_req.shift_date,
            'target_date',     v_tgt.shift_date
          ));

  RETURN v_swap_id;
END;
$$ LANGUAGE plpgsql;

-- Accept: reassign both shifts atomically, mark swap accepted.
CREATE OR REPLACE FUNCTION accept_shift_swap(p_swap_id UUID)
RETURNS VOID AS $$
DECLARE
  v_swap        RECORD;
  v_req_updated INTEGER;
  v_tgt_updated INTEGER;
BEGIN
  SELECT * INTO v_swap FROM shift_swaps WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'swap not found'; END IF;
  IF v_swap.status <> 'pending' THEN
    RAISE EXCEPTION 'swap is not pending (status=%)', v_swap.status;
  END IF;

  UPDATE shifts
     SET employee_id = v_swap.target_id, status = 'assigned', updated_at = NOW()
   WHERE id = v_swap.requester_shift_id
     AND employee_id = v_swap.requester_id
     AND status = 'swap_pending';
  GET DIAGNOSTICS v_req_updated = ROW_COUNT;

  UPDATE shifts
     SET employee_id = v_swap.requester_id, status = 'assigned', updated_at = NOW()
   WHERE id = v_swap.target_shift_id
     AND employee_id = v_swap.target_id
     AND status = 'swap_pending';
  GET DIAGNOSTICS v_tgt_updated = ROW_COUNT;

  IF v_req_updated <> 1 OR v_tgt_updated <> 1 THEN
    RAISE EXCEPTION 'shift state changed since swap was created (req=%, tgt=%)',
      v_req_updated, v_tgt_updated;
  END IF;

  UPDATE shift_swaps SET status = 'accepted', decided_at = NOW() WHERE id = p_swap_id;

  INSERT INTO workforce_audit_log (action, entity_type, entity_id, details)
  VALUES ('shift_swap.accepted', 'shift_swap', p_swap_id,
          jsonb_build_object(
            'requester_shift', v_swap.requester_shift_id,
            'target_shift',    v_swap.target_shift_id,
            'requester',       v_swap.requester_id,
            'target',          v_swap.target_id
          ));
END;
$$ LANGUAGE plpgsql;

-- Decline / cancel: release both shift locks (back to 'assigned').
CREATE OR REPLACE FUNCTION decline_shift_swap(p_swap_id UUID)
RETURNS VOID AS $$
DECLARE
  v_swap RECORD;
BEGIN
  SELECT * INTO v_swap FROM shift_swaps WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'swap not found'; END IF;
  IF v_swap.status <> 'pending' THEN RAISE EXCEPTION 'swap is not pending'; END IF;

  UPDATE shifts SET status = 'assigned', updated_at = NOW()
  WHERE id IN (v_swap.requester_shift_id, v_swap.target_shift_id)
    AND status = 'swap_pending';

  UPDATE shift_swaps SET status = 'declined', decided_at = NOW() WHERE id = p_swap_id;

  INSERT INTO workforce_audit_log (action, entity_type, entity_id, details)
  VALUES ('shift_swap.declined', 'shift_swap', p_swap_id, NULL);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cancel_shift_swap(p_swap_id UUID)
RETURNS VOID AS $$
DECLARE
  v_swap RECORD;
BEGIN
  SELECT * INTO v_swap FROM shift_swaps WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'swap not found'; END IF;
  IF v_swap.status <> 'pending' THEN RAISE EXCEPTION 'swap is not pending'; END IF;

  UPDATE shifts SET status = 'assigned', updated_at = NOW()
  WHERE id IN (v_swap.requester_shift_id, v_swap.target_shift_id)
    AND status = 'swap_pending';

  UPDATE shift_swaps SET status = 'cancelled', decided_at = NOW() WHERE id = p_swap_id;

  INSERT INTO workforce_audit_log (action, entity_type, entity_id, details)
  VALUES ('shift_swap.cancelled', 'shift_swap', p_swap_id, NULL);
END;
$$ LANGUAGE plpgsql;

-- Nightly cleanup: any pending swap whose requester or target shift
-- date has already passed gets expired. Wire into a cron / Edge
-- function later.
CREATE OR REPLACE FUNCTION expire_stale_shift_swaps()
RETURNS INTEGER AS $$
DECLARE
  v_swap    RECORD;
  v_expired INTEGER := 0;
BEGIN
  FOR v_swap IN
    SELECT s.id, s.requester_shift_id, s.target_shift_id
    FROM shift_swaps s
    WHERE s.status = 'pending'
      AND (
        (SELECT shift_date FROM shifts WHERE id = s.requester_shift_id) < CURRENT_DATE
        OR (SELECT shift_date FROM shifts WHERE id = s.target_shift_id) < CURRENT_DATE
      )
  LOOP
    UPDATE shifts SET status = 'assigned', updated_at = NOW()
    WHERE id IN (v_swap.requester_shift_id, v_swap.target_shift_id)
      AND status = 'swap_pending';

    UPDATE shift_swaps SET status = 'expired', decided_at = NOW() WHERE id = v_swap.id;

    INSERT INTO workforce_audit_log (action, entity_type, entity_id, details)
    VALUES ('shift_swap.expired', 'shift_swap', v_swap.id, NULL);

    v_expired := v_expired + 1;
  END LOOP;
  RETURN v_expired;
END;
$$ LANGUAGE plpgsql;
