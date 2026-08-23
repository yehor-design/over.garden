-- OVE-347 — additive atomic journal-create media and finalize-job contract.
--
-- Existing rows remain readable and unchanged. Rollback may restore the prior
-- checks only after confirming no OVE-347 rows exceed 12 MiB and no derivative
-- uses the generation path; committed public journal rows are product data and
-- are never deleted as part of a code rollback.

alter table media_assets
  drop constraint if exists media_assets_declared_size_check;

alter table media_assets
  add constraint media_assets_declared_size_check
  check (declared_size_bytes is null or declared_size_bytes between 1 and 33554432);

alter table media_assets
  drop constraint if exists media_assets_safe_readiness_shape_check;

alter table media_assets
  add constraint media_assets_safe_readiness_shape_check
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
      and (
        derivative_key = 'derivatives/' || public_object_id::text || '.webp'
        or derivative_key = 'derivatives/' || id::text || '/' || upload_generation::text || '.webp'
      )
    )
    or media_readiness_state in ('rejected', 'invalidated')
  );

alter table job_queue
  drop constraint if exists job_queue_media_staging_finalize_payload_check;

alter table job_queue
  add constraint job_queue_media_staging_finalize_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'media_staging_finalize'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ?& array[
        'kind', 'publishId', 'stagingSessionId', 'receiptSetDigest'
      ]::text[]
      and payload - array[
        'kind', 'publishId', 'stagingSessionId', 'receiptSetDigest'
      ]::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and jsonb_typeof(payload->'publishId') = 'string'
      and jsonb_typeof(payload->'stagingSessionId') = 'string'
      and jsonb_typeof(payload->'receiptSetDigest') = 'string'
      and payload->>'kind' = 'media_staging_finalize'
      and payload->>'publishId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and payload->>'stagingSessionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and payload->>'receiptSetDigest' ~ '^[A-Za-z0-9_-]{43}$'
    )
  ) not valid;
