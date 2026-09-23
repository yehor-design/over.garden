import { describe, expect, it } from "vitest";

import {
  gardenSpaceAddObjectHref,
  gardenSpacePath,
  gardenSpaceSettingsPath,
  gardenSpaceWriteHref,
  isSpaceId,
  legacySpaceJournalLocation,
  normalizeSpacePageRequest,
  spaceIsDeletable,
} from "./space-page";

const SPACE = "10000000-0000-4000-8000-000000000001";

describe("a space's own page (OVE-490)", () => {
  it("reads a closed view and a bounded page, and pages only a full view", () => {
    expect(normalizeSpacePageRequest({})).toEqual({
      view: "overview",
      page: 1,
    });
    expect(normalizeSpacePageRequest({ view: "history", page: "3" })).toEqual({
      view: "history",
      page: 3,
    });
    expect(normalizeSpacePageRequest({ view: "overview", page: "3" })).toEqual({
      view: "overview",
      page: 1,
    });
    expect(normalizeSpacePageRequest({ view: "settings" }).view).toBe(
      "overview",
    );
    for (const page of ["0", "-1", "x", "1.5"]) {
      expect(normalizeSpacePageRequest({ view: "objects", page }).page).toBe(1);
    }
    expect(isSpaceId(SPACE)).toBe(true);
    expect(isSpaceId("not-a-uuid")).toBe(false);
  });

  it("writes one address per view and keeps the way back on every action", () => {
    expect(gardenSpacePath(SPACE)).toBe(`/garden/spaces/${SPACE}`);
    expect(gardenSpacePath(SPACE, { view: "history", page: 2 })).toBe(
      `/garden/spaces/${SPACE}?view=history&page=2`,
    );
    expect(gardenSpacePath(SPACE, { view: "overview", page: 4 }, "x")).toBe(
      `/garden/spaces/${SPACE}#x`,
    );
    expect(gardenSpaceSettingsPath(SPACE)).toBe(
      `/garden/spaces/${SPACE}/settings`,
    );
    const write = new URL(gardenSpaceWriteHref(SPACE), "https://over.garden");
    expect(write.pathname).toBe("/garden/new");
    expect(write.searchParams.get("space")).toBe(SPACE);
    expect(write.searchParams.get("returnTo")).toBe(
      `/garden/spaces/${SPACE}#space-history`,
    );
    const add = new URL(gardenSpaceAddObjectHref(SPACE), "https://over.garden");
    expect(add.pathname).toBe("/garden/objects/new");
    expect(add.searchParams.get("space")).toBe(SPACE);
  });

  it("sends the garden page's old space journal to the space's page", () => {
    const at = (value: string) =>
      legacySpaceJournalLocation(new URL(value, "https://over.garden"));
    expect(at(`/garden?space=${SPACE}`)).toBe(`/garden/spaces/${SPACE}`);
    expect(at(`/garden?space=${SPACE.toUpperCase()}&q=x`)).toBe(
      `/garden/spaces/${SPACE}`,
    );
    expect(at(`/garden?space=${SPACE}&saveProgress=space-entry`)).toBe(
      `/garden/spaces/${SPACE}?saveProgress=space-entry`,
    );
    expect(at("/garden?space=not-a-uuid")).toBeNull();
    expect(at("/garden?q=tomato")).toBeNull();
    expect(at(`/garden/new?space=${SPACE}`)).toBeNull();
  });

  it("deletes a space only when nothing hangs from it", () => {
    expect(spaceIsDeletable({ objectCount: 0, entryCount: 0 })).toBe(true);
    expect(spaceIsDeletable({ objectCount: 1, entryCount: 0 })).toBe(false);
    // An entry inside its seven-day window still counts.
    expect(spaceIsDeletable({ objectCount: 0, entryCount: 1 })).toBe(false);
  });
});
