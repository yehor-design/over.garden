-- OVE-231: versioned, generation-fenced launch media quality receipts.
-- Existing rows intentionally remain legacy-unassessed (NULL receipt).

alter table media_assets
  add column if not exists quality_policy_version text,
  add column if not exists quality_class text,
  add column if not exists quality_reason_codes text[],
  add column if not exists quality_metrics jsonb,
  add column if not exists quality_evaluated_at timestamptz;

create index if not exists media_assets_quality_inventory_idx
  on media_assets (quality_policy_version, quality_class)
  where quality_policy_version is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'media_assets_quality_receipt_shape_check'
      and conrelid = 'media_assets'::regclass
  ) then
    alter table media_assets add constraint media_assets_quality_receipt_shape_check
      check (
        (
          quality_policy_version is null
          and quality_class is null
          and quality_reason_codes is null
          and quality_metrics is null
          and quality_evaluated_at is null
        )
        or (
          quality_policy_version = 'ove231.launch-media-quality.v1'
          and quality_class in ('accepted', 'review_required', 'rejected')
          and quality_reason_codes is not null
          and cardinality(quality_reason_codes) between 1 and 8
          and quality_metrics is not null
          and jsonb_typeof(quality_metrics) = 'object'
          and quality_evaluated_at is not null
        )
      );
  end if;
end $$;
