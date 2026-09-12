-- Rollback of 0071: the catalog slug column goes back to an unbounded length.
--
-- `0001`'s constraint is restored exactly as it was: the same pattern, no
-- length bound. Every row that satisfies the narrower version satisfies this
-- one, so the rollback cannot fail on data.
--
-- It does not move an address back. The re-slug that `0071` accompanies is a
-- data change with its own history rows, and every address it retired answers
-- 308 through `catalog_item_slug_history` whether this constraint is narrow or
-- wide. Undoing the addresses is a second run of the move script with the old
-- generators, which no longer exist.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'catalog_items_public_slug_check'
      and conrelid = 'catalog_items'::regclass
  ) then
    alter table catalog_items
      drop constraint catalog_items_public_slug_check;
  end if;

  alter table catalog_items
    add constraint catalog_items_public_slug_check
    check (public_slug is null or public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
end $$;
