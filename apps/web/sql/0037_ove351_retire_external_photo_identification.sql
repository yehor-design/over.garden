-- OVE-351: retire the empty external photo-identification persistence
-- contract. The application cutover must land before production applies this
-- migration. No plant object, catalog item, journal, media, lineage, analytics,
-- or source-registry row is selected or mutated here.

set local lock_timeout = '5s';
set local statement_timeout = '20s';

do $$
declare
  present_table_count integer;
  remaining_row_count bigint;
begin
  if not pg_try_advisory_xact_lock(
    hashtextextended('overgarden:ove351:external-photo-identification-retirement', 0)
  ) then
    raise exception 'ove351_retirement_lock_unavailable'
      using errcode = 'lock_not_available';
  end if;

  select count(*)::integer
  into present_table_count
  from unnest(array[
    'plant_identification_requests',
    'plant_identification_candidates',
    'plant_identification_decisions',
    'plant_identification_submission_slots'
  ]::text[]) as retired_table(table_name)
  where to_regclass('public.' || retired_table.table_name) is not null;

  if present_table_count not in (0, 4) then
    raise exception 'ove351_retirement_schema_drift: expected zero or four tables, found %',
      present_table_count
      using errcode = 'check_violation';
  end if;

  if present_table_count = 4 then
    lock table
      plant_identification_decisions,
      plant_identification_candidates,
      plant_identification_submission_slots,
      plant_identification_requests
    in access exclusive mode;

    select
      (select count(*) from plant_identification_requests)
      + (select count(*) from plant_identification_candidates)
      + (select count(*) from plant_identification_decisions)
      + (select count(*) from plant_identification_submission_slots where request_id is not null)
    into remaining_row_count;

    if remaining_row_count <> 0 then
      raise exception 'ove351_retirement_blocked_nonzero: % owned or occupied rows remain',
        remaining_row_count
        using errcode = 'check_violation';
    end if;

    select count(*)
    into remaining_row_count
    from plant_identification_submission_slots;
    if remaining_row_count <> 4 then
      raise exception 'ove351_retirement_slot_drift: expected four empty slots, found %',
        remaining_row_count
        using errcode = 'check_violation';
    end if;
  end if;
end $$;

drop table if exists plant_identification_decisions;
drop table if exists plant_identification_candidates;
drop table if exists plant_identification_submission_slots;
drop table if exists plant_identification_requests;
