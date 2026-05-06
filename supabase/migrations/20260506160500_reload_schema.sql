-- Force PostgREST to refresh its schema cache after the lost_reason
-- columns were added. Without this, the REST API can serve a stale
-- schema for ~10 minutes and POSTs writing lost_reason fail with
-- "column does not exist". One-shot, idempotent.
NOTIFY pgrst, 'reload schema';
