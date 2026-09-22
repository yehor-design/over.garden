import { describe, expect, it } from "vitest";

import {
  InvalidObjectSetupRequest,
  gardenObjectWritePath,
  normalizeObjectSetupReturnTo,
  parseObjectSetupRequest,
} from "./object-setup";

const base = {
  requestId: "0b8f0f3e-3f5e-4c2a-9a3d-7a1f2b3c4d5e",
  objectKind: "plant",
  displayName: "  Томат   Черокі ",
  spaceId: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  catalogItemId: null,
  catalogLabel: null,
};

describe("the object setup contract (OVE-485)", () => {
  it("normalizes the name and keeps the request id as the object id", () => {
    const parsed = parseObjectSetupRequest(base);
    expect(parsed).toEqual({
      ok: true,
      input: {
        requestId: base.requestId,
        objectKind: "plant",
        displayName: "Томат Черокі",
        spaceId: base.spaceId,
        catalogItemId: null,
        catalogLabel: null,
        allowDuplicateName: false,
      },
    });
  });

  it("answers field problems as errors, in the order the flow asks", () => {
    expect(
      parseObjectSetupRequest({ ...base, displayName: " ", spaceId: null }),
    ).toEqual({
      ok: false,
      errors: { name: "name_required", space: "space_required" },
    });
    expect(
      parseObjectSetupRequest({ ...base, displayName: "я".repeat(121) }),
    ).toEqual({ ok: false, errors: { name: "name_too_long" } });
  });

  it("keeps an own label only when nothing is linked", () => {
    const own = parseObjectSetupRequest({ ...base, catalogLabel: "Бабусин" });
    expect(own.ok && own.input.catalogLabel).toBe("Бабусин");
    const linked = parseObjectSetupRequest({
      ...base,
      catalogItemId: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
      catalogLabel: "Бабусин",
    });
    expect(linked.ok && linked.input.catalogLabel).toBeNull();
  });

  it("refuses a malformed request outright", () => {
    for (const bad of [
      null,
      [],
      { ...base, requestId: "nope" },
      { ...base, objectKind: "mineral" },
      { ...base, catalogItemId: "not-a-uuid" },
      { ...base, displayName: 7 },
    ]) {
      expect(() => parseObjectSetupRequest(bad)).toThrow(
        InvalidObjectSetupRequest,
      );
    }
  });

  it("hands an id back only to a workspace path", () => {
    expect(normalizeObjectSetupReturnTo("/garden?x=1")).toBe("/garden?x=1");
    expect(normalizeObjectSetupReturnTo("/garden/objects/new")).toBe(
      "/garden/objects/new",
    );
    expect(normalizeObjectSetupReturnTo("https://evil.test/garden")).toBeNull();
    expect(normalizeObjectSetupReturnTo("/journals")).toBeNull();
    expect(normalizeObjectSetupReturnTo(undefined)).toBeNull();
  });

  it("writes the first entry from the object's own page", () => {
    expect(gardenObjectWritePath("abc")).toBe(
      "/garden/objects/abc#follow-up-composer",
    );
  });
});
