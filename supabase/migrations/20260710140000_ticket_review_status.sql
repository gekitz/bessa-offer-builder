-- Add a 'review' (Prüfung) status between in_progress and closed: the
-- supervisor QA gate before a ticket is closed/billed.
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('open', 'in_progress', 'waiting', 'review', 'closed', 'cancelled'));
