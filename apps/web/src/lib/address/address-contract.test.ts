import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildAddressContractDocument,
  renderAddressContractArtifacts,
  renderConstraintSql,
} from "../../../scripts/build-address-contract";
import {
  ADDRESS_MANIFEST,
  ADDRESS_NAMESPACES,
  addressSlugPattern,
  assertAddressManifestConsistency,
} from "./address-manifest";
import {
  ADDRESS_SLUG_PATTERN_SOURCE,
  BANNED_ADDRESS_PATH_LITERALS,
  isAddressSlug,
  isReservedAddressSlug,
} from "./address-contract.generated";

const WEB_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("the address contract is generated, not restated (ADR-0029 D12)", () => {
  it("declares every namespace once and agrees with itself", () => {
    expect(() => assertAddressManifestConsistency()).not.toThrow();
    expect(ADDRESS_MANIFEST.map((entry) => entry.namespace).sort()).toEqual(
      [...ADDRESS_NAMESPACES].sort(),
    );
  });

  it("renders the same pattern into the guard and the CHECK", () => {
    for (const entry of ADDRESS_MANIFEST) {
      expect(ADDRESS_SLUG_PATTERN_SOURCE[entry.namespace]).toBe(
        addressSlugPattern(entry),
      );
    }
    const document = buildAddressContractDocument();
    for (const constraint of document.constraints) {
      const sql = renderConstraintSql(constraint);
      expect(sql).toContain(`~ '${constraint.pattern}'`);
    }
  });

  it("keeps every generated artifact identical to a fresh render", () => {
    for (const file of renderAddressContractArtifacts().files) {
      expect(
        readFileSync(file.path, "utf8"),
        `${path.basename(file.path)} is stale — run \`pnpm address:contract:build\``,
      ).toBe(file.contents);
    }
  });

  /**
   * The migration is a copy, and a copy drifts. This is what stops it: the
   * block that runs against production has to be the block the manifest
   * renders, character for character, or the suite fails before anything
   * reaches a database.
   */
  it("finds migration 0068's block inside the generated SQL, verbatim", () => {
    const migration = readFileSync(
      path.join(WEB_ROOT, "sql/0068_ove425_journal_entry_public_slug_check.sql"),
      "utf8",
    );
    const definition = buildAddressContractDocument().constraints.find(
      (candidate) =>
        candidate.constraint === "journal_entries_public_slug_check",
    );
    expect(definition?.checkInstalledBy).toBe("0068");
    expect(migration).toContain(renderConstraintSql(definition!));
  });

  it("names a builder for every path prefix it bans", () => {
    expect(BANNED_ADDRESS_PATH_LITERALS.length).toBeGreaterThan(0);
    for (const banned of BANNED_ADDRESS_PATH_LITERALS) {
      expect(banned.literal.startsWith("/")).toBe(true);
      expect(banned.builders.length).toBeGreaterThan(0);
    }
  });
});

describe("the generated guard", () => {
  it("accepts a Cyrillic entry slug with its diacritics intact", () => {
    expect(isAddressSlug("journalEntry", "полив-без-календарної-пастки")).toBe(
      true,
    );
    expect(isAddressSlug("journalEntry", "наблюдение-действие")).toBe(true);
    expect(isAddressSlug("journalEntry", "кратък-и-отговорен-запис")).toBe(true);
  });

  it("refuses every shape a route segment could not survive", () => {
    for (const value of [
      "",
      "-полив",
      "полив-",
      "полив--без",
      "Полив",
      "полив плюс",
      "полив/плюс",
      "полив.плюс",
      "зав'язування",
      "café-noir",
      "полив̆",
      "й".normalize("NFD"),
    ]) {
      expect(isAddressSlug("journalEntry", value), value).toBe(false);
    }
  });

  it("keeps the species namespace Latin", () => {
    expect(isAddressSlug("species", "solanum-lycopersicum")).toBe(true);
    expect(isAddressSlug("species", "солянум")).toBe(false);
  });

  it("keeps the profile handle's own older shape", () => {
    expect(isAddressSlug("profileHandle", "yehor_design")).toBe(true);
    expect(isAddressSlug("profileHandle", "ab")).toBe(false);
    expect(isAddressSlug("profileHandle", "_yehor")).toBe(false);
  });

  it("treats a reserved word as taken rather than as invalid", () => {
    expect(isAddressSlug("journalEntry", "objects")).toBe(true);
    expect(isReservedAddressSlug("journalEntry", "objects")).toBe(true);
    expect(isReservedAddressSlug("journalEntry", "obiekty")).toBe(false);
  });
});
