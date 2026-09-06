import { describe, expect, it } from "vitest";

import {
  EPPO_TRANSFER_TABLES,
  buildSelectForTable,
  parseEppoTransferArgs,
} from "./transfer-eppo-capture";

const baseArgs = ["--mode", "inventory", "--env-file", "/abs/path/prod.env"];

describe("the EPPO capture transfer (OVE-394)", () => {
  it("defaults to an inventory and refuses a transfer nobody confirmed", () => {
    expect(parseEppoTransferArgs([])).toMatchObject({
      mode: "inventory",
      captureIds: [],
      allowTargetHostClass: "digitalocean_managed",
    });
    expect(parseEppoTransferArgs(baseArgs).envFile).toBe("/abs/path/prod.env");
    expect(() => parseEppoTransferArgs(["--mode", "restore"])).toThrow(
      "transfer_mode_invalid",
    );
  });

  it("takes capture ids only in the shape a capture id has", () => {
    expect(
      parseEppoTransferArgs([
        "--capture-ids",
        "df3852ea-3233-4883-8886-92d9e68f5193,19fc0b98-fe02-4c16-bab8-3af55a1e240e",
      ]).captureIds,
    ).toEqual([
      "df3852ea-3233-4883-8886-92d9e68f5193",
      "19fc0b98-fe02-4c16-bab8-3af55a1e240e",
    ]);
    expect(() => parseEppoTransferArgs(["--capture-ids", "df3852ea"])).toThrow(
      "transfer_capture_id_invalid",
    );
    // A table name in the id would be a query, not an identifier.
    expect(() =>
      parseEppoTransferArgs([
        "--capture-ids",
        "'; drop table catalog_items; --",
      ]),
    ).toThrow("transfer_capture_id_invalid");
  });

  it("scopes every table to the capture ids and never selects wholesale", () => {
    for (const table of EPPO_TRANSFER_TABLES) {
      const statement = buildSelectForTable(table);
      expect(statement).toContain("$1::uuid[]");
      expect(statement).toContain("where");
    }
  });

  it("orders the tables so every foreign key is satisfied when it is written", () => {
    // The snapshot before the run that references it, the run before its units
    // and its records, the archive records before their search terms. This
    // order is the transfer's correctness.
    expect([...EPPO_TRANSFER_TABLES]).toEqual([
      "catalog_source_snapshots",
      "catalog_source_capture_runs",
      "catalog_source_capture_units",
      "catalog_source_records",
      "stable_registry_public_eppo_records",
      "stable_registry_public_eppo_search_terms",
    ]);
  });

  it("never carries a source link, because a link names a node of one database", () => {
    // Which node an identifier belongs to is a decision each database makes
    // for itself. Copying a rehearsal's links into production would import its
    // identity decisions, and the foreign key refuses them anyway.
    expect([...EPPO_TRANSFER_TABLES]).not.toContain("catalog_source_links");
  });
});
