-- Kumulierter Zahlungsbetrag (OP-Ausgleich) je Beleg mitcachen.
--
-- WEBBelege-Kopf (T025) liefert jetzt `KumulierterZahlungsbetrag` — die
-- gegen den Beleg gebuchten Zahlungen (NICHT die Belegsumme). Wir zeigen
-- den Wert im CRM-/Viertl-Belegpanel als „Bezahlt" an.
--
-- Hinweis: anders als der Rest des Belegs ist dieser Wert NICHT unveränder-
-- lich (steigt mit jeder gebuchten Zahlung). Der inkrementelle Sync lädt
-- nur neue Belege nach → der gecachte Wert kann veralten; ein voller
-- Re-Scan (full) aktualisiert ihn.

ALTER TABLE mesonic_beleg
  ADD COLUMN kumulierter_zahlungsbetrag NUMERIC NOT NULL DEFAULT 0;
