-- OVE-314: retire product-access pilot grants and converge learning attribution
-- onto self-serve users plus explicit synthetic producer classes.

alter table admin_role_audit_log
  drop constraint if exists admin_role_audit_log_reason_check;

update admin_role_audit_log
set reason = 'operator_delegation'
where reason = 'pilot_operator_delegation';

alter table admin_role_audit_log
  add constraint admin_role_audit_log_reason_check
    check (
      reason in (
        'manual_owner_grant',
        'operator_delegation',
        'temporary_coverage',
        'role_cleanup',
        'access_revoked'
      )
    );

alter table erasure_requests
  alter column intake_disclosure_version
  set default 'erasure-request-mvp-v1';

update learning_actor_attributions
set actor_class = case actor_class
      when 'real_closed_pilot' then 'real_self_serve'
      when 'founder_rehearsal' then 'production_smoke'
      else actor_class
    end,
    source = case
      when actor_class = 'founder_rehearsal' then 'operator_plan'
      when actor_class = 'production_smoke' then 'operator_plan'
      when source = 'pilot_grant' then 'self_serve_default'
      else source
    end,
    classified_at = now(),
    updated_at = now()
where actor_class in ('real_closed_pilot', 'founder_rehearsal')
   or source = 'pilot_grant';

-- Preserve users represented only by the retired grant table. Existing
-- explicit producer classifications win; the grant is used only to fill a
-- missing durable attribution before the table is removed.
do $$
begin
  if to_regclass('public.pilot_invite_grants') is not null then
    execute $statement$
      insert into learning_actor_attributions (
        user_id,
        actor_class,
        source,
        classified_at,
        created_at,
        updated_at
      )
      select
        grants.user_id,
        case grants.cohort
          when 'founder_rehearsal' then 'production_smoke'
          else 'real_self_serve'
        end,
        case grants.cohort
          when 'founder_rehearsal' then 'operator_plan'
          else 'self_serve_default'
        end,
        now(),
        now(),
        now()
      from public.pilot_invite_grants as grants
      join public."user" as auth_user
        on auth_user.id = grants.user_id
      on conflict (user_id) do nothing
    $statement$;
  end if;
end $$;

update analytics_events
set properties = jsonb_set(
      coalesce(properties, '{}'::jsonb),
      '{actor_class}',
      to_jsonb(
        case properties ->> 'actor_class'
          when 'self_serve' then 'real_self_serve'
          when 'closed_pilot' then 'real_self_serve'
          when 'real_closed_pilot' then 'real_self_serve'
          when 'founder_rehearsal' then 'production_smoke'
          when 'editorial' then 'editorial_seed'
          else properties ->> 'actor_class'
        end
      ),
      true
    ),
    updated_at = now()
where properties ->> 'actor_class' in (
  'self_serve',
  'closed_pilot',
  'real_closed_pilot',
  'founder_rehearsal',
  'editorial'
);

update analytics_events
set properties = case
      when properties ->> 'source_surface_kind' = 'invite' then
        jsonb_set(
          jsonb_set(properties, '{activation_source}', '"direct_garden"'::jsonb, true),
          '{source_surface_kind}',
          '"garden"'::jsonb,
          true
        )
      else
        jsonb_set(properties, '{activation_source}', '"direct_garden"'::jsonb, true)
    end,
    updated_at = now()
where properties ->> 'activation_source' = 'invited_cohort'
   or properties ->> 'source_surface_kind' = 'invite';

alter table learning_actor_attributions
  drop constraint if exists learning_actor_attributions_actor_class_check,
  drop constraint if exists learning_actor_attributions_source_check;

alter table learning_actor_attributions
  add constraint learning_actor_attributions_actor_class_check
    check (
      actor_class in (
        'real_self_serve',
        'production_smoke',
        'visual_fixture',
        'editorial_seed',
        'automated_bot'
      )
    ),
  add constraint learning_actor_attributions_source_check
    check (source in ('producer', 'operator_plan', 'self_serve_default'));

update learning_attribution_outbox
set state = 'pending',
    attempts = 0,
    available_at = now(),
    locked_at = null,
    locked_by = null,
    terminalized_at = null,
    last_error_class = null,
    updated_at = now()
where last_error_class = 'invalid_hint';

alter table learning_attribution_outbox
  drop constraint if exists learning_attribution_outbox_hint_pair_check,
  drop constraint if exists learning_attribution_outbox_error_class_check,
  drop column if exists cohort,
  drop column if exists segment;

alter table learning_attribution_outbox
  add constraint learning_attribution_outbox_error_class_check
    check (
      last_error_class is null
      or last_error_class in ('transient', 'missing_user', 'max_attempts')
    );

drop table if exists public.pilot_invite_grants;
