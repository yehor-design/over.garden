"use client";

import { eraseCurrentDeviceOwnerOfflineStore } from "@/lib/offline/owner-session-lifecycle";
import { fetchAuthenticatedOwnerVaultBinding } from "@/lib/offline/owner-vault";

export type {
  FirstEntryDraftPayload,
  FollowUpEntryDraftPayload,
  JournalDraftPayload,
  JournalDraftRecord,
  SpaceEntryDraftPayload,
} from "@/lib/offline/drafts";
export {
  fingerprintOwnerVaultPayload,
  OwnerComposerDurabilityUnconfirmedError,
} from "@/lib/offline/owner-composer-durability";
export type {
  OfflineComposerDurabilityRecord,
  OfflineDraftRecord,
  OfflineDraftSummary,
  OfflineJournalEntryPayload,
  OfflineMutation,
  OfflineMutationSummary,
  OfflineOwnerActivity,
  OfflinePhotoIntent,
} from "@/lib/offline/queue";
export {
  abandonOwnerVaultExclusiveFence,
  acquireOwnerVaultExclusiveFence,
  finalizeOwnerVaultExclusiveFence,
  hasOwnerVaultBinding,
  OwnerVaultControlDb,
  OwnerVaultDb,
  waitForOwnerVaultWritersToSettle,
} from "@/lib/offline/owner-vault";
export type { OwnerVaultRowCounts } from "@/lib/offline/owner-vault";
export {
  buildJournalEntryRequestBodyForSync,
  journalEntryAuthReturnTo,
} from "@/lib/offline/journal-entry-sync";

/**
 * The sole temporary import boundary into the retired device-work runtime.
 * Ordinary journal and shell code must never import legacy modules directly.
 * OVE-322 owns migration and deletion of pre-cutover records; the existing
 * explicit account-erasure action remains routed here until that closeout.
 */
export async function resolveLegacyOwnerVaultBinding(
  sessionGeneration: string,
) {
  return fetchAuthenticatedOwnerVaultBinding(sessionGeneration);
}

export { fetchAuthenticatedOwnerVaultBinding };

export async function eraseLegacyOwnerDeviceWork(
  ownerUserId: string,
  ownerVaultBinding: string,
) {
  return eraseCurrentDeviceOwnerOfflineStore(ownerUserId, ownerVaultBinding);
}
