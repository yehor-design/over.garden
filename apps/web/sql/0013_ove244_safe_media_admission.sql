-- OVE-244: generation-fenced media admission and owner-independent public identity.
-- Existing rows deliberately remain legacy_non_ready until a bounded reconciliation.

alter table media_assets
  add column if not exists upload_generation_id uuid,
  add column if not exists public_object_id uuid,
  add column if not exists upload_generation integer,
  add column if not exists declared_media_type text,
  add column if not exists declared_size_bytes bigint,
  add column if not exists admitted_media_type text,
  add column if not exists processing_claim_token uuid,
  add column if not exists processing_claimed_at timestamptz,
  add column if not exists media_readiness_state text not null default 'legacy_non_ready';

create unique index if not exists media_assets_upload_generation_id_uidx
  on media_assets (upload_generation_id)
  where upload_generation_id is not null;

create unique index if not exists media_assets_public_object_id_uidx
  on media_assets (public_object_id)
  where public_object_id is not null;

create index if not exists media_assets_processing_claim_idx
  on media_assets (media_readiness_state, processing_claimed_at)
  where media_readiness_state = 'processing';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'media_assets_upload_generation_positive_check'
      and conrelid = 'media_assets'::regclass
  ) then
    alter table media_assets add constraint media_assets_upload_generation_positive_check
      check (upload_generation is null or upload_generation > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'media_assets_declared_size_check'
      and conrelid = 'media_assets'::regclass
  ) then
    alter table media_assets add constraint media_assets_declared_size_check
      check (declared_size_bytes is null or declared_size_bytes between 1 and 12582912);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'media_assets_media_type_check'
      and conrelid = 'media_assets'::regclass
  ) then
    alter table media_assets add constraint media_assets_media_type_check
      check (
        (declared_media_type is null or declared_media_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic'))
        and (admitted_media_type is null or admitted_media_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic'))
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'media_assets_readiness_state_check'
      and conrelid = 'media_assets'::regclass
  ) then
    alter table media_assets add constraint media_assets_readiness_state_check
      check (media_readiness_state in (
        'legacy_non_ready', 'quarantined', 'processing', 'derivative_written',
        'public_ready', 'retryable', 'rejected', 'invalidated'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'media_assets_safe_generation_shape_check'
      and conrelid = 'media_assets'::regclass
  ) then
    alter table media_assets add constraint media_assets_safe_generation_shape_check
      check (
        media_readiness_state = 'legacy_non_ready'
        or (
          upload_generation_id is not null
          and public_object_id is not null
          and upload_generation is not null
          and declared_media_type is not null
          and declared_size_bytes is not null
        )
      );
  end if;

  -- The constraint below reads `original_deleted_at`, which
  -- `0038_ove349_retire_legacy_journal_media.sql` drops. Migrations re-apply
  -- from 0001 on every bootstrap, so on a database past 0038 this ran again
  -- against a column that no longer exists and failed, taking every later
  -- migration with it. `0036_ove347_atomic_journal_create.sql` supersedes this
  -- constraint anyway; the column check keeps the fresh-database path
  -- untouched and skips it once the column is gone.
  if not exists (
    select 1 from pg_constraint
    where conname = 'media_assets_safe_readiness_shape_check'
      and conrelid = 'media_assets'::regclass
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'media_assets'
      and column_name = 'original_deleted_at'
  ) then
    alter table media_assets add constraint media_assets_safe_readiness_shape_check
      check (
        media_readiness_state = 'legacy_non_ready'
        or (
          media_readiness_state = 'quarantined'
          and processing_claim_token is null
          and processing_claimed_at is null
          and derivative_key is null
          and admitted_media_type is null
          and original_deleted_at is null
          and status = 'quarantined'
        )
        or (
          media_readiness_state = 'processing'
          and processing_claim_token is not null
          and processing_claimed_at is not null
          and derivative_key is null
          and admitted_media_type is null
          and original_deleted_at is null
          and status = 'quarantined'
        )
        or (
          media_readiness_state = 'derivative_written'
          and derivative_key is not null
          and admitted_media_type is not null
          and original_deleted_at is null
          and status = 'quarantined'
        )
        or (
          media_readiness_state = 'retryable'
          and processing_claim_token is null
          and processing_claimed_at is null
          and derivative_key is null
          and admitted_media_type is null
          and original_deleted_at is null
          and status = 'quarantined'
        )
        or (
          media_readiness_state = 'public_ready'
          and derivative_key is not null
          and admitted_media_type = declared_media_type
          and original_deleted_at is not null
          and processing_claim_token is null
          and processing_claimed_at is null
          and status = 'processed'
          and derivative_key = 'derivatives/' || public_object_id::text || '.webp'
        )
        or media_readiness_state in ('rejected', 'invalidated')
      );
  end if;
end $$;
