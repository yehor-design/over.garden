-- OVE-387 (closed out under OVE-399): the fuzzy arm's candidates from the
-- stored trigram sets, for short queries.
--
-- The picker's fuzzy arm asks pg_trgm's `%` operator, and its index answers
-- with every name sharing at least 30% of the query's trigrams — but the
-- index is lossy, so each candidate is fetched and rechecked with
-- `similarity()`, which tokenises the name again: about 26 µs on Cyrillic.
-- For "де ба" that is 118 ms for three rows, and it runs whenever the prefix
-- arm cannot fill the list, which is exactly when a gardener is mid-word.
--
-- The stored sets of 0065 make the same candidate rule cheap to check. A
-- name can only reach similarity 0.3 if it shares at least ceil(0.3 · n) of
-- the query's n trigrams (shared / (n + m - shared) ≥ 0.3 with shared ≤ n
-- forces it), so `catalog_trigram_query` spells that rule out as an intarray
-- `query_int` — every k-subset of the query's trigrams, OR-ed — and this GIN
-- index answers it. The recheck is then `icount` on two sorted arrays, a
-- microsecond, and pg_trgm's own float4 falls out of the same count.
--
-- Only for short queries. The OR of k-subsets has C(n, k) terms and the GIN
-- consistent check evaluates that tree per candidate: at n = 6 it is fifteen
-- terms and "де ба" goes from 118 to 47 ms; at n = 10 it is 120 terms and
-- "helianth" goes from 98 to 362 ms. The statement uses this index below
-- seven trigrams and the pg_trgm index from seven up, where the trigrams are
-- selective enough that `%` is already cheap. Measured on 2026-09-08 in a
-- rolled-back transaction against production; the candidate sets of the two
-- arms were identical on every query tried.

create or replace function catalog_trigram_query(trigrams int[], required int)
returns query_int
language sql
immutable
strict
parallel safe
as $$
  with recursive combos(chosen, next_index, depth) as (
    select '{}'::int[], 1, 0
    union all
    select combos.chosen || trigrams[i], i + 1, combos.depth + 1
    from combos, generate_series(combos.next_index, cardinality(trigrams)) as i
    where combos.depth < required
  )
  select string_agg('(' || array_to_string(chosen, '&') || ')', '|')::query_int
  from combos
  where depth = required
$$;

create index if not exists catalog_item_names_search_trigrams_gin_idx
  on catalog_item_names using gin (search_trigrams gin__int_ops);

analyze catalog_item_names;
