-- One-off data seed: populate employees.tags so the dispatcher's
-- "Leitstelle" view has something to filter by. NOT a migration —
-- these are people-specific assignments that you can hand-edit later.
--
-- Tag vocabulary (kept ASCII so the filter pills stay easy to type):
--   techniker   — does on-site repair / installation
--   verkauf     — sales
--   kassen      — POS systems specialist
--   it          — IT department
--   mfp         — multifunction printers / copier department
--   office      — back-office, admin
--   support     — phone/remote support
--   mesonic     — Mesonic ERP specialist
--   gf          — Geschäftsführung
--   lehrling    — apprentice
--
-- Codes that don't exist in your DB are silently ignored (0 rows
-- updated). Run this in the Supabase SQL editor — review first,
-- then execute. Re-running is safe (idempotent: assigns the same
-- array each time).

-- Geschäftsführung
update public.employees set tags = array['gf']::text[] where code in ('gkitz','hkitz');

-- Sales (Verkauf)
update public.employees set tags = array['verkauf']::text[] where code in ('hbauer','dscharf','anowak');

-- Kassen techs (drive on-site work AND know POS systems)
update public.employees set tags = array['techniker','kassen']::text[]
  where code in ('hrussnig','coberlerchner','ahuber','mbuchbauer','mklein');

-- Toni Huber — kassen-system advisor (mix of sales + POS)
update public.employees set tags = array['kassen','verkauf']::text[] where code = 'thuber';

-- IT techs
update public.employees set tags = array['techniker','it']::text[]
  where code in ('aflagl','skumpusch');

-- MFP techs
update public.employees set tags = array['techniker','mfp']::text[]
  where code in ('sbauer','mgraf');

-- Apprentice (MFP)
update public.employees set tags = array['techniker','mfp','lehrling']::text[]
  where code = 'mmaier';

-- Mesonic ERP specialist
update public.employees set tags = array['mesonic']::text[] where code = 'hscheiber';

-- Office / Büro
update public.employees set tags = array['office']::text[]
  where code in ('gtriebelnig','wkriegl','sriedl','dthorer','bzmug');

-- ── Quick verification query (run separately) ────────────────────────
-- select code, name, tags
-- from public.employees
-- where active = true
-- order by tags, name;
