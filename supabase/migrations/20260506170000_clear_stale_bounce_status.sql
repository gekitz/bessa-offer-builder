-- Backfill: any offer currently marked status='bounced' that ALSO
-- has a later successful event ('delivered' or 'opened') should
-- reflect the latest signal — the rep already corrected the email
-- and re-sent successfully, so the loud "Unzustellbar" banner is
-- wrong.
--
-- Pre-this-migration, the resend-webhook hard-set status='bounced'
-- without checking whether a subsequent send had succeeded. The
-- updated webhook (this same migration's accompanying code change)
-- now respects later successes; this UPDATE corrects the historical
-- rows in one shot.
--
-- 'opened' first, then 'delivered' — opened is the stronger signal
-- and we don't want the second pass to overwrite it.

UPDATE offers o
SET status = 'opened',
    opened_at = COALESCE(
      o.opened_at,
      (SELECT MAX(occurred_at) FROM email_events e
        WHERE e.offer_id = o.id AND e.event_type = 'opened')
    )
WHERE o.status = 'bounced'
  AND EXISTS (
    SELECT 1 FROM email_events e
    WHERE e.offer_id = o.id AND e.event_type = 'opened'
  );

UPDATE offers o
SET status = 'delivered'
WHERE o.status = 'bounced'
  AND EXISTS (
    SELECT 1 FROM email_events e
    WHERE e.offer_id = o.id AND e.event_type = 'delivered'
  );
