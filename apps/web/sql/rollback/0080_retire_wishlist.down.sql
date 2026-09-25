-- Rollback of 0080 (OVE-512, ADR-0033). The rows are gone for good: the drop
-- took them, with the owner's sign-off. This only recreates the empty table in
-- the shape `0001` gives it, so that a code rollback to a release that still
-- reads the wishlist finds a table rather than an error.
set local lock_timeout = '5s';
set local statement_timeout = '20s';

create table if not exists wishlist_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references "user"(id) on delete cascade,
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  source_surface text not null default 'catalog_item'
    constraint wishlist_items_source_surface_check check (
      source_surface in ('catalog_item', 'public_variety')
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wishlist_items_owner_catalog_uidx unique (owner_user_id, catalog_item_id)
);

create index if not exists wishlist_items_owner_created_idx
  on wishlist_items (owner_user_id, created_at desc);
