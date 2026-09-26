import { describe, expect, it } from "vitest";

import {
  InvalidObjectSetupRequest,
  gardenObjectWritePath,
  normalizeObjectSetupReturnTo,
  parseObjectSetupRequest,
} from "./object-setup";

const SPECIES = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";
const ENTRY = "3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b";

const base = {
  requestId: "0b8f0f3e-3f5e-4c2a-9a3d-7a1f2b3c4d5e",
  objectKind: "plant",
  displayName: "  Бабусині   помідори ",
  spaceId: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
};

describe("the object setup contract (OVE-485, OVE-524)", () => {
  it("normalizes the name, keeps the request id as the object id and knows nothing by default", () => {
    const parsed = parseObjectSetupRequest(base);
    expect(parsed).toEqual({
      ok: true,
      input: {
        requestId: base.requestId,
        objectKind: "plant",
        displayName: "Бабусині помідори",
        spaceId: base.spaceId,
        species: { kind: "unknown" },
        cultivar: { kind: "unknown" },
        photo: null,
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
    expect(
      parseObjectSetupRequest({
        ...base,
        species: { kind: "own", text: "  " },
      }),
    ).toEqual({ ok: false, errors: { species: "text_required" } });
    expect(
      parseObjectSetupRequest({
        ...base,
        species: { kind: "catalog", catalogItemId: SPECIES },
        cultivar: { kind: "new", name: "я".repeat(121) },
      }),
    ).toEqual({ ok: false, errors: { cultivar: "text_too_long" } });
  });

  it("stores the two choices as the gardener made them", () => {
    const catalog = parseObjectSetupRequest({
      ...base,
      species: { kind: "catalog", catalogItemId: SPECIES.toUpperCase() },
      cultivar: { kind: "entry", catalogItemId: ENTRY },
    });
    expect(catalog.ok && catalog.input.species).toEqual({
      kind: "catalog",
      catalogItemId: SPECIES,
    });
    expect(catalog.ok && catalog.input.cultivar).toEqual({
      kind: "entry",
      catalogItemId: ENTRY,
    });

    const added = parseObjectSetupRequest({
      ...base,
      objectKind: "animal",
      species: { kind: "catalog", catalogItemId: SPECIES },
      cultivar: { kind: "new", name: "  Брама " },
    });
    expect(added.ok && added.input.cultivar).toEqual({
      kind: "new",
      name: "Брама",
    });

    const own = parseObjectSetupRequest({
      ...base,
      species: { kind: "own", text: " Помідор   бабусин " },
      cultivar: { kind: "own", text: "Рожевий" },
    });
    expect(own.ok && own.input.species).toEqual({
      kind: "own",
      text: "Помідор бабусин",
    });
    expect(own.ok && own.input.cultivar).toEqual({
      kind: "own",
      text: "Рожевий",
    });
  });

  it("refuses a cultivar the flow cannot ask", () => {
    for (const bad of [
      // No species, no cultivar question.
      { ...base, cultivar: { kind: "new", name: "Брама" } },
      { ...base, cultivar: { kind: "entry", catalogItemId: ENTRY } },
      // A list entry is a catalogue species' list; an own text follows an own species.
      {
        ...base,
        species: { kind: "own", text: "Помідор" },
        cultivar: { kind: "entry", catalogItemId: ENTRY },
      },
      {
        ...base,
        species: { kind: "catalog", catalogItemId: SPECIES },
        cultivar: { kind: "own", text: "Рожевий" },
      },
    ]) {
      expect(() => parseObjectSetupRequest(bad)).toThrow(
        InvalidObjectSetupRequest,
      );
    }
  });

  it("refuses a malformed request outright", () => {
    for (const bad of [
      null,
      [],
      { ...base, requestId: "nope" },
      { ...base, objectKind: "mineral" },
      { ...base, species: { kind: "catalog", catalogItemId: "not-a-uuid" } },
      { ...base, species: { kind: "guess" } },
      { ...base, species: "tomato" },
      { ...base, displayName: 7 },
      { ...base, photo: { stagingSessionId: "x", extra: true } },
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
