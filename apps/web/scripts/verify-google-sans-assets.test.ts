import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { GOOGLE_SANS_ASSET_MANIFEST } from "../src/lib/typography/google-sans-contract";
import { GEIST_MONO_ASSET_MANIFEST } from "../src/lib/typography/geist-mono-contract";
import {
  calculateMetricCompatibleFallback,
  DEFAULT_WEB_ROOT,
  evaluateBulgarianShapingObservation,
  findExternalGoogleFontBuiltRuntimeReferences,
  findNextFontGoogleRuntimeImports,
  findUnsupportedGoogleSansRuntimeWeights,
  sourceReferencesExternalGoogleFontHost,
  sourceReferencesNextFontGoogle,
  sourceReferencesUnsupportedGoogleSansWeight,
  verifyGoogleSansAssetContract,
  type GoogleSansVerifierIo,
} from "./verify-google-sans-assets";

describe("Google Sans asset verifier", () => {
  it("accepts the pinned manifest, assets, fallback metrics, Bulgarian shaping, license, CSS, budgets, and OpenType metadata", async () => {
    const report = await verifyGoogleSansAssetContract();

    expect(report).toMatchObject({
      assetCount: 8,
      totalBytes: 273_188,
      normalCoreBytes: 76_204,
      normalLatinExtendedBytes: 107_348,
      normalCyrillicExtendedBytes: 100_200,
      normalAllSubsetsBytes: 131_344,
      italicAllSubsetsBytes: 141_844,
      geistMonoAssetCount: 6,
      geistMonoTotalBytes: 70_516,
      geistMonoPreloadPaths: [],
      errors: [],
    });
  });

  it("recomputes the metric-compatible Arial fallback from pinned source and font metrics", () => {
    const fallback = calculateMetricCompatibleFallback({
      targetAzAverageWidth: 463.3953488372093,
      targetUnitsPerEm: 1_000,
      targetAscent: 966,
      targetDescent: -286,
      targetLineGap: 0,
      sourceAzAverageWidth: 934.5116279069767,
      sourceUnitsPerEm: 2_048,
    });

    expect(fallback.sizeAdjustRatio).toBeCloseTo(1.0155397173004181, 15);
    expect(fallback).toMatchObject({
      sizeAdjust: "101.55%",
      ascentOverride: "95.12%",
      descentOverride: "28.16%",
      lineGapOverride: "0.00%",
    });
  });

  it("requires Bulgarian locl shaping to differ from default and Russian Cyrillic", () => {
    const baseGlyphs = [
      { id: 90, name: "uni0432", codePoints: [0x0432] },
      { id: 91, name: "uni0433", codePoints: [0x0433] },
      { id: 94, name: "uni0434", codePoints: [0x0434] },
      { id: 109, name: "uni043F", codePoints: [0x043f] },
      { id: 112, name: "uni0442", codePoints: [0x0442] },
    ];
    const bulgarianGlyphs = [
      { id: 138, name: "uni0432.loclBGR", codePoints: [0x0432] },
      { id: 139, name: "uni0433.loclBGR", codePoints: [0x0433] },
      { id: 140, name: "uni0434.loclBGR", codePoints: [0x0434] },
      { id: 148, name: "uni043F.loclBGR", codePoints: [0x043f] },
      { id: 149, name: "uni0442.loclBGR", codePoints: [0x0442] },
    ];

    expect(
      evaluateBulgarianShapingObservation({
        defaultGlyphs: baseGlyphs,
        russianGlyphs: baseGlyphs,
        bulgarianGlyphs,
      }),
    ).toEqual([]);
    expect(
      evaluateBulgarianShapingObservation({
        defaultGlyphs: baseGlyphs,
        russianGlyphs: baseGlyphs,
        bulgarianGlyphs: baseGlyphs,
      }),
    ).toEqual([
      "bulgarian-localized-glyphs",
      "bulgarian-localized-forms-not-distinct",
    ]);
  });

  it("rejects a deliberate one-byte mutation of an otherwise allowlisted asset", async () => {
    const targetAsset = GOOGLE_SANS_ASSET_MANIFEST.assets.find(
      (asset) => asset.id === "normal-latin",
    );
    if (!targetAsset) throw new Error("normal-latin fixture is missing");

    const targetPath = path.resolve(
      DEFAULT_WEB_ROOT,
      targetAsset.repositoryPath,
    );
    const mutatingIo: GoogleSansVerifierIo = {
      readdir,
      async readFile(filePath) {
        const buffer = await readFile(filePath);
        if (path.resolve(filePath) !== targetPath) return buffer;

        const mutated = Buffer.from(buffer);
        mutated[Math.floor(mutated.byteLength / 2)] ^= 0x01;
        return mutated;
      },
    };

    await expect(
      verifyGoogleSansAssetContract({ io: mutatingIo }),
    ).rejects.toThrow(
      "normal-latin: SHA-256 does not match the official pinned asset",
    );
  });

  it("rejects a deliberate one-byte mutation of a Geist Mono asset", async () => {
    const targetAsset = GEIST_MONO_ASSET_MANIFEST.assets.find(
      (asset) => asset.id === "normal-latin",
    );
    if (!targetAsset)
      throw new Error("Geist Mono normal-latin fixture is missing");

    const targetPath = path.resolve(
      DEFAULT_WEB_ROOT,
      targetAsset.repositoryPath,
    );
    const mutatingIo: GoogleSansVerifierIo = {
      readdir,
      async readFile(filePath) {
        const buffer = await readFile(filePath);
        if (path.resolve(filePath) !== targetPath) return buffer;

        const mutated = Buffer.from(buffer);
        mutated[Math.floor(mutated.byteLength / 2)] ^= 0x01;
        return mutated;
      },
    };

    await expect(
      verifyGoogleSansAssetContract({ io: mutatingIo }),
    ).rejects.toThrow(
      "Geist Mono normal-latin: SHA-256 does not match the official pinned asset",
    );
  });

  it("finds next/font/google only in runtime source", async () => {
    expect(
      sourceReferencesNextFontGoogle(
        'import { Geist_Mono } from "next/font/google";',
      ),
    ).toBe(true);
    expect(sourceReferencesNextFontGoogle('import "./geist-mono.css";')).toBe(
      false,
    );

    const webRoot = await mkdtemp(
      path.join(os.tmpdir(), "ove-208-font-imports-"),
    );
    try {
      await mkdir(path.join(webRoot, "src", "__tests__"), {
        recursive: true,
      });
      await writeFile(
        path.join(webRoot, "src", "layout.tsx"),
        'import { Geist_Mono } from "next/font/google";\n',
      );
      await writeFile(
        path.join(webRoot, "src", "layout.test.tsx"),
        'vi.mock("next/font/google");\n',
      );
      await writeFile(
        path.join(webRoot, "src", "__tests__", "fixture.ts"),
        'export const moduleName = "next/font/google";\n',
      );

      await expect(findNextFontGoogleRuntimeImports(webRoot)).resolves.toEqual([
        "src/layout.tsx",
      ]);
    } finally {
      await rm(webRoot, { recursive: true, force: true });
    }
  });

  it("rejects proportional runtime weights outside the shipped 400..700 range", async () => {
    expect(sourceReferencesUnsupportedGoogleSansWeight("font-semibold")).toBe(
      false,
    );
    expect(
      sourceReferencesUnsupportedGoogleSansWeight("font-weight: 650"),
    ).toBe(false);
    expect(sourceReferencesUnsupportedGoogleSansWeight("font-extrabold")).toBe(
      true,
    );
    expect(sourceReferencesUnsupportedGoogleSansWeight("fontWeight: 800")).toBe(
      true,
    );

    const webRoot = await mkdtemp(
      path.join(os.tmpdir(), "ove-208-font-weights-"),
    );
    try {
      await mkdir(path.join(webRoot, "src", "app"), { recursive: true });
      await writeFile(
        path.join(webRoot, "src", "app", "safe.tsx"),
        'export const safe = <p className="font-semibold">Safe</p>;\n',
      );
      await writeFile(
        path.join(webRoot, "src", "app", "unsafe.tsx"),
        'export const unsafe = <p className="font-extrabold">Unsafe</p>;\n',
      );
      await expect(
        findUnsupportedGoogleSansRuntimeWeights(webRoot),
      ).resolves.toEqual(["src/app/unsafe.tsx"]);
    } finally {
      await rm(webRoot, { recursive: true, force: true });
    }
  });

  it("rejects external Google font hosts from built browser artifacts", async () => {
    expect(
      sourceReferencesExternalGoogleFontHost(
        'const source = "https://fonts.gstatic.com/example.woff2";',
      ),
    ).toBe(true);
    expect(
      sourceReferencesExternalGoogleFontHost(
        'const source = "/fonts/google-sans/v69/example.woff2";',
      ),
    ).toBe(false);

    const webRoot = await mkdtemp(
      path.join(os.tmpdir(), "ove-208-font-build-output-"),
    );
    try {
      await mkdir(path.join(webRoot, ".next", "static", "chunks"), {
        recursive: true,
      });
      await mkdir(path.join(webRoot, ".next", "server", "app"), {
        recursive: true,
      });
      await writeFile(
        path.join(webRoot, ".next", "static", "chunks", "safe.js"),
        'const source = "/fonts/google-sans/v69/example.woff2";\n',
      );
      await writeFile(
        path.join(webRoot, ".next", "static", "chunks", "unsafe.js"),
        'const source = "https://fonts.googleapis.com/css2";\n',
      );
      await writeFile(
        path.join(webRoot, ".next", "server", "app", "page.html"),
        '<link href="/fonts/google-sans/v69/example.woff2">\n',
      );

      await expect(
        findExternalGoogleFontBuiltRuntimeReferences(webRoot),
      ).resolves.toEqual([".next/static/chunks/unsafe.js"]);
    } finally {
      await rm(webRoot, { recursive: true, force: true });
    }
  });
});
