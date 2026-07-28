import { PUBLIC_LAUNCH_SURFACE_POLICY_VERSION } from "@/server/launch-corpus/public-surface";

export interface PublicLaunchJournalCaller {
  id: string;
  module: string;
  minimumPolicyApplications: number;
}

/**
 * Machine-owned inventory of every module that projects journal-backed data
 * beyond its owner. The minimum is deliberately monotonic: adding a new public
 * query without applying the shared policy makes the inventory test fail.
 */
export const PUBLIC_LAUNCH_JOURNAL_CALLERS = [
  ["feed", "public-feed-repository.ts", 2],
  ["directory-query", "public-journal-directory-query.ts", 2],
  ["directory-repository", "public-journal-directory-repository.ts", 1],
  ["knowledge-evidence", "public-knowledge-evidence-repository.ts", 1],
  ["topics", "public-topic-repository.ts", 1],
  ["object-catalog", "public-object-catalog-repository.ts", 1],
  ["object-passport", "public-object-passport-repository.ts", 4],
  ["journal-readback", "journal-repository.ts", 10],
  ["profile", "public-profile-repository.ts", 8],
  ["lineage", "public-lineage-repository.ts", 3],
  ["variety", "public-variety-repository.ts", 3],
  ["social-readback", "social-readback-repository.ts", 2],
  ["community", "community-repository.ts", 8],
  ["engagement", "engagement-repository.ts", 4],
  ["mention-resolution", "journal-mention-repository.ts", 2],
] as const satisfies readonly (readonly [string, string, number])[];

export const PUBLIC_LAUNCH_JOURNAL_CALLER_RECEIPT = {
  policyVersion: PUBLIC_LAUNCH_SURFACE_POLICY_VERSION,
  callers: PUBLIC_LAUNCH_JOURNAL_CALLERS.map(
    ([id, module, minimumPolicyApplications]) => ({
      id,
      module,
      minimumPolicyApplications,
    }),
  ),
} as const;

export function assertPublicLaunchJournalCallerInventory(): void {
  const ids = new Set<string>();
  const modules = new Set<string>();
  for (const [id, module, minimumPolicyApplications] of
    PUBLIC_LAUNCH_JOURNAL_CALLERS) {
    if (ids.has(id) || modules.has(module) || minimumPolicyApplications < 1) {
      throw new Error("Public launch journal caller inventory is invalid.");
    }
    ids.add(id);
    modules.add(module);
  }
}
