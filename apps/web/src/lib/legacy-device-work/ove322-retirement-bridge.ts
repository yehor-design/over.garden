"use client";

import { eraseCurrentDeviceOwnerOfflineStore } from "@/lib/offline/owner-session-lifecycle";
import { fetchAuthenticatedOwnerVaultBinding } from "@/lib/offline/owner-vault";

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

export async function eraseLegacyOwnerDeviceWork(
  ownerUserId: string,
  ownerVaultBinding: string,
) {
  return eraseCurrentDeviceOwnerOfflineStore(ownerUserId, ownerVaultBinding);
}
