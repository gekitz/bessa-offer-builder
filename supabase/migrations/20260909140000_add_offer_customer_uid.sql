-- UID-Nummer (VAT ID) des Kunden am Angebot. Wird aus der Mesonic-Kundensuche
-- (T058.C022) übernommen bzw. manuell erfasst und auf dem Angebots-PDF gezeigt.
ALTER TABLE offers ADD COLUMN IF NOT EXISTS customer_uid TEXT;
