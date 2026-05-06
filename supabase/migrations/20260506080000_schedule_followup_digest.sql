-- Schedule the daily follow-up digest email.
--
-- pg_cron runs in UTC. We pick 06:00 UTC, which lands at 08:00
-- Europe/Vienna while DST is active (late Mar – late Oct) and 07:00
-- the rest of the year. If you need an exact 08:00 year-round, swap
-- this for a dual-cron + Vienna-hour gate inside the edge function.
--
-- This schedule reads two secrets from Supabase Vault. Create them
-- once per project (Supabase Studio → SQL editor):
--
--   SELECT vault.create_secret(
--     'https://<project-ref>.supabase.co', 'digest_project_url');
--   SELECT vault.create_secret(
--     '<long-random-string>', 'digest_cron_secret');
--
-- And as a Supabase function secret (matching digest_cron_secret):
--
--   supabase secrets set CRON_SECRET=<same-long-random-string>
--
-- Rotate by calling vault.update_secret(...) — the cron job re-reads
-- the secret on every run, no need to re-schedule.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent: drop any prior schedule with the same name before
-- recreating, so re-running the migration in dev doesn't duplicate.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'daily-followup-digest';

SELECT cron.schedule(
  'daily-followup-digest',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'digest_project_url')
           || '/functions/v1/daily-followup-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'digest_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
