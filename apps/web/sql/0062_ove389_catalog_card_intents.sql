-- 0062 (OVE-389, ADR-0026 D9): the public projection outbox carries organism
-- card revalidation intents.
--
-- Worker-originated changes to an organism (a reconciliation merge, a source
-- refresh, a fact written by a data job) revalidate the card through the
-- outbox: the worker writes one row per organism, the web cron drains it and
-- expires the card's cache tags. 0054 added the reason `catalog_card`; the
-- entity-kind check still admitted journal entries alone, and a catalog item
-- has no owner. This migration admits `catalog_item` intents without an owner.
-- Journal-entry rows keep their owner, their check and their drain
-- (`app/public_projection.py` and `public-projection-outbox.ts` both filter by
-- entity kind).
--
-- Idempotent: every constraint is dropped and re-created by name, and the
-- column change is a no-op on replay.

alter table public_projection_intents
  drop constraint if exists public_projection_intents_entity_kind_check;

alter table public_projection_intents
  add constraint public_projection_intents_entity_kind_check
  check (entity_kind in ('journal_entry', 'catalog_item'));

alter table public_projection_intents
  alter column owner_user_id drop not null;

-- A journal entry intent always carries its owner; a card intent never does.
alter table public_projection_intents
  drop constraint if exists public_projection_intents_owner_scope_check;

alter table public_projection_intents
  add constraint public_projection_intents_owner_scope_check
  check ((entity_kind = 'journal_entry') = (owner_user_id is not null));

-- A card intent means "render the card again": present, never privacy-reducing.
alter table public_projection_intents
  drop constraint if exists public_projection_intents_catalog_card_shape_check;

alter table public_projection_intents
  add constraint public_projection_intents_catalog_card_shape_check
  check (
    entity_kind <> 'catalog_item'
    or (
      desired_reason = 'catalog_card'
      and desired_state = 'present'
      and privacy_reducing = false
    )
  );
