import "server-only";

import { after } from "next/server";

import { drainLearningAttributionOutbox } from "@/server/mvp-learning/attribution-outbox";

/**
 * Best-effort immediate convergence after a response. The transactionally
 * durable outbox and protected Cron route remain the recovery authority.
 */
export function scheduleLearningAttributionDrain(
  beforeDrain?: () => Promise<void>,
): void {
  after(async () => {
    try {
      await beforeDrain?.();
    } catch {
      // Analytics is best effort too. Continue to the attribution consumer so
      // future event writes inherit the durable class rather than a fallback.
    }
    try {
      await drainLearningAttributionOutbox();
    } catch {
      // Do not surface post-response attribution failures to a gardener or log
      // request-derived data. The leased Cron retry remains responsible.
    }
  });
}
