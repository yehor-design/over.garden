import { describe, expect, it } from "vitest";
import { parseDestinationQuery } from "./owned-destination-repository";
import {
  destinationDetail,
  destinationJournalPath,
  type OwnedDestination,
} from "@/lib/garden/owned-destinations";

describe("owned destination boundaries", () => {
  it("normalizes search but rejects oversized queries, invalid kinds and cursor reuse", () => {
    expect(
      parseDestinationQuery(new URLSearchParams({ q: "  Томат  " })).q,
    ).toBe("Томат");
    // A space's own objects: the space implies the object filter, and a
    // malformed space is refused rather than widened to every object.
    const inSpace = parseDestinationQuery(
      new URLSearchParams({
        space: "1C2D3E4F-5A6B-4C7D-8E9F-0A1B2C3D4E5F",
        kind: "space",
      }),
    );
    expect(inSpace.filter).toBe("object");
    expect(inSpace.space).toBe("1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f");
    const invalid: Record<string, string>[] = [
      { q: "a".repeat(121) },
      { kind: "catalogue" },
      { space: "not-a-uuid" },
      { cursor: "not-json" },
      {
        cursor: Buffer.from(
          JSON.stringify({
            q: "other",
            filter: "all",
            kind: "object",
            id: "00000000-0000-4000-8000-000000000001",
          }),
        ).toString("base64url"),
      },
    ];
    for (const params of invalid)
      expect(() =>
        parseDestinationQuery(new URLSearchParams(params)),
      ).toThrow();
  });
  it("uses owned identity, with explicit parent context including unassigned", () => {
    const value: OwnedDestination = {
      kind: "object",
      id: "owned-id",
      displayName: "Tomato",
      objectKind: "plant",
      species: "Solanum lycopersicum",
      parent: null,
    };
    expect(destinationDetail(value, "uk")).toBe(
      "Рослина · Без простору · Solanum lycopersicum",
    );
    expect(destinationJournalPath(value)).toBe(
      "/garden/objects/owned-id#follow-up-composer",
    );
    expect(
      destinationDetail(
        { ...value, parent: { id: "space", displayName: "Terrace" } },
        "bg",
      ),
    ).toContain("Terrace");
  });
});
