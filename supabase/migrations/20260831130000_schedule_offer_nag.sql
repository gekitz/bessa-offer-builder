-- Täglicher „Aktion nötig"-Nag pro Ersteller (Mo–Fr, 06:00 UTC ≈ 08:00
-- Europe/Vienna während DST). Nutzt dieselben Vault-Secrets wie der
-- Follow-up-Digest (digest_project_url + digest_cron_secret = CRON_SECRET).
-- Siehe supabase/functions/daily-offer-nag/.

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'daily-offer-nag';

SELECT cron.schedule(
  'daily-offer-nag',
  '0 6 * * 1-5',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'digest_project_url')
           || '/functions/v1/daily-offer-nag',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'digest_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
