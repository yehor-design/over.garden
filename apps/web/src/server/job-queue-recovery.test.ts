import { describe, expect, it } from "vitest";

import {
  expectedQueueReplayApprovalText,
} from "./job-queue-recovery";

describe("job queue recovery contracts", () => {
  it("uses a request-specific maintainer replay phrase", () => {
    expect(
      expectedQueueReplayApprovalText("00000000-0000-4000-8000-00000000abcd"),
    ).toBe("APPROVE job-00000000 QUEUE REPLAY");
  });
});
