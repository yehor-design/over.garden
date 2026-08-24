-- OVE-349 — contract the retired server-draft and legacy media-processing
-- schema after the application cutover and the separately approved production
-- cleanup have both proved a zero legacy state.
--
-- This migration intentionally contains no content cleanup. It fails closed
-- unless every remaining journal is public and every remaining media row is a
-- final derivative attached to a public journal. The task-owned operator
-- command performs the digest-bound test-data deletion before this migration.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  legacy_count bigint;
begin
  if to_regclass('public.journal_entry_drafts') is not null then
    execute 'select count(*) from journal_entry_drafts' into legacy_count;
    if legacy_count <> 0 then
      raise exception 'ove349_contract_blocked: journal drafts remain (%)', legacy_count
        using errcode = 'check_violation';
    end if;
  end if;

  select count(*) into legacy_count
  from journal_entries
  where visibility <> 'public';
  if legacy_count <> 0 then
    raise exception 'ove349_contract_blocked: non-public journals remain (%)', legacy_count
      using errcode = 'check_violation';
  end if;

  select count(*) into legacy_count
  from media_assets
  where journal_entry_id is null;
  if legacy_count <> 0 then
    raise exception 'ove349_contract_blocked: unattached media remain (%)', legacy_count
      using errcode = 'check_violation';
  end if;

  select count(*) into legacy_count
  from media_assets media
  left join journal_entries journal
    on journal.id = media.journal_entry_id
   and journal.owner_user_id = media.owner_user_id
  where journal.id is null
     or journal.visibility <> 'public'
     or media.derivative_key is null;
  if legacy_count <> 0 then
    raise exception 'ove349_contract_blocked: non-final or non-public media remain (%)', legacy_count
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'media_assets'
      and column_name = 'processing_claim_token'
  ) then
    execute $gate$
      select count(*)
      from media_assets
      where processing_claim_token is not null
         or processing_claimed_at is not null
    $gate$ into legacy_count;
    if legacy_count <> 0 then
      raise exception 'ove349_contract_blocked: media processing claims remain (%)', legacy_count
        using errcode = 'check_violation';
    end if;
  end if;

  select count(*) into legacy_count
  from job_queue
  where status in ('pending', 'processing', 'failed')
    and (
      payload->>'kind' = 'media_quarantine_expire'
      or idempotency_key like 'media_quarantine_expire:%'
    );
  if legacy_count <> 0 then
    raise exception 'ove349_contract_blocked: legacy media jobs remain (%)', legacy_count
      using errcode = 'check_violation';
  end if;
end $$;

drop trigger if exists media_assets_inline_limit_trg on media_assets;

create or replace function enforce_journal_entry_inline_media_limit()
returns trigger
language plpgsql
as $$
declare
  attached_count integer;
begin
  if coalesce(new.usage_role, 'inline') = 'cover_only' then
    return new;
  end if;

  select count(*)::integer
  into attached_count
  from media_assets
  where journal_entry_id = new.journal_entry_id
    and coalesce(usage_role, 'inline') = 'inline'
    and id is distinct from new.id;

  if attached_count >= 10 then
    raise exception 'journal entry may attach at most 10 inline media assets'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger media_assets_inline_limit_trg
  before insert or update of journal_entry_id, usage_role
  on media_assets
  for each row
  execute function enforce_journal_entry_inline_media_limit();

drop index if exists media_assets_one_cover_only_per_entry_uidx;
create unique index media_assets_one_cover_only_per_entry_uidx
  on media_assets (journal_entry_id)
  where usage_role = 'cover_only';

drop index if exists media_assets_upload_generation_id_uidx;
drop index if exists media_assets_public_object_id_uidx;
drop index if exists media_assets_processing_claim_idx;
drop index if exists media_assets_quality_inventory_idx;
drop index if exists media_assets_quarantine_expire_idx;

alter table media_assets
  drop constraint if exists media_assets_quarantine_key_key,
  drop constraint if exists media_assets_status_check,
  drop constraint if exists media_assets_media_type_check,
  drop constraint if exists media_assets_readiness_state_check,
  drop constraint if exists media_assets_safe_generation_shape_check,
  drop constraint if exists media_assets_safe_readiness_shape_check,
  drop constraint if exists media_assets_quality_receipt_shape_check;

alter table media_assets
  drop column if exists quarantine_key,
  drop column if exists status,
  drop column if exists original_deleted_at,
  drop column if exists declared_media_type,
  drop column if exists admitted_media_type,
  drop column if exists media_readiness_state,
  drop column if exists processing_claim_token,
  drop column if exists processing_claimed_at,
  drop column if exists upload_generation_id,
  drop column if exists public_object_id,
  drop column if exists quality_policy_version,
  drop column if exists quality_class,
  drop column if exists quality_reason_codes,
  drop column if exists quality_metrics,
  drop column if exists quality_evaluated_at;

alter table media_assets
  alter column journal_entry_id set not null,
  alter column derivative_key set not null;

alter table journal_entries
  alter column visibility set default 'public',
  drop constraint if exists journal_entries_visibility_check;

alter table journal_entries
  add constraint journal_entries_visibility_check
  check (visibility = 'public');

drop table if exists journal_entry_drafts;

commit;
