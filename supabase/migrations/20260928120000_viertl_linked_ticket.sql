-- ════════════════════════════════════════════════════════════════════
-- Viertl: verknüpftes Ticket
--
-- Spiegelt linked_offer_id: eine Installation kann (zusätzlich zu einem
-- Angebot) ein Support-/Reparatur-Ticket haben, das direkt aus der
-- Viertl-Liste angelegt wurde. ON DELETE SET NULL, damit ein gelöschtes
-- Ticket die Lizenz nicht mitreißt — die Verknüpfung fällt einfach weg.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE viertl_licenses
  ADD COLUMN linked_ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL;

-- Neuer Aktionstyp fürs Audit-Log (analog zu offer_attached).
ALTER TABLE viertl_events DROP CONSTRAINT viertl_events_type_check;
ALTER TABLE viertl_events ADD CONSTRAINT viertl_events_type_check
  CHECK (type IN ('field_change','note','email_sent','email_opened','offer_attached','ticket_attached','viertl_notified'));
