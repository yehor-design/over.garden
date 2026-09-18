import { readdirSync, readFileSync } from "node:fs";
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
  ADDRESS_ORDINAL_MAXIMUM,
  ADDRESS_ORDINAL_PATTERN,
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
      if (constraint.columnType === "integer") continue;
      expect(sql).toContain(`~ '${constraint.pattern}'`);
    }
  });

  /**
   * A number is stored as a number, so its `CHECK` is a range and holds no
   * pattern to compare. What has to agree instead is the *bound*: the route
   * admits nine digits, and a column that admitted ten would hold entries no
   * address could reach.
   */
  it("bounds the entry number by the same nine digits the route admits", () => {
    const definition = buildAddressContractDocument().constraints.find(
      (candidate) =>
        candidate.constraint === "journal_entries_author_entry_number_check",
    );
    expect(definition).toMatchObject({ columnType: "integer", nullable: true });
    expect(renderConstraintSql(definition!)).toContain(
      `author_entry_number between 1 and ${ADDRESS_ORDINAL_MAXIMUM}`,
    );
    const pattern = new RegExp(ADDRESS_ORDINAL_PATTERN, "u");
    expect(pattern.test(String(ADDRESS_ORDINAL_MAXIMUM))).toBe(true);
    expect(pattern.test(String(ADDRESS_ORDINAL_MAXIMUM + 1))).toBe(false);
    for (const refused of ["0", "012", "-1", "1a", "", "１２", "1.0", " 1"]) {
      expect(isAddressSlug("journalEntryNumber", refused)).toBe(false);
    }
    for (const admitted of ["1", "12", "999999999"]) {
      expect(isAddressSlug("journalEntryNumber", admitted)).toBe(true);
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
  it.each([
    [
      "0068",
      "sql/0068_ove425_journal_entry_public_slug_check.sql",
      "journal_entries_public_slug_check",
    ],
    [
      "0069",
      "sql/0069_ove426_journal_topic_slug_check.sql",
      "journal_topics_slug_check",
    ],
    [
      "0070",
      "sql/0070_ove428_author_scoped_addresses.sql",
      "plant_objects_public_slug_check",
    ],
    [
      "0071",
      "sql/0071_ove429_catalog_public_slug_check.sql",
      "catalog_items_public_slug_check",
    ],
    [
      "0076",
      "sql/0076_ove464_journal_entry_numbers.sql",
      "journal_entries_author_entry_number_check",
    ],
  ])(
    "finds migration %s's block inside the generated SQL, verbatim",
    (number, file, constraint) => {
      const migration = readFileSync(path.join(WEB_ROOT, file), "utf8");
      const definition = buildAddressContractDocument().constraints.find(
        (candidate) => candidate.constraint === constraint,
      );
      expect(definition?.checkInstalledBy).toBe(number);
      expect(migration).toContain(renderConstraintSql(definition!));
    },
  );

  /**
   * Every constraint the manifest says a migration installs must have one, and
   * the migration must be the number it names. Without this, marking a
   * constraint `checkInstalledBy: "0071"` and never writing `0071` would read
   * as applied in the generated SQL and be nowhere in the schema.
   */
  it("has a migration for every constraint that claims one", () => {
    for (const definition of buildAddressContractDocument().constraints) {
      if (!definition.checkInstalledBy) continue;
      const matches = readdirSync(path.join(WEB_ROOT, "sql")).filter((name) =>
        name.startsWith(`${definition.checkInstalledBy}_`),
      );
      expect(matches, `${definition.constraint}`).toHaveLength(1);
    }
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
