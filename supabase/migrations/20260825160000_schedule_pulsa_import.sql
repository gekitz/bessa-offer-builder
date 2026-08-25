-- Nightly refresh of the Pulsa price list (pulsa-import edge function).
--
-- Reuses the same Vault secrets + CRON_SECRET as the follow-up digest
-- (see 20260506080000_schedule_followup_digest.sql):
--   vault: digest_project_url, digest_cron_secret
--   function secret: CRON_SECRET (== digest_cron_secret)
-- pulsa-import accepts CRON_SECRET as its bearer.
--
-- pg_cron runs in UTC. 04:00 UTC sits in the maintenance window, well
-- before the workday. The item feed changes at most daily, so nightly
-- is ample.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'nightly-pulsa-import';

SELECT cron.schedule(
  'nightly-pulsa-import',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'digest_project_url')
           || '/functions/v1/pulsa-import',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'digest_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
