import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPackArtifact,
  classifyPackRow,
  isPackArtifact,
  PACK_ADAPTER_MAX_ALIASES_PER_ROW,
  PACK_ADAPTER_MAX_ROWS,
  PACK_ADAPTER_REFUSAL_CLASSES,
  PACK_ARTIFACT_SCHEMA_VERSION,
  PACK_ROW_CLASSIFICATIONS,
  PACK_SOURCE_RIGHTS,
  PACK_UNLISTED_SOURCE_RIGHTS,
  packDigest,
  readPackSourceString,
  resolvePackSourceRights,
  type BuildPackArtifactInput,
  type PackRowInput,
} from "./pack-artifact-contract";

const BYTE_DIGEST = "a".repeat(64);

function row(overrides: Partial<PackRowInput> = {}): PackRowInput {
  return {
    sourceRecordKey: "row-1",
    officialDenomination: "Ботсадівський",
    normalizedDenomination: "ботсадівський",
    locale: "uk",
    publicSlug: "botsadivskyi",
    parentCandidate: {
      scientificName: "Prunus armeniaca L.",
      evidenceClass: "declared_by_source",
    },
    aliases: [],
    ...overrides,
  };
}

function input(overrides: Partial<BuildPackArtifactInput> = {}) {
  return {
    adapterVersion: "test.adapter.v1",
    sourceSlug: "ua-state-register",
    declaredSourceVersion: "2026-06-30",
    packKind: "plant_variety" as const,
    artifactByteDigest: BYTE_DIGEST,
    allowsProductProjection: true,
    rows: [row()],
    ...overrides,
  };
}

describe("pack artifact schema", () => {
  it("classifies every row into exactly one closed class", () => {
    expect(PACK_ROW_CLASSIFICATIONS).toEqual([
      "clean",
      "needs_parent",
      "collision",
      "duplicate",
      "rights_blocked",
      "review_needed",
    ]);

    const result = buildPackArtifact(input());
    expect(result.status).toBe("validated");
    if (result.status !== "validated") return;
    expect(result.rows).toHaveLength(1);
    expect(result.counts.clean).toBe(1);
    expect(Object.values(result.counts).reduce((a, b) => a + b, 0)).toBe(1);
    expect(isPackArtifact(result)).toBe(true);
  });

  it("mirrors the source-readiness manifest verdicts exactly", () => {
    const manifest = JSON.parse(
      readFileSync(
        path.resolve(
          process.cwd(),
          "../../docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json",
        ),
        "utf8",
      ),
    ) as unknown;

    const verdicts = new Map<string, string>();
    const walk = (node: unknown) => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (
        typeof record.slug === "string" &&
        typeof record.verdict === "string"
      ) {
        verdicts.set(record.slug, record.verdict);
      }
      Object.values(record).forEach(walk);
    };
    walk(manifest);

    const expected: Record<string, string> = {
      use: "USE",
      use_with_conditions: "USE-WITH-CONDITIONS",
      internal_validation_only: "INTERNAL-VALIDATION-ONLY",
      reject: "REJECT",
    };
    for (const [slug, rights] of Object.entries(PACK_SOURCE_RIGHTS)) {
      // A manifest change must break this test rather than silently widening
      // what an adapter is allowed to project.
      expect(verdicts.get(slug), `manifest verdict for ${slug}`).toBe(
        expected[rights],
      );
    }
  });
});

describe("source authorization", () => {
  it("refuses a rejected source family instead of holding its rows", () => {
    const result = buildPackArtifact(
      input({ sourceSlug: "vendor-marketplace-paths" }),
    );
    expect(result).toMatchObject({
      status: "refused",
      refusalClass: "rights_rejected_source_family",
    });
  });

  it("holds an internal-validation-only family rather than projecting it", () => {
    const result = buildPackArtifact(input({ sourceSlug: "eurisco" }));
    expect(result.status).toBe("validated");
    if (result.status !== "validated") return;
    expect(result.counts.rights_blocked).toBe(1);
    expect(result.counts.clean).toBe(0);
  });

  it("holds a conditional family for review rather than calling it clean", () => {
    const result = buildPackArtifact(
      input({ sourceSlug: "eu-common-catalogue" }),
    );
    expect(result.status).toBe("validated");
    if (result.status !== "validated") return;
    expect(result.counts.review_needed).toBe(1);
    expect(result.counts.clean).toBe(0);
  });

  it("refuses an unknown family that does not declare product projection", () => {
    expect(
      buildPackArtifact(
        input({ sourceSlug: "made-up-source", allowsProductProjection: false }),
      ),
    ).toMatchObject({
      status: "refused",
      refusalClass: "unknown_source_family",
    });
  });

  it("admits an unlisted official family only on its own declared usage", () => {
    expect(resolvePackSourceRights("ua-official-bee-breeds", true)).toBe(
      PACK_UNLISTED_SOURCE_RIGHTS,
    );
    expect(resolvePackSourceRights("ua-official-bee-breeds", false)).toBeNull();
  });
});

