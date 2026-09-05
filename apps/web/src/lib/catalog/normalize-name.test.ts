import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  NORMALIZE_NAME_MAPPING_TABLES,
  normalizeCatalogName,
} from "./normalize-name";

const contractsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../contracts/catalog",
);

interface FixtureFile {
  version: string;
  cases: Array<{ input: string; expected: string; note: string }>;
}

interface MappingFile {
  version: string;
  space: string[];
  apostrophe: string[];
  doubleQuoteToSpace: string[];
  dash: string[];
  hybridSign: string[];
  latinFolds: Record<string, string[]>;
  cyrillicFolds: Record<string, string>;
  multiCharacterFolds: Record<string, string>;
}

function readJson<T>(name: string): T {
  return JSON.parse(
    readFileSync(path.join(contractsDirectory, name), "utf8"),
  ) as T;
}

function codePoint(notation: string) {
  const match = /^U\+([0-9A-F]{4,6})$/.exec(notation);
  if (!match) throw new Error(`not a code point notation: ${notation}`);
  return Number.parseInt(match[1]!, 16);
}

describe("normalizeCatalogName", () => {
  const fixture = readJson<FixtureFile>("normalize-name.fixture.json");

  it("holds at least two hundred fixture cases", () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(200);
  });

  it.each(fixture.cases.map((entry) => [entry.note, entry.input, entry.expected]))(
    "%s",
    (_note, input, expected) => {
      expect(normalizeCatalogName(input)).toBe(expected);
    },
  );

  it("is idempotent over the fixture", () => {
    for (const entry of fixture.cases) {
      expect(normalizeCatalogName(entry.expected)).toBe(entry.expected);
    }
  });

  it("embeds exactly the tables of the shared mapping contract", () => {
    const mapping = readJson<MappingFile>("normalize-name.mapping.json");
    expect([...NORMALIZE_NAME_MAPPING_TABLES.space]).toEqual(
      mapping.space.map(codePoint),
    );
    expect([...NORMALIZE_NAME_MAPPING_TABLES.apostrophe]).toEqual(
      mapping.apostrophe.map(codePoint),
    );
    expect([...NORMALIZE_NAME_MAPPING_TABLES.doubleQuoteToSpace]).toEqual(
      mapping.doubleQuoteToSpace.map(codePoint),
    );
    expect([...NORMALIZE_NAME_MAPPING_TABLES.dash]).toEqual(
      mapping.dash.map(codePoint),
    );
    expect([...NORMALIZE_NAME_MAPPING_TABLES.hybridSign]).toEqual(
      mapping.hybridSign.map(codePoint),
    );
    expect(
      Object.fromEntries(
        Object.entries(NORMALIZE_NAME_MAPPING_TABLES.latinFolds).map(
          ([base, points]) => [base, [...points]],
        ),
      ),
    ).toEqual(
      Object.fromEntries(
        Object.entries(mapping.latinFolds).map(([base, points]) => [
          base,
          points.map(codePoint),
        ]),
      ),
    );
    expect(
      Object.fromEntries(
        Object.entries(NORMALIZE_NAME_MAPPING_TABLES.cyrillicFolds).map(
          ([from, to]) => [Number(from), to],
        ),
      ),
    ).toEqual(
      Object.fromEntries(
        Object.entries(mapping.cyrillicFolds).map(([from, to]) => [
          codePoint(from),
          codePoint(to),
        ]),
      ),
    );
    expect(
      Object.fromEntries(
        Object.entries(NORMALIZE_NAME_MAPPING_TABLES.multiCharacterFolds).map(
          ([from, to]) => [Number(from), to],
        ),
      ),
    ).toEqual(
      Object.fromEntries(
        Object.entries(mapping.multiCharacterFolds).map(([from, to]) => [
          codePoint(from),
          to,
        ]),
      ),
    );
  });
});
