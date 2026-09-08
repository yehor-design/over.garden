-- Rollback of 0066: drop the intarray index over the stored trigram sets
-- and the function that spells the candidate rule out.
--
-- The picker statement on `main` after 0066 calls `catalog_trigram_query`
-- for queries of up to six trigrams, so this rollback belongs with the code
-- that preceded it. Without the index the same query would still be correct,
-- only slow; without the function it does not run.

drop index if exists catalog_item_names_search_trigrams_gin_idx;

drop function if exists catalog_trigram_query(int[], int);
