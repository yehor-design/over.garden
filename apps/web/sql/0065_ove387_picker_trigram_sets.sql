-- OVE-387 (closed out under OVE-399): the picker's similarity as an
-- intersection count, not a re-tokenisation per row.
--
-- The picker computes `similarity(n.normalized_name, <query>)` for every name
-- its prefix scan returns. pg_trgm answers that by tokenising the name into
-- trigrams again on every call, and on Cyrillic that costs about 26 µs a row.
-- Measured against production on 2026-09-07 for the prefix "со": the scan
-- itself returns 3,451 names in 3 ms, and the same scan projecting
-- `similarity()` takes 46–99 ms. The Ukrainian register lists thousands of
-- sunflower hybrids, so a gardener typing the most common crop paid that on
-- every keystroke, and the route answered 503 under its own 400 ms deadline.
--
-- The trigram set of a name never changes unless the name does, so it is
-- stored once, as a generated column. `show_trgm` renders each trigram in the
-- same compact three-byte form pg_trgm compares internally — printable ASCII
-- as exactly three characters, anything else as "0x" and six hex digits of
-- its hash — and `catalog_trigram_ints` maps that form to one integer per
-- trigram, hash collisions included, so the stored set is exactly the set
-- `similarity()` counts. The two renderings are told apart by length, never
-- by prefix: a name containing the word "0x" yields the printable trigram
-- "0x ", three characters long. (The first version of this function looked
-- at the prefix and failed on exactly that; the equivalence proof found it on
-- a sampled register name before any such name was stored.)
-- With `intarray`, the count of shared trigrams is `icount(a & b)`
-- on two sorted arrays, about a microsecond, and
--
--   shared::float4 / (|T(query)| + |T(name)| - shared)::float4
--
-- is bit for bit the float4 pg_trgm returns (CALCSML in trgm.h). Checked
-- against every one of production's 246,888 names for fourteen queries
-- spanning Cyrillic, Latin, apostrophes, digits and a lone character: zero
-- mismatches.
--
-- Two things this depends on, stated so nobody has to rediscover them:
--
--   * `catalog_trigram_ints` must never change meaning while the column
--     exists — a generated column is not recomputed when its function is.
--     Change it only by dropping and re-adding the column.
--   * pg_trgm's tokenisation has been stable for a decade; if an upgrade ever
--     changed it, `show_trgm` at query time would disagree with the stored
--     sets. The picker proof compares the two, so that would be found.
--
-- Adding a stored generated column rewrites the table under an exclusive
-- lock: about 47 s on production's 246,888 rows. Applied at night, once.

create extension if not exists intarray;

create or replace function catalog_trigram_ints(trigrams text[])
returns int[]
language sql
immutable
strict
parallel safe
as $$
  select coalesce(
    array_agg(
      case
        when length(t) = 8 and t like '0x%' then ('x' || substr(t, 3))::bit(24)::int
        else (ascii(substr(t, 1, 1)) << 16)
             | (ascii(substr(t, 2, 1)) << 8)
             | ascii(substr(t, 3, 1))
      end
      order by t
    ),
    '{}'::int[]
  )
  from unnest(trigrams) as t
$$;

alter table catalog_item_names
  add column if not exists search_trigrams int[]
    generated always as (catalog_trigram_ints(show_trgm(normalized_name))) stored
    not null;

analyze catalog_item_names;