describe("name truth and parent identity", () => {
  it("refuses a second official denomination hiding in the alias set", () => {
    expect(
      buildPackArtifact(
        input({
          rows: [
            row({
              aliases: [
                {
                  displayName: "Other",
                  normalizedName: "other",
                  locale: "uk",
                  nameClass: "official_denomination",
                },
              ],
            }),
          ],
        }),
      ),
    ).toMatchObject({
      status: "refused",
      refusalClass: "ambiguous_official_denomination",
    });
  });

  it("holds a row with no parent species instead of promoting it", () => {
    const result = buildPackArtifact(
      input({
        rows: [
          row({
            parentCandidate: { scientificName: null, evidenceClass: "absent" },
          }),
        ],
      }),
    );
    expect(result.status).toBe("validated");
    if (result.status !== "validated") return;
    expect(result.rows[0]?.classification).toBe("needs_parent");
  });

  it("never lets a declared hold be widened back to clean", () => {
    expect(
      classifyPackRow({
        rights: "use",
        declaredHold: "review_needed",
        parentCandidate: {
          scientificName: "Prunus armeniaca L.",
          evidenceClass: "declared_by_source",
        },
        duplicateRecord: false,
        collidingDenomination: false,
      }),
    ).toBe("review_needed");
  });

  it("separates a repeated denomination under one parent from a repeated record", () => {
    const result = buildPackArtifact(
      input({
        rows: [
          row({ sourceRecordKey: "row-1" }),
          row({ sourceRecordKey: "row-2" }),
          row({ sourceRecordKey: "row-1" }),
        ],
      }),
    );
    expect(result.status).toBe("validated");
    if (result.status !== "validated") return;
    expect(result.rows.map((entry) => entry.classification)).toEqual([
      "clean",
      "collision",
      "duplicate",
    ]);
  });
});

describe("deterministic replay and parser bounds", () => {
  it("returns the same digest for identical bytes and a different one for changed bytes", () => {
    const first = buildPackArtifact(input());
    const replay = buildPackArtifact(input());
    const changed = buildPackArtifact(
      input({ artifactByteDigest: "b".repeat(64) }),
    );

    expect(first.status).toBe("validated");
    if (
      first.status !== "validated" ||
      replay.status !== "validated" ||
      changed.status !== "validated"
    ) {
      return;
    }
    expect(replay.artifactDigest).toBe(first.artifactDigest);
    expect(changed.artifactDigest).not.toBe(first.artifactDigest);
  });

  it("digests independently of key order", () => {
    expect(packDigest({ a: 1, b: 2 })).toBe(packDigest({ b: 2, a: 1 }));
  });

  it("refuses rather than truncating when a parser bound is exceeded", () => {
    expect(
      buildPackArtifact(
        input({
          rows: [
            row({
              aliases: Array.from(
                { length: PACK_ADAPTER_MAX_ALIASES_PER_ROW + 1 },
                (_, index) => ({
                  displayName: `alias-${index}`,
                  normalizedName: `alias-${index}`,
                  locale: "uk",
                  nameClass: "local_name" as const,
                }),
              ),
            }),
          ],
        }),
      ),
    ).toMatchObject({
      status: "refused",
      refusalClass: "parser_bound_exceeded",
    });
    expect(PACK_ADAPTER_MAX_ROWS).toBe(200_000);
  });

  it("refuses an unreadable artifact and a missing declared version", () => {
    expect(
      buildPackArtifact(input({ artifactByteDigest: "not-a-digest" })),
    ).toMatchObject({ refusalClass: "artifact_unreadable" });
    expect(
      buildPackArtifact(input({ declaredSourceVersion: "  " })),
    ).toMatchObject({ refusalClass: "declared_version_missing" });
  });

  it("keeps every refusal inside the closed class set with no payload echo", () => {
    const refused = buildPackArtifact(
      input({ sourceSlug: "vendor-marketplace-paths" }),
    );
    expect(refused.status).toBe("refused");
    if (refused.status !== "refused") return;
    expect(PACK_ADAPTER_REFUSAL_CLASSES).toContain(refused.refusalClass);
    expect(JSON.stringify(refused)).not.toContain("Ботсадівський");
    expect(refused.schemaVersion).toBe(PACK_ARTIFACT_SCHEMA_VERSION);
  });
});

describe("forbidden field boundary", () => {
  it("refuses a row that carries a location or raw payload field", () => {
    for (const forbidden of ["latitude", "coordinates", "rawPayload"]) {
      expect(
        buildPackArtifact(
          input({
            rows: [{ ...row(), [forbidden]: "value" } as PackRowInput],
          }),
        ),
      ).toMatchObject({
        status: "refused",
        refusalClass: "forbidden_field_present",
      });
    }
  });

  it("reads a declared source string without surfacing the payload", () => {
    const payload = { row: { taxonNameLat: " Prunus armeniaca L. " } };
    expect(readPackSourceString(payload, "row", "taxonNameLat")).toBe(
      "Prunus armeniaca L.",
    );
    // The register writes the literal string NULL for an absent value.
    expect(
      readPackSourceString(
        { row: { taxonNameLat: "NULL" } },
        "row",
        "taxonNameLat",
      ),
    ).toBeNull();
    expect(readPackSourceString(payload, "row", "missing")).toBeNull();
    expect(readPackSourceString(null, "row")).toBeNull();
  });
});
