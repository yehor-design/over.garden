import { describe, expect, it } from "vitest";

import {
  catalogPickerAvailabilityForResponse,
  classifyHomonymousCatalogRows,
  offersOwnNameOutcome,
} from "./catalog-availability";

describe("catalog picker availability", () => {
  it("reads a failed or unrecognised answer as unavailable, never as empty", () => {
    expect(
      catalogPickerAvailabilityForResponse({
        ok: false,
        state: "ready",
        rowCount: 3,
      }),
    ).toBe("unavailable");
    expect(
      catalogPickerAvailabilityForResponse({
        ok: true,
        state: "unavailable",
        rowCount: 0,
      }),
    ).toBe("unavailable");
  });

  it("separates a genuine empty answer from a ready list", () => {
    expect(
      catalogPickerAvailabilityForResponse({
        ok: true,
        state: "empty",
        rowCount: 0,
      }),
    ).toBe("empty");
    expect(
      catalogPickerAvailabilityForResponse({
        ok: true,
        state: "ready",
        rowCount: 0,
      }),
    ).toBe("empty");
    expect(
      catalogPickerAvailabilityForResponse({
        ok: true,
        state: "ready",
        rowCount: 2,
      }),
    ).toBe("ready");
  });

  it("offers the own-name outcome as soon as there is a name to add", () => {
    expect(offersOwnNameOutcome("")).toBe(false);
    expect(offersOwnNameOutcome("  т ")).toBe(false);
    expect(offersOwnNameOutcome("Де Барао")).toBe(true);
  });

  it("marks rows that share a display name so the list shows what tells them apart", () => {
    const rows = classifyHomonymousCatalogRows([
      {
        id: "00000000-0000-4000-8000-000000000001",
        displayName: "Чери домат",
        kind: "cultivar",
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        displayName: "чери  домат",
        kind: "cultivar",
        parentDisplayName: "Домат",
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        displayName: "Домат",
        kind: "species",
      },
    ]);

    expect(rows.map((row) => row.homonymous)).toEqual([true, true, false]);
    expect(rows[1]).toMatchObject({ parentDisplayName: "Домат" });
  });
});
