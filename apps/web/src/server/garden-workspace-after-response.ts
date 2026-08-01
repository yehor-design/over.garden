import "server-only";

import { after } from "next/server";

import { recordAnalyticsEventSafely } from "@/server/analytics-events";
import type { RequestScope } from "@/server/request-scope";

export function scheduleGardenWorkspaceActivationAnalytics(
  scope: RequestScope,
  input: Parameters<typeof recordAnalyticsEventSafely>[1],
): void {
  after(async () => {
    try {
      await recordAnalyticsEventSafely(scope, input);
    } catch {
      // Analytics must never delay or alter the authenticated workspace path.
    }
  });
}
