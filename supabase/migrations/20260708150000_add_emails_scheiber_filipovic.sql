-- Email-Adressen für die beiden neu angelegten Techniker nachtragen,
-- damit sie Ticket-Benachrichtigungen per Mail erhalten (bisher nur Push).
UPDATE employees SET email = 'sh@kitz.co.at' WHERE code = 'hscheiber';   -- Heribert Scheiber
UPDATE employees SET email = 'fp@kitz.co.at' WHERE code = 'pfilipovic';  -- Pavo Filipovic
