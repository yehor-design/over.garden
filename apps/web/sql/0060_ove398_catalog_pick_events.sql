-- OVE-398 (ADR-0026 D12): what happens when a gardener picks from the catalog.
--
-- The product has never measured whether picking works. Whether someone found
-- the species, gave up and typed their own label, or abandoned the field
-- entirely is the difference between a catalog that helps and one that is in
-- the way — and none of it is in the database today.
--
-- One row per completed pick or abandonment, and deliberately nothing that
-- could identify what was typed: a length, not a query; a duration, not a
-- timestamp trail; the node when there was one. The owner is kept because the
-- erasure workflow has to be able to find these rows, and for nothing else:
-- no report reads it.
--
-- Rows expire after ninety days. A metric that needs a year of history is a
-- different table with a different argument; this one exists to answer "is it
-- working now", and holding personal-adjacent rows longer than the question
-- needs is not a neutral choice.

create table if not exists catalog_pick_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  -- The four ways a pick can end. `abandoned` is the one that matters most and
  -- the one an event table without it would silently drop.
  outcome text not null
    check (outcome in ('picked_species', 'picked_form', 'own_label', 'abandoned')),
  -- How much the gardener typed, never what. A length cannot be read back into
  -- a plant, a place or a person.
  query_length integer not null default 0
    check (query_length between 0 and 500),
  -- From the first keystroke to the decision. Null when the control never
  -- reported one rather than zero, which would make an unmeasured pick look
  -- instant.
  ms_to_pick integer
    check (ms_to_pick is null or ms_to_pick between 0 and 3600000),
  locale text not null check (char_length(locale) between 2 and 12),
  object_kind text not null check (char_length(object_kind) between 1 and 40),
  -- The node picked, when one was. `on delete set null` because a merged or
  -- deleted node must not take the measurement with it.
  catalog_item_id uuid references catalog_items(id) on delete set null,
  owner_user_id uuid not null references "user"(id) on delete cascade
);

-- Every report is "the last seven days" or "the last thirty", so this is the
-- only access path the table has.
create index if not exists catalog_pick_events_occurred_at_idx
  on catalog_pick_events (occurred_at desc);

-- The erasure workflow finds a gardener's rows by owner.
create index if not exists catalog_pick_events_owner_idx
  on catalog_pick_events (owner_user_id);

comment on table catalog_pick_events is
  'OVE-398 (ADR-0026 D12): one row per completed pick or abandonment; no query text, purged after 90 days.';

/**
 * Deletes pick events older than the retention window.
 *
 * A function rather than a statement in the cron route, so the window is one
 * number in one place and the purge can be executed by a test against real
 * rows instead of asserted about.
 */
create or replace function catalog_purge_pick_events(older_than_days integer default 90)
returns integer
language plpgsql
as $$
declare
  removed integer;
begin
  if older_than_days is null or older_than_days < 1 then
    raise exception 'catalog_purge_pick_events: retention must be at least one day';
  end if;
  delete from catalog_pick_events
  where occurred_at < now() - (older_than_days || ' days')::interval;
  get diagnostics removed = row_count;
  return removed;
end $$;

comment on function catalog_purge_pick_events(integer) is
  'OVE-398: drops pick events past the retention window and answers how many.';
