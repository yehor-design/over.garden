import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { deterministicLaunchCorpusUuid } from "./apply";

describe("OVE-199 launch corpus apply identity", () => {
  it("derives stable UUIDs without collisions across slot and media keys", () => {
    const first = deterministicLaunchCorpusUuid("pack:entry:UA-J01");
    const replay = deterministicLaunchCorpusUuid("pack:entry:UA-J01");
    const sibling = deterministicLaunchCorpusUuid("pack:entry:BG-J01");

    expect(first).toBe(replay);
    expect(first).not.toBe(sibling);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
