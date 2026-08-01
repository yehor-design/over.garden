-- OVE-219: transactional, privacy-safe learning-attribution outbox.
-- The canonical journal mutation owns intent creation. The consumer resolves
-- durable actor class after the response and never changes write authorization.

create table if not exists learning_attribution_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references "user"(id) on delete cascade,
  cohort text,
  segment text,
  state text not null default 'pending'
    check (state in ('pending', 'processing', 'attributed', 'failed', 'dead', 'cancelled')),
  -- A write can arrive after a prior consumer has finished. Keep a monotonic
  -- intent version so settlement of an older lease reopens the item instead of
  -- losing the later event's actor-class backfill.
  desired_generation integer not null default 1 check (desired_generation >= 1),
  applied_generation integer not null default 0 check (applied_generation >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  terminalized_at timestamptz,
  last_error_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_attribution_outbox_hint_pair_check check (
    (cohort is null and segment is null)
    or (
      cohort in ('closed_pilot', 'founder_rehearsal')
      and segment in (
        'casual_micro_grower',
        'casual_gen_z',
        'casual_practical_beginner',
        'casual_urban_balcony',
        'casual_food_self_reliance',
        'power_burned_out_it',
        'power_collector',
        'power_experienced',
        'power_homestead',
        'supply_expert_creator',
        'supply_local_seller',
        'channel_ally',
        'unknown_segment'
      )
    )
  ),
  constraint learning_attribution_outbox_processing_lease_check check (
    (state = 'processing' and locked_at is not null and locked_by is not null)
    or (state <> 'processing' and locked_at is null and locked_by is null)
  ),
  constraint learning_attribution_outbox_terminal_state_check check (
    (state in ('attributed', 'dead', 'cancelled') and terminalized_at is not null)
    or (state not in ('attributed', 'dead', 'cancelled') and terminalized_at is null)
  ),
  constraint learning_attribution_outbox_generation_check check (
    applied_generation <= desired_generation
  ),
  constraint learning_attribution_outbox_attributed_generation_check check (
    state <> 'attributed' or applied_generation = desired_generation
  ),
  constraint learning_attribution_outbox_error_class_check check (
    last_error_class is null
    or last_error_class in ('transient', 'invalid_hint', 'missing_user', 'max_attempts')
  )
);

create index if not exists learning_attribution_outbox_claim_idx
  on learning_attribution_outbox (state, available_at, created_at);

create index if not exists learning_attribution_outbox_processing_lease_idx
  on learning_attribution_outbox (locked_at)
  where state = 'processing';
