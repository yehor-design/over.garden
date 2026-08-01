import type { PilotInviteCohort } from "@/lib/garden/pilot-invite";
import type { PilotSegment } from "@/lib/pilot/segments";

/**
 * Verified invite metadata carried only until the canonical write can enqueue
 * a durable attribution intent. It is never an authorization decision.
 */
export interface LearningAttributionHint {
  cohort: PilotInviteCohort;
  segment: PilotSegment;
}

export interface RequestScope {
  userId: string;
  sessionId?: string | null;
  learningAttributionHint?: LearningAttributionHint | null;
}

export function scopedToUser(
  userId: string,
  sessionId?: string | null,
): RequestScope {
  if (!userId) throw new Error("A scoped repository requires a user id.");
  return { userId, sessionId: sessionId ?? null };
}
