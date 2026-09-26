-- OVE-519. A species page is published while a public entry is about it or
-- one of its forms (`apps/web/src/server/catalog-publication.ts`), and nothing
-- else decides it: the owner's "mark indexable" switch left with the owner
-- controls on the card, and no statement, function or page reads the column
-- any more. The task says to drop it once nothing reads it, and to record the
-- rows first.
--
-- Read-only on production, 2026-09-26: one row true (`solanum-lycopersicum`),
-- none false, 114 755 null. That page is published by the rule anyway —
-- gardeners wrote public entries about it — so the drop changes nothing a
-- reader sees.
--
-- Apply only after the release that no longer reads it is live: the previous
-- release's organism card, sitemap and catalogue browse select it.
--
-- `0054` still adds the column (`add column if not exists`), so a replay adds
-- and drops it again. That is harmless: nothing reads it in between.
--
-- `first_hand_content_at` stays: `catalog_apply_queue_item` (`0056`) still
-- writes it on an apply and reads it on a merge.

set local lock_timeout = '5s';
set local statement_timeout = '20s';

alter table catalog_items drop column if exists indexable_override;
