-- Krankmeldung (doctor's note) attachment for leave_requests.
--
-- Austrian Urlaubsgesetz § 8 requires the employee to provide a
-- Krankmeldung when the absence is ≥ 3 working days. We always allow
-- one to be uploaded — the form surfaces the input on Krankenstand
-- entries so HR has a paper trail when needed.
--
-- Storage: a separate, NOT-public bucket so the doctor's note isn't
-- linkable from a guessable public URL. Downloads go through Supabase
-- createSignedUrl which mints a short-lived token. RLS on the bucket
-- mirrors the existing permissive pattern (anyone with a valid auth
-- session can upload + read) — tighten later when role-aware RLS lands
-- across the workforce schema.

ALTER TABLE leave_requests
  ADD COLUMN attachment_path TEXT;

-- Bucket. INSERT … ON CONFLICT keeps the migration idempotent.
INSERT INTO storage.buckets (id, name, public)
VALUES ('leave-attachments', 'leave-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — same permissive shape as the leave_requests table.
-- Each statement is wrapped in DROP IF EXISTS so re-running the
-- migration doesn't fail on the duplicate.
DROP POLICY IF EXISTS "leave_attachments_read"   ON storage.objects;
DROP POLICY IF EXISTS "leave_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "leave_attachments_update" ON storage.objects;
DROP POLICY IF EXISTS "leave_attachments_delete" ON storage.objects;

CREATE POLICY "leave_attachments_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'leave-attachments');

CREATE POLICY "leave_attachments_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'leave-attachments');

CREATE POLICY "leave_attachments_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'leave-attachments')
  WITH CHECK (bucket_id = 'leave-attachments');

CREATE POLICY "leave_attachments_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'leave-attachments');
