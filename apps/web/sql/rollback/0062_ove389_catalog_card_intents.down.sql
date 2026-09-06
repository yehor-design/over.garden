-- Rollback of 0062 (OVE-389). Card intents leave with their entity kind; the
-- owner column returns to NOT NULL and the entity-kind check to journal
-- entries alone. Journal-entry intents are untouched.

delete from public_projection_intents where entity_kind = 'catalog_item';

alter table public_projection_intents
  drop constraint if exists public_projection_intents_catalog_card_shape_check;

alter table public_projection_intents
  drop constraint if exists public_projection_intents_owner_scope_check;

alter table public_projection_intents
  alter column owner_user_id set not null;

alter table public_projection_intents
  drop constraint if exists public_projection_intents_entity_kind_check;

alter table public_projection_intents
  add constraint public_projection_intents_entity_kind_check
  check (entity_kind in ('journal_entry'));
