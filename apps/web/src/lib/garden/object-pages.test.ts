import { describe, expect, it } from "vitest";

import {
  gardenObjectSectionPath,
  isObjectId,
  legacyObjectAnchorLocation,
} from "./object-pages";

const OBJECT = "10000000-0000-4000-8000-000000000001";

describe("an owned object's pages (OVE-491)", () => {
  it("writes one address per page", () => {
    expect(gardenObjectSectionPath(OBJECT)).toBe(`/garden/objects/${OBJECT}`);
    expect(gardenObjectSectionPath(OBJECT, "settings")).toBe(
      `/garden/objects/${OBJECT}/settings`,
    );
    expect(gardenObjectSectionPath(OBJECT, "provenance", "x")).toBe(
      `/garden/objects/${OBJECT}/provenance#x`,
    );
    expect(isObjectId(OBJECT)).toBe(true);
    expect(isObjectId("object-1")).toBe(false);
    expect(isObjectId(undefined)).toBe(false);
  });

  it("sends an old fragment to the page that now holds its block", () => {
    const at = (hash: string) => legacyObjectAnchorLocation(OBJECT, hash);
    expect(at("#passport-catalog")).toBe(
      `/garden/objects/${OBJECT}/settings#passport-catalog`,
    );
    expect(at("#passport-privacy")).toBe(
      `/garden/objects/${OBJECT}/settings#passport-privacy`,
    );
    expect(at("#passport-management")).toBe(
      `/garden/objects/${OBJECT}/settings#passport-management`,
    );
    expect(at("#passport-provenance")).toBe(
      `/garden/objects/${OBJECT}/provenance#passport-provenance`,
    );
    // Blocks that stay on the history page stay where they are.
    for (const hash of [
      "",
      "#follow-up-composer",
      "#passport-timeline",
      "#passport-entry-e1",
      "#constructor",
      "#toString",
    ])
      expect(at(hash)).toBeNull();
  });
});
