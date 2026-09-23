import { LINEAGE_INVITATION_CLAIM_PATH } from "@/lib/lineage/claim-handoff";

/**
 * Whether the answer just given was stored (`done`) or refused (`stale`).
 * The page never takes the decision from here: it reads it back from the
 * record, and this only says whether to announce it (`OVE-495`).
 */
export type InvitationOutcome = "done" | "stale";

export function invitationOutcomePath(outcome: InvitationOutcome) {
  return `${LINEAGE_INVITATION_CLAIM_PATH}?${new URLSearchParams({ result: outcome })}`;
}

export function readInvitationOutcome(
  value: string | string[] | undefined,
): InvitationOutcome | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "done" || candidate === "stale" ? candidate : null;
}
