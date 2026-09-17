import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ILLUSTRATION_KEYS,
  ILLUSTRATION_SIZES,
  illustrationObjectKey,
  resolveIllustration,
} from "./illustrations";

const SOURCE_ROOT = fileURLToPath(new URL("..", import.meta.url));
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
      expect(illustrationObjectKey(key)).toBe(`illustrations/${key}.webp`);
    }
  });

  it("serves WebP through the existing media pipeline, never a bundled asset", () => {
    const url = resolveIllustration(ILLUSTRATION_KEYS[0], {
      baseUrl: "https://media.over.garden",
    });
    // Nothing is published yet, so the honest answer is `null` rather than a
    // URL that would 404 on every empty state.
    expect(url).toBeNull();
  });

  it("answers null rather than a broken image when a key has no file", () => {
    for (const key of ILLUSTRATION_KEYS) {
      expect(
        resolveIllustration(key, { baseUrl: "https://media.over.garden" }),
        key,
      ).toBeNull();
    }
  });

  it("answers null in a browser, where the media base is not exposed", () => {
    expect(
      resolveIllustration(ILLUSTRATION_KEYS[0], { baseUrl: "" }),
    ).toBeNull();
  });

  it("sizes them as DESIGN.md §2.9 does: 96 in a card, 144 at page level", () => {
    expect(ILLUSTRATION_SIZES).toEqual({ card: 96, page: 144 });
  });

  it("records the licence position rather than leaving it to be rediscovered", () => {
    const source = readFileSync(MANIFEST, "utf8");
    expect(source).toContain("thiings.co");
    expect(source).toContain("ADR-0031 D10");
    // The one term that binds at every tier, paid ones included.
    expect(source).toMatch(/never republished as assets/iu);
  });
});
