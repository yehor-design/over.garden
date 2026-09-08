-- Rollback of 0065: drop the stored trigram sets, the function that builds
-- them and the extension that counts them.
--
-- The picker statement on `main` after 0065 reads `search_trigrams` and calls
-- `icount`, so this rollback belongs with the code that preceded it. Nothing
-- else in the schema uses `intarray`. Dropping the column is a metadata
-- change; no row is rewritten.

alter table catalog_item_names drop column if exists search_trigrams;

drop function if exists catalog_trigram_ints(text[]);

drop extension if exists intarray;
