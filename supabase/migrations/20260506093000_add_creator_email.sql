-- Replies to angebote@kitz.co.at (the Resend sender) bounce because
-- Resend is outbound-only and the alias has no inbox. Storing the
-- creator's real mailbox lets send-offer set Reply-To so customer
-- replies land with the rep who issued the offer.

ALTER TABLE offers ADD COLUMN creator_email TEXT;

-- Backfill from the TEAM list in src/features/offers/data/catalogs.ts
-- so historical offers can also be re-sent with the right reply-to.
-- Keep this in sync if the TEAM map changes.
UPDATE offers SET creator_email = CASE creator_id
  WHEN 'gkitz'         THEN 'g.kitz@kitz.co.at'
  WHEN 'hbauer'        THEN 'h.bauer@kitz.co.at'
  WHEN 'dscharf'       THEN 'd.scharf@kitz.co.at'
  WHEN 'anowak'        THEN 'a.nowak@kitz.co.at'
  WHEN 'thuber'        THEN 't.huber@kitz.co.at'
  WHEN 'hscheiber'     THEN 'h.scheiber@kitz.co.at'
  WHEN 'mklein'        THEN 'm.klein@kitz.co.at'
  WHEN 'hrussnig'      THEN 'h.russnig@kitz.co.at'
  WHEN 'coberlerchner' THEN 'c.oberlerchner@kitz.co.at'
  WHEN 'hkitz'         THEN 'h.kitz@kitz.co.at'
  ELSE creator_email
END
WHERE creator_email IS NULL;
