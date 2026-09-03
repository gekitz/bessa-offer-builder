-- Fix: ticket attachment uploads fail with "new row violates row-level
-- security policy".
--
-- The 'ticket-attachments' bucket was created in
-- 20260512120000_create_tickets.sql but never got storage.objects RLS
-- policies (unlike the offers + leave-attachments buckets). Storage RLS is
-- on by default, so with no policy every insert into storage.objects for
-- this bucket is denied. Add the same permissive shape used for
-- leave-attachments (and matching the tickets tables' all_access).

DROP POLICY IF EXISTS "ticket_attachments_read"   ON storage.objects;
DROP POLICY IF EXISTS "ticket_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "ticket_attachments_update" ON storage.objects;
DROP POLICY IF EXISTS "ticket_attachments_delete" ON storage.objects;

CREATE POLICY "ticket_attachments_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ticket-attachments');

CREATE POLICY "ticket_attachments_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ticket-attachments');

CREATE POLICY "ticket_attachments_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'ticket-attachments')
  WITH CHECK (bucket_id = 'ticket-attachments');

CREATE POLICY "ticket_attachments_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'ticket-attachments');
