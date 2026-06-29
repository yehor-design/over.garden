import { describe, expect, it } from "vitest";

import {
  buildFollowUpValuePulseReadbackUrl,
  normalizeFollowUpUsefulness,
  normalizeFollowUpUsefulnessReason,
  normalizeFollowUpValuePulseOutcome,
} from "@/lib/garden/follow-up-value-pulse";

describe("follow-up value pulse helpers", () => {
  it("builds readback URLs with pulse query params", () => {
    expect(
      buildFollowUpValuePulseReadbackUrl(
        "/garden/objects/object-1",
        "00000000-0000-0000-0000-000000000011",
      ),
    ).toBe(
      "/garden/objects/object-1?valuePulse=1&entryId=00000000-0000-0000-0000-000000000011",
    );
  });

  it("accepts only bounded enum values", () => {
    expect(normalizeFollowUpValuePulseOutcome("skipped")).toBe("skipped");
    expect(normalizeFollowUpValuePulseOutcome("later")).toBeNull();
    expect(normalizeFollowUpUsefulness("useful")).toBe("useful");
    expect(normalizeFollowUpUsefulness("great")).toBeNull();
    expect(normalizeFollowUpUsefulnessReason("easy_to_add_update")).toBe(
      "easy_to_add_update",
    );
    expect(normalizeFollowUpUsefulnessReason("free text")).toBeNull();
  });
});
