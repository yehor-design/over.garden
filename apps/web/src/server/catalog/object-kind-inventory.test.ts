import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertObjectKindInventorySqlIsSelectOnly,
  buildObjectKindInventoryReport,
  classifyBeeColonyRow,
  formatObjectKindInventoryReport,
  listObjectKindInventoryStatements,
  type BeeColonyInventoryRow,
} from "@/server/catalog/object-kind-inventory";

const SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/inventory-object-kinds.ts",
);

function beeRow(
  overrides: Partial<BeeColonyInventoryRow>,
): BeeColonyInventoryRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    catalogItemId: null,
    varietyState: "unknown",
    catalogKind: null,
    catalogSource: null,
    catalogHasPublicSlug: false,
    ...overrides,
  };
}

describe("OVE-210 object-kind inventory classification", () => {
  it("marks bee_colony + bee breed as SAFE", () => {
    expect(
      classifyBeeColonyRow(
        beeRow({
          catalogItemId: "00000000-0000-4000-8000-0000000000aa",
          varietyState: "selected",
          catalogKind: "breed",
          catalogSource: "ua_official_bee_breed",
        }),
      ),
    ).toBe("safe_breed");
  });

  it("marks bee_colony + unknown/free_text without foreign catalog as SAFE", () => {
    expect(
      classifyBeeColonyRow(
        beeRow({ varietyState: "unknown", catalogItemId: null }),
      ),
    ).toBe("safe_unidentified");
    expect(
      classifyBeeColonyRow(
        beeRow({ varietyState: "free_text", catalogItemId: null }),
      ),
    ).toBe("safe_unidentified");
  });

  it("flags bee_colony + no/foreign catalog for manual check", () => {
    expect(
      classifyBeeColonyRow(
        beeRow({
          catalogItemId: "00000000-0000-4000-8000-0000000000bb",
          varietyState: "selected",
          catalogKind: "plant_variety",
          catalogSource: "ua_state_register",
        }),
      ),
    ).toBe("manual_check");

    expect(
      classifyBeeColonyRow(
        beeRow({
          catalogItemId: "00000000-0000-4000-8000-0000000000cc",
          varietyState: "selected",
          catalogKind: "species",
          catalogSource: "species_backbone",
        }),
      ),
    ).toBe("manual_check");

    expect(
      classifyBeeColonyRow(
        beeRow({
          catalogItemId: null,
          varietyState: "selected",
          catalogKind: null,
        }),
      ),
    ).toBe("manual_check");
  });

  it("builds SAFE TO COLLAPSE=yes only when every bee_colony row is safe", () => {
    const safe = buildObjectKindInventoryReport({
      kindCounts: [
        { objectKind: "plant", count: 10 },
        { objectKind: "bee_colony", count: 1 },
        { objectKind: "animal", count: 2 },
      ],
      beeColonyRows: [
        beeRow({
          catalogItemId: "00000000-0000-4000-8000-0000000000aa",
          varietyState: "selected",
          catalogKind: "breed",
        }),
      ],
      dependents: {
        journalEntries: 1,
        journalEntryObjectMentions: 0,
        lineageSubjectEdges: 0,
        lineageSourceEdges: 0,
        mediaAssetsViaJournal: 0,
        publicSlugJournalEntries: 0,
      },
    });
    expect(safe.safeToCollapse).toBe(true);
    expect(formatObjectKindInventoryReport(safe)).toContain(
      "SAFE TO COLLAPSE: yes",
    );

    const flagged = buildObjectKindInventoryReport({
      kindCounts: [{ objectKind: "bee_colony", count: 1 }],
      beeColonyRows: [
        beeRow({
          catalogItemId: "00000000-0000-4000-8000-0000000000bb",
          varietyState: "selected",
          catalogKind: "plant_variety",
        }),
      ],
      dependents: {
        journalEntries: 0,
        journalEntryObjectMentions: 0,
        lineageSubjectEdges: 0,
        lineageSourceEdges: 0,
        mediaAssetsViaJournal: 0,
        publicSlugJournalEntries: 0,
      },
    });
    expect(flagged.safeToCollapse).toBe(false);
    expect(formatObjectKindInventoryReport(flagged)).toContain(
      "SAFE TO COLLAPSE: no",
    );
  });

  it("issues only SELECT statements (no INSERT/UPDATE/DELETE/DDL)", () => {
    const statements = listObjectKindInventoryStatements();
    expect(statements.length).toBeGreaterThanOrEqual(3);
    expect(() => assertObjectKindInventorySqlIsSelectOnly(statements)).not.toThrow();

    for (const statement of statements) {
      expect(statement).toMatch(/^\s*select\b/i);
      expect(statement).not.toMatch(
        /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke)\b/i,
      );
    }
  });

  it("keeps the CLI script SELECT-only and free of mutating SQL literals", async () => {
    const source = await readFile(SCRIPT_PATH, "utf8");
    expect(source).toContain("OBJECT_KIND_INVENTORY_SQL");
    expect(source).toContain("assertObjectKindInventorySqlIsSelectOnly");
    expect(source).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\s+/i,
    );
  });
});
