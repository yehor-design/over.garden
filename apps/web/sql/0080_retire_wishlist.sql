-- OVE-512. The wishlist is retired (ADR-0033; the owner's decision of 2026-09-25: "це
-- нам не потрібно. Видалити повністю з проєкту!"). The product no longer keeps
-- a shelf of organisms a gardener wants to grow. Its page, the button on the
-- organism pages, the account-menu entry and the copy left in the same change.
--
-- The table held only an owner, a catalogue item, a source-surface label and
-- two timestamps. The owner asked for it to go with everything else, rows
-- included; `apply-reviewed-migration.ts --mode inventory` reports the row
-- count of a dropped table that is still present, so the count is read before
-- the apply.
--
-- Apply only after the release that no longer reads the table is live: the
-- previous release's /wishlist page and organism-page button query it.
--
-- `0001` still creates the table, so a replay creates and drops it again.
-- That is harmless: nothing else reads it (the pattern `0014` set).

set local lock_timeout = '5s';
set local statement_timeout = '20s';

drop table if exists wishlist_items;
