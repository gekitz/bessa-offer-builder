-- ticket_watchers — internal staff who follow a ticket and get notified
-- on every new comment / status change, in addition to the assignee.
--
-- A watcher is added implicitly when someone is @mentioned in a comment
-- or writes a comment themselves (see api/ticketApi.addComment). There is
-- no explicit "watch" button yet — the mention IS the subscribe action.
--
-- Fan-out (notify-ticket-event, event=comment_added):
--   recipients = assignee ∪ watchers ∪ freshly-mentioned  −  the author

CREATE TABLE ticket_watchers (
  ticket_id   UUID NOT NULL REFERENCES tickets(id)    ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id)  ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ticket_id, employee_id)
);

CREATE INDEX idx_ticket_watchers_employee ON ticket_watchers(employee_id);

ALTER TABLE ticket_watchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_access ON ticket_watchers FOR ALL USING (true) WITH CHECK (true);
