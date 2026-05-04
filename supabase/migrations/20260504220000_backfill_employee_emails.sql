-- Populate employees.email from the canonical Microsoft / Outlook
-- address scheme: <firstname>.<lastname>@kitz.co.at, lowercase, with
-- ASCII transliteration for the few umlauts in the team. Used by the
-- notify-leave-decision edge function to email approval / rejection
-- updates to the requester.
--
-- Idempotent: only fills NULL rows so manual edits survive a rerun.

UPDATE employees SET email = m.email
FROM (VALUES
  ('hrussnig',      'h.russnig@kitz.co.at'),
  ('ahuber',        'a.huber@kitz.co.at'),
  ('aflagl',        'a.flagl@kitz.co.at'),
  ('anowak',        'a.nowak@kitz.co.at'),
  ('gtriebelnig',   'g.triebelnig@kitz.co.at'),
  ('gkitz',         'g.kitz@kitz.co.at'),
  ('mbuchbauer',    'm.buchbauer@kitz.co.at'),
  ('coberlerchner', 'c.oberlerchner@kitz.co.at'),
  ('skumpusch',     's.kumpusch@kitz.co.at'),
  ('sbauer',        's.bauer@kitz.co.at'),
  ('mgraf',         'm.graf@kitz.co.at'),
  ('mmaier',        'm.maier@kitz.co.at'),
  ('hbauer',        'h.bauer@kitz.co.at'),
  ('dscharf',       'd.scharf@kitz.co.at'),
  ('wkriegl',       'w.kriegl@kitz.co.at'),
  ('sriedl',        's.riedl@kitz.co.at'),
  ('dthorer',       'd.thorer@kitz.co.at'),
  ('bzmug',         'b.zmug@kitz.co.at'),
  ('hkitz',         'h.kitz@kitz.co.at')
) AS m(code, email)
WHERE employees.code = m.code
  AND employees.email IS NULL;
