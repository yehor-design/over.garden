import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertObjectKindInventorySqlIsSelectOnly,
  buildObjectKindInventoryReport,
  formatObjectKindInventoryReport,
  isAllowedObjectKind,
  listObjectKindInventoryStatements,
} from "@/server/catalog/object-kind-inventory";

const SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/inventory-object-kinds.ts",
);

describe("OVE-211 object-kind inventory", () => {
  it("allows only plant and animal", () => {
    expect(isAllowedObjectKind("plant")).toBe(true);
    expect(isAllowedObjectKind("animal")).toBe(true);
    expect(isAllowedObjectKind("fungi")).toBe(false);
  });

  it("marks inventory SAFE when only plant and animal remain", () => {
    const safe = buildObjectKindInventoryReport({
      kindCounts: [
        { objectKind: "plant", count: 10 },
        { objectKind: "animal", count: 5 },
      ],
      unexpectedRows: [],
      dependents: {
        journalEntries: 0,
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
  });

  it("flags unexpected kinds for manual check", () => {
    const flagged = buildObjectKindInventoryReport({
      kindCounts: [{ objectKind: "fungi", count: 1 }],
      unexpectedRows: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          objectKind: "fungi",
          catalogItemId: null,
          varietyState: "unknown",
          catalogKind: null,
          catalogSource: null,
        },
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
    expect(() =>
      assertObjectKindInventorySqlIsSelectOnly(statements),
    ).not.toThrow();

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
