-- Customer-facing milestone events on the ticket timeline (e.g.
-- "Reparaturschein wurde erstellt/unterschrieben"). A dedicated kind so
-- the public portal can surface these without exposing internal
-- 'system' notes.
ALTER TABLE ticket_comments DROP CONSTRAINT IF EXISTS ticket_comments_kind_check;
ALTER TABLE ticket_comments ADD CONSTRAINT ticket_comments_kind_check
  CHECK (kind IN ('comment', 'status_change', 'assignment', 'system', 'milestone'));
