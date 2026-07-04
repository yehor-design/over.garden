import { describe, expect, it } from "vitest";

import {
  buildSaveProgressMomentCopy,
  buildSaveProgressReadbackUrl,
  normalizeSaveProgressMomentKind,
  saveProgressPercent,
} from "./save-progress-moment";

describe("save progress moment helpers", () => {
  it("marks first-entry readback URLs while preserving existing query state", () => {
    expect(
      buildSaveProgressReadbackUrl(
        "/garden/objects/object-1?source=public-variety",
        "first-entry",
      ),
    ).toBe(
      "/garden/objects/object-1?source=public-variety&saveProgress=first-entry",
    );
  });

  it("normalizes only supported post-save moment kinds", () => {
    expect(normalizeSaveProgressMomentKind("first-entry")).toBe("first-entry");
    expect(normalizeSaveProgressMomentKind(["follow-up"])).toBe("follow-up");
    expect(normalizeSaveProgressMomentKind("leaderboard")).toBeNull();
    expect(normalizeSaveProgressMomentKind(undefined)).toBeNull();
  });

  it("builds local, object-specific copy without social pressure", () => {
    const copy = buildSaveProgressMomentCopy({
      kind: "follow-up",
      objectName: "Balcony tomato",
      entryCount: 2,
    });
    const serialized = JSON.stringify(copy);

    expect(copy.title).toBe("This record is getting useful");
    expect(copy.body).toContain("Balcony tomato");
    expect(copy.body).toContain("2 dated notes");
    expect(copy.progressPercent).toBe(50);
    expect(serialized).not.toMatch(
      /share|likes|followers|leaderboard|streak|public praise|feed/i,
    );
  });

  it("keeps progress bounded for compact readback layout", () => {
    expect(saveProgressPercent(0)).toBe(25);
    expect(saveProgressPercent(1)).toBe(25);
    expect(saveProgressPercent(2)).toBe(50);
    expect(saveProgressPercent(4)).toBe(100);
    expect(saveProgressPercent(20)).toBe(100);
  });
});
