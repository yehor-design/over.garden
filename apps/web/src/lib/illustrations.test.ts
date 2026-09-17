import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ILLUSTRATION_KEYS,
  ILLUSTRATION_SIZES,
  ILLUSTRATION_SUBJECTS,
  illustrationPath,
  resolveIllustration,
} from "./illustrations";

const SOURCE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MANIFEST = fileURLToPath(new URL("./illustrations.ts", import.meta.url));

function walk(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      walk(absolute, out);
      continue;
    }
    if (/\.tsx?$/u.test(entry)) out.push(absolute);
  }
  return out;
}

describe("the illustration manifest", () => {
  it("is the only module that names an illustration file", () => {
    // ADR-0031 D10: the swap stays cheap only while no component knows where
    // the files live. A path anywhere else is the defect.
    const offenders = walk(SOURCE_ROOT)
      .filter(
        (file) =>
          file !== MANIFEST &&
          !file.endsWith(".test.ts") &&
          !file.endsWith(".test.tsx"),
      )
      .filter((file) => /illustrations\//u.test(readFileSync(file, "utf8")))
      .map((file) => relative(SOURCE_ROOT, file).split(sep).join("/"));
    expect(offenders).toEqual([]);
  });

  it("keeps the whole set under one directory, so a licence change is one move", () => {
    for (const key of ILLUSTRATION_KEYS) {
      expect(illustrationPath(key)).toBe(`/illustrations/${key}.webp`);
    }
  });

  it("ships a real WebP for every key, and nothing else in that directory", () => {
    // A key with no file renders a broken image on an empty state, which is
    // worse than the no-illustration state it replaced.
    const directory = join(APP_ROOT, "public", "illustrations");
    for (const key of ILLUSTRATION_KEYS) {
      const file = join(directory, `${key}.webp`);
      expect(existsSync(file), `${key}.webp is missing`).toBe(true);
      const header = readFileSync(file).subarray(0, 12);
      expect(header.subarray(0, 4).toString("ascii"), key).toBe("RIFF");
      expect(header.subarray(8, 12).toString("ascii"), key).toBe("WEBP");
    }
    expect(readdirSync(directory).sort()).toEqual(
      ILLUSTRATION_KEYS.map((key) => `${key}.webp`).sort(),
    );
  });

  it("resolves to a root-relative path the browser can take as it is", () => {
    for (const key of ILLUSTRATION_KEYS) {
      const illustration = resolveIllustration(key);
      expect(illustration.src).toBe(`/illustrations/${key}.webp`);
      // Twice the 180 px maximum, so the largest declared size stays sharp on
      // a 2× display without a second file.
      expect(illustration.width).toBe(360);
      expect(illustration.height).toBe(360);
    }
  });

  it("sizes them as DESIGN.md §2.9 does: 96 in a card, 144 at page level", () => {
    expect(ILLUSTRATION_SIZES).toEqual({ card: 96, page: 144 });
  });

  it("records what each key is a picture of", () => {
    // Replacing one later means finding its equivalent, and a file name does
    // not say what the picture shows.
    expect(Object.keys(ILLUSTRATION_SUBJECTS).sort()).toEqual(
      [...ILLUSTRATION_KEYS].sort(),
    );
    for (const subject of Object.values(ILLUSTRATION_SUBJECTS)) {
      expect(subject.trim().length).toBeGreaterThan(0);
    }
  });

  it("records the licence position rather than leaving it to be rediscovered", () => {
    const source = readFileSync(MANIFEST, "utf8");
    expect(source).toContain("thiings.co");
    expect(source).toContain("ADR-0031 D10");
    // The one term that binds at every tier, paid ones included.
    expect(source).toMatch(/never republished as assets/iu);
  });
});
