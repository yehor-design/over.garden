import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  everydayForm,
  nameKey,
  registerLatinKeys,
  type StandardSpeciesRow,
} from "./build-standard-species";

const DATA_FILE = path.join(
  import.meta.dirname,
  "..",
  "data",
  "standard-species",
  "standard-species.v1.json",
);
const base = JSON.parse(readFileSync(DATA_FILE, "utf8")) as {
  version: string;
  rows: StandardSpeciesRow[];
};

describe("the register's Latin names become the names Wikidata carries (OVE-530)", () => {
  it("drops the authority and tries the most precise rank first", () => {
    const keys = registerLatinKeys("Beta vulgaris L. ssp. vulgaris var. altissima Dоell");
    expect(keys[0]).toBe("Beta vulgaris var. altissima");
    expect(keys.indexOf("Beta vulgaris subsp. vulgaris")).toBeGreaterThan(0);
    expect(keys.indexOf("Beta vulgaris")).toBeGreaterThan(
      keys.indexOf("Beta vulgaris subsp. vulgaris"),
    );
    expect(keys.join(" ")).not.toMatch(/\bL\.|Dоell|Doell/u);
  });

  it("keeps a hybrid sign and offers Wikidata's spelling without the space", () => {
    expect(registerLatinKeys("Mentha × piperita L.")).toEqual([
      "Mentha × piperita",
      "Mentha ×piperita",
    ]);
  });

  it("reads a Cyrillic letter typed inside a Latin name as the Latin one", () => {
    // "Sоlanum" with a Cyrillic о, as the register sometimes writes it.
    expect(registerLatinKeys("Sоlanum tuberosum L.")[0]).toBe("Solanum tuberosum");
  });

  it("refuses a line that is not a binomial", () => {
    expect(registerLatinKeys("Rubus")).toEqual([]);
    expect(registerLatinKeys("hybrids between")).toEqual([]);
  });
});

describe("names as a person writes them", () => {
  it("drops a Wikipedia qualifier and starts with a capital", () => {
    expect(everydayForm("полуниці садові", "uk")).toBe("Полуниці садові");
    expect(everydayForm("Киви (растение)", "bg")).toBe("Киви");
  });

  it("compares without case, ё or the apostrophe's shape", () => {
    expect(nameKey("М’ята")).toBe(nameKey("м'ята"));
    expect(nameKey("Свёкла")).toBe(nameKey("свекла"));
  });
});

describe("the standard base file", () => {
  const rows = base.rows;

  it("has a version, and more than three hundred plants and a hundred animals (no cap)", () => {
    expect(base.version).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(rows.filter((row) => row.kind === "plant").length).toBeGreaterThan(300);
    expect(rows.filter((row) => row.kind === "animal").length).toBeGreaterThanOrEqual(100);
  });

  it("gives every row one key, one Wikidata item and a Latin name", () => {
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    expect(new Set(rows.map((row) => row.wikidata)).size).toBe(rows.length);
    for (const row of rows) {
      expect(row.key, row.key).toMatch(/^(plant|animal):[a-z0-9]+(-[a-z0-9]+)*$/u);
      expect(row.wikidata, row.key).toMatch(/^Q[1-9][0-9]*$/u);
      expect(row.latin.length, row.key).toBeGreaterThan(2);
    }
  });

  it("names every row in Ukrainian and Russian in Cyrillic, and never twice in one language", () => {
    for (const lang of ["uk", "bg", "ru"] as const) {
      const seen = new Map<string, string>();
      for (const row of rows) {
        const display = row.names[lang].display;
        if (lang !== "bg") {
          expect(display, `${row.key} ${lang}`).toMatch(/\p{Script=Cyrillic}/u);
        }
        const key = nameKey(display);
        expect(seen.get(key), `${lang} "${display}" twice`).toBeUndefined();
        seen.set(key, row.key);
      }
    }
  });

  it("never marks a name confirmed without two sources, and names its evidence", () => {
    for (const row of rows) {
      for (const lang of ["uk", "bg", "ru"] as const) {
        const name = row.names[lang];
        expect(["confirmed", "review", "single_source"]).toContain(name.status);
        expect(name.evidence.length, `${row.key} ${lang}`).toBeGreaterThan(0);
        if (lang === "bg") expect(name.status).not.toBe("review");
      }
    }
  });

  // The words a gardener typed into production's picker on 2026-09-25, and
  // the species each must find first.
  it.each([
    ["uk", "помідор", "Solanum lycopersicum"],
    ["uk", "болгарський перець", "Capsicum annuum"],
    ["uk", "полуниця", "Fragaria × ananassa"],
    ["uk", "кабачок", "Cucurbita pepo subsp. pepo"],
    ["uk", "броколі", "Brassica oleracea var. italica"],
    ["uk", "троянда", "Rosa"],
    ["uk", "вишня", "Prunus cerasus"],
    ["uk", "курка", "Gallus gallus domesticus"],
    ["uk", "коза", "Capra aegagrus hircus"],
    ["uk", "кролик", "Oryctolagus cuniculus domesticus"],
    ["bg", "домат", "Solanum lycopersicum"],
    ["bg", "пипер", "Capsicum annuum"],
    ["bg", "ягода", "Fragaria × ananassa"],
    ["bg", "тиквичка", "Cucurbita pepo subsp. pepo"],
    ["bg", "кокошка", "Gallus gallus domesticus"],
    ["ru", "помидор", "Solanum lycopersicum"],
    ["ru", "перец", "Capsicum annuum"],
    ["ru", "клубника", "Fragaria × ananassa"],
    ["ru", "кабачок", "Cucurbita pepo subsp. pepo"],
    ["ru", "курица", "Gallus gallus domesticus"],
  ] as const)("finds %s «%s» as %s first", (lang, word, latin) => {
    const query = nameKey(word);
    const ranked = rows
      .map((row) => {
        const name = row.names[lang];
        const display = nameKey(name.display);
        const rank =
          display === query
            ? 0
            : display.startsWith(query)
              ? 1
              : name.search.some((value) => nameKey(value) === query)
                ? 2
                : name.search.some((value) => nameKey(value).startsWith(query))
                  ? 3
                  : null;
        return { row, rank };
      })
      .filter((entry): entry is { row: StandardSpeciesRow; rank: number } => entry.rank !== null)
      .sort((left, right) => left.rank - right.rank);
    expect(ranked[0]?.row.latin).toBe(latin);
  });
});
