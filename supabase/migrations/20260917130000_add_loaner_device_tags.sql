-- Leihgeräte: composable device-type tags (Gerätetyp-Schlagworte).
--
-- Product.category is NULL for essentially all hardware, so there is no
-- structured way to answer "how many mobile printers / access points / …".
-- We add a free-but-curated tag array on the device itself. Tags compose:
--   mobil + kassa            → mobiles Kassengerät (Handheld-POS, kein Drucker)
--   mobil + kassa + drucker  → mobiles Kassengerät mit integriertem Drucker
--   mobil + drucker          → mobiler Drucker (Standalone, kein POS)
--   drucker + stationaer     → stationärer Drucker
--   access-point / router    → Netzwerkgeräte
-- The controlled vocabulary lives in src/features/loaners/lib/deviceTags.ts.

ALTER TABLE loaner_devices
  ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';

-- GIN index so tag membership filters (tags @> ARRAY[...]) stay fast.
CREATE INDEX idx_loaner_devices_tags ON loaner_devices USING GIN (tags);

-- Best-effort backfill from the stored device name so the counts are useful on
-- day one. Purely additive and conservative — anything ambiguous stays
-- untagged and gets tagged by hand in the UI. array_distinct via unnest keeps
-- the arrays clean if a device matches several patterns.
UPDATE loaner_devices d
SET tags = sub.tags
FROM (
  SELECT
    id,
    ARRAY(
      SELECT DISTINCT t FROM unnest(
        CASE WHEN bezeichnung ILIKE '%access point%' OR bezeichnung ILIKE '%accesspoint%'
                  OR bezeichnung ILIKE '%unifi ap%' OR bezeichnung ILIKE '% ap %'
             THEN ARRAY['access-point'] ELSE ARRAY[]::text[] END
        || CASE WHEN bezeichnung ILIKE '%router%' OR bezeichnung ILIKE '%gateway%'
             THEN ARRAY['router'] ELSE ARRAY[]::text[] END
        || CASE WHEN bezeichnung ILIKE '%drucker%' OR bezeichnung ILIKE '%printer%'
                  OR bezeichnung ILIKE '%tse%bon%'
             THEN ARRAY['drucker'] ELSE ARRAY[]::text[] END
        || CASE WHEN bezeichnung ILIKE '%sunmi%' OR bezeichnung ILIKE '%orderman%'
                  OR bezeichnung ILIKE '%handheld%' OR bezeichnung ILIKE '%mobil%'
             THEN ARRAY['mobil', 'kassa'] ELSE ARRAY[]::text[] END
      ) AS t
    ) AS tags
  FROM loaner_devices
) sub
WHERE d.id = sub.id
  AND array_length(sub.tags, 1) > 0;
