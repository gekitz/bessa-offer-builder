-- Adds a free-text tag set to employees so the dispatcher view can
-- filter the next-free-slot search by role / skill (e.g. only
-- technicians for an on-site repair). The column is a text[] rather
-- than a separate join table because:
--   * dispatcher reads are O(employees) — < 50 rows total — so the
--     extra join is overkill,
--   * the office team will hand-curate these from the existing
--     employees admin UI, no taxonomy churn expected.
--
-- An empty array is the default so existing code that does not know
-- about tags keeps working.

alter table public.employees
  add column if not exists tags text[] not null default '{}'::text[];

-- GIN index makes the future "WHERE tags @> ARRAY['techniker']" query
-- pattern cheap. Today we filter client-side because <50 rows.
create index if not exists employees_tags_idx
  on public.employees using gin (tags);
