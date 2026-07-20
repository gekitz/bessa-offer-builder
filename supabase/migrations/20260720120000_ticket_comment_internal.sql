-- ════════════════════════════════════════════════════════════════════
-- Internal-only ticket comments: staff can mark a comment as `is_internal`
-- so it never reaches the customer portal.
-- ════════════════════════════════════════════════════════════════════
--
-- Until now every staff comment (kind='comment', is_external=FALSE) was
-- visible on the share-link portal as "Anmerkung KITZ". `is_external`
-- means "the customer posted this", which is a different concept — so we
-- add a dedicated visibility flag rather than overloading it.
--
-- DEFAULT FALSE keeps all existing comments (and customer/system inserts
-- that omit the column) visible. The app opts NEW staff comments into
-- is_internal=TRUE; the DB default is not the product default.

ALTER TABLE ticket_comments
  ADD COLUMN is_internal BOOLEAN NOT NULL DEFAULT FALSE;

-- Re-scope the anon SELECT policy so internal comments are never exposed,
-- even to someone who knows the ticket_id + share_code.
DROP POLICY IF EXISTS anon_select_comments_by_ticket_share ON ticket_comments;
CREATE POLICY anon_select_comments_by_ticket_share
  ON ticket_comments FOR SELECT
  TO anon
  USING (
    kind IN ('comment', 'status_change', 'milestone')
    AND is_internal = FALSE
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_comments.ticket_id
        AND t.share_code IS NOT NULL
    )
  );
