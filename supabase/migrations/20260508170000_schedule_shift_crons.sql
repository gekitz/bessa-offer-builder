-- Two nightly maintenance jobs for the shifts feature. Both run as
-- pure SQL (no HTTP / edge function hop) so we don't need vault
-- secrets — pg_cron executes the body in the database directly.
--
--   * shifts-expire-stale-swaps   03:15 UTC nightly
--     Marks any pending shift_swaps row whose requester or target
--     shift date has already passed → 'expired' and releases the
--     'swap_pending' lock on both shifts.
--
--   * push-prune-stale-subs       03:30 UTC nightly
--     Deletes push_subscriptions rows whose last_seen_at is older
--     than 90 days. Keeps the registry from growing indefinitely
--     when users unsubscribe at the OS level (Apple/Google never
--     tell us — only a delivery-time 410 does, and an inactive
--     user gets no deliveries to provoke that).
--
-- pg_cron runs in UTC. 03:15 / 03:30 sit comfortably inside the
-- maintenance window and well after Resend / push retries from the
-- previous evening have settled.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotent: drop any prior schedule with the same name before
-- recreating, so re-running the migration in dev doesn't duplicate.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('shifts-expire-stale-swaps', 'push-prune-stale-subs');

SELECT cron.schedule(
  'shifts-expire-stale-swaps',
  '15 3 * * *',
  $$ SELECT expire_stale_shift_swaps(); $$
);

SELECT cron.schedule(
  'push-prune-stale-subs',
  '30 3 * * *',
  $$ DELETE FROM push_subscriptions WHERE last_seen_at < NOW() - INTERVAL '90 days'; $$
);
