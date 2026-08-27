-- Merker "E-Mail schon aus Mesonic geprüft" — unabhängig davon, ob eine
-- gefunden wurde. Ohne diesen Merker bleiben Installationen, für die
-- Mesonic keine E-Mail kennt, dauerhaft im "ohne E-Mail"-Set und der
-- gedrosselte 40er-Backfill würde immer wieder dieselben Zeilen abrufen,
-- statt zu den nächsten weiterzugehen.
ALTER TABLE viertl_licenses
  ADD COLUMN email_checked_at TIMESTAMPTZ;
