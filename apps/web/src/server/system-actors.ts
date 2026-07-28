/**
 * Non-human Better Auth identity retained for ON DELETE RESTRICT moderation
 * references after an account erasure. It must never receive a public profile
 * or handle and is excluded from human-account identity reconciliation.
 */
export const ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID =
  "00000000-0000-4000-8000-00000000ead1";
