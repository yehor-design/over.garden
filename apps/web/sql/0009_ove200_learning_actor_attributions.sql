-- OVE-200: durable learning actor/evidence attribution + analytics event allowlist.
-- Additive. Safe to re-run. Does not invent identities; producers/plan set classes.

create table if not exists learning_actor_attributions (
  user_id uuid primary key references "user"(id) on delete cascade,
  actor_class text not null,
  source text not null,
  classified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_actor_attributions_actor_class_check'
      and conrelid = 'learning_actor_attributions'::regclass
  ) then
    alter table learning_actor_attributions
      add constraint learning_actor_attributions_actor_class_check
      check (
        actor_class in (
          'real_self_serve',
          'real_closed_pilot',
          'founder_rehearsal',
          'production_smoke',
          'visual_fixture',
          'editorial_seed',
          'automated_bot'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_actor_attributions_source_check'
      and conrelid = 'learning_actor_attributions'::regclass
  ) then
    alter table learning_actor_attributions
      add constraint learning_actor_attributions_source_check
      check (
        source in (
          'pilot_grant',
          'producer',
          'operator_plan',
          'self_serve_default'
        )
      );
  end if;
end $$;

create index if not exists learning_actor_attributions_class_idx
  on learning_actor_attributions (actor_class, classified_at desc);

-- Expand analytics event_name allowlist for cover/reorder measurement.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'analytics_events_event_name_check'
      and conrelid = 'analytics_events'::regclass
  ) then
    alter table analytics_events
      drop constraint analytics_events_event_name_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'analytics_events_event_name_check'
      and conrelid = 'analytics_events'::regclass
  ) then
    alter table analytics_events
      add constraint analytics_events_event_name_check
      check (
        event_name in (
          'activation_started',
          'space_created',
          'object_created',
          'entry_logged',
          'entry_photo_attached',
          'offline_entry_queued',
          'offline_entry_synced',
          'progress_screen_shown',
          'own_record_revisited',
          'follow_up_value_pulse',
          'journal_blocks_reordered',
          'journal_cover_changed'
        )
      );
  end if;
end $$;
