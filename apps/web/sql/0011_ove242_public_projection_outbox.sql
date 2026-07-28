-- OVE-242 — transactional public-projection revocation outbox.
--
-- Before this migration every declassification event (publish, edit, archive,
-- erasure, moderation, location or profile visibility change) committed its
-- canonical write first and only afterwards tried to enqueue a Meilisearch
-- index/unindex job through a separate connection. A crash, a queue error, or
-- an idempotent replay between those two steps left the previous public
-- document searchable with no durable record that it had to be revoked.
--
-- `public_projection_intents` is that durable record. Exactly one row per
-- projected entity holds the desired public state and the generation that
-- produced it. The row is written inside the canonical write transaction, so
-- either both the canonical state and the intent exist, or neither does.
--
-- Applying is generation-fenced: a worker claims a lease, applies, verifies the
-- real Meilisearch state, and may only mark convergence while
-- `desired_generation` still equals the generation it claimed. An older,
-- slower applier can therefore never mark a newer desired state as converged.
--
-- This file is idempotent and is also folded into
-- `apps/web/sql/0001_walking_skeleton.sql` so a fresh bootstrap has the table.

create sequence if not exists public_projection_generation_seq as bigint;

create table if not exists public_projection_intents (
  entity_kind text not null,
  entity_id uuid not null,
  owner_user_id uuid not null,
  desired_state text not null,
  desired_generation bigint not null,
  desired_reason text not null,
  privacy_reducing boolean not null default false,
  applied_state text,
  applied_generation bigint not null default 0,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz,
  verified_at timestamptz,
  primary key (entity_kind, entity_id)
);

alter table public_projection_intents
  drop constraint if exists public_projection_intents_entity_kind_check;
alter table public_projection_intents
  add constraint public_projection_intents_entity_kind_check
  check (entity_kind in ('journal_entry'));

alter table public_projection_intents
  drop constraint if exists public_projection_intents_desired_state_check;
alter table public_projection_intents
  add constraint public_projection_intents_desired_state_check
  check (desired_state in ('present', 'absent'));

alter table public_projection_intents
  drop constraint if exists public_projection_intents_applied_state_check;
alter table public_projection_intents
  add constraint public_projection_intents_applied_state_check
  check (applied_state is null or applied_state in ('present', 'absent'));

alter table public_projection_intents
  drop constraint if exists public_projection_intents_status_check;
alter table public_projection_intents
  add constraint public_projection_intents_status_check
  check (status in ('pending', 'processing', 'applied', 'failed', 'dead'));

alter table public_projection_intents
  drop constraint if exists public_projection_intents_reason_check;
alter table public_projection_intents
  add constraint public_projection_intents_reason_check
  check (
    desired_reason in (
      'publish',
      'edit',
      'archive',
      'erasure',
      'moderation',
      'location_change',
      'catalog_identity',
      'media_presentation',
      'profile_visibility',
      'repair'
    )
  );

-- An applier may never record progress beyond the generation it claimed, and a
-- generation is always drawn from the shared sequence, so it is always > 0.
alter table public_projection_intents
  drop constraint if exists public_projection_intents_generation_check;
alter table public_projection_intents
  add constraint public_projection_intents_generation_check
  check (
    desired_generation > 0
    and applied_generation >= 0
    and applied_generation <= desired_generation
  );

-- `applied` is the only status that claims convergence, and it is unavailable
-- unless the applied generation, the applied state, and a real verification
-- read-back all agree with the desired row. "Job queued" can never be recorded
-- as deletion proof.
alter table public_projection_intents
  drop constraint if exists public_projection_intents_converged_check;
alter table public_projection_intents
  add constraint public_projection_intents_converged_check
  check (
    status <> 'applied'
    or (
      applied_generation = desired_generation
      and applied_state = desired_state
      and verified_at is not null
    )
  );

-- Claim order: privacy-reducing transitions first, then oldest desired
-- generation. The partial index keeps the claim scan proportional to
-- unconverged work rather than to the whole public corpus.
create index if not exists public_projection_intents_claim_idx
  on public_projection_intents (privacy_reducing desc, desired_generation asc)
  where applied_generation < desired_generation;

create index if not exists public_projection_intents_owner_idx
  on public_projection_intents (owner_user_id);
