import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { format } from "prettier";

import {
  GOOGLE_SANS_ASSET_MANIFEST,
  GOOGLE_SANS_FAMILY,
  GOOGLE_SANS_FONT_FACE_CSS,
  GOOGLE_SANS_PRELOAD_ASSETS,
  type TypographyFontAssetV1,
} from "../src/lib/typography/google-sans-contract";
import {
  GOOGLE_SANS_RUNTIME_ASSETS,
  GOOGLE_SANS_RUNTIME_FALLBACK,
} from "../src/lib/typography/google-sans-runtime";
import {
  GEIST_MONO_ASSET_MANIFEST,
  GEIST_MONO_FAMILY,
  GEIST_MONO_FONT_FACE_CSS,
  GEIST_MONO_PRELOAD_ASSETS,
  type GeistMonoFontAssetV1,
} from "../src/lib/typography/geist-mono-contract";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_WEB_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");

const GENERATED_CSS_REPOSITORY_PATH = "src/app/google-sans.css";
const FONT_DIRECTORY_REPOSITORY_PATH = "public/fonts/google-sans/v69";
const GEIST_MONO_GENERATED_CSS_REPOSITORY_PATH = "src/app/geist-mono.css";
const GEIST_MONO_FONT_DIRECTORY_REPOSITORY_PATH = "public/fonts/geist-mono/v6";
const NEXT_AVERAGE_WIDTH_CHARACTERS =
  "aaabcdeeeefghiijklmnnoopqrrssttuvwxyz      ";
const PINNED_ARIAL_FALLBACK_METRICS = {
  family: "Arial",
  azAverageWidth: 934.5116279069767,
  unitsPerEm: 2_048,
} as const;
const BULGARIAN_SHAPING_SAMPLE = "вгдпт";
const EXPECTED_CYRILLIC_BASE_GLYPHS = [
  { id: 90, name: "uni0432", codePoint: 0x0432 },
  { id: 91, name: "uni0433", codePoint: 0x0433 },
  { id: 94, name: "uni0434", codePoint: 0x0434 },
  { id: 109, name: "uni043F", codePoint: 0x043f },
  { id: 112, name: "uni0442", codePoint: 0x0442 },
] as const;
const EXPECTED_BULGARIAN_LOCALIZED_GLYPHS = [
  { id: 138, name: "uni0432.loclBGR", codePoint: 0x0432 },
  { id: 139, name: "uni0433.loclBGR", codePoint: 0x0433 },
  { id: 140, name: "uni0434.loclBGR", codePoint: 0x0434 },
  { id: 148, name: "uni043F.loclBGR", codePoint: 0x043f },
  { id: 149, name: "uni0442.loclBGR", codePoint: 0x0442 },
] as const;
const RUNTIME_SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mdx",
  ".mts",
  ".ts",
  ".tsx",
]);
const BUILT_BROWSER_EXTENSIONS = new Set([
  ".body",
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".rsc",
  ".txt",
]);
const EXTERNAL_GOOGLE_FONT_HOST_PATTERN =
  /(?:fonts\.googleapis\.com|fonts\.gstatic\.com|fonts\.google\.com)/u;
const UNSUPPORTED_GOOGLE_SANS_WEIGHT_CLASS_PATTERN =
  /\bfont-(?:thin|extralight|light|extrabold|black)\b/u;
const NUMERIC_FONT_WEIGHT_PATTERN =
  /(?:font-weight\s*:|fontWeight\s*[:=])\s*["']?(\d{3})\b/gu;

interface FontKitAxis {
  name: string;
  min: number;
  default: number;
  max: number;
}

interface FontKitGlyph {
  id: number;
  name: string;
  advanceWidth: number;
  codePoints: number[];
}

interface FontKitGlyphRun {
  glyphs: FontKitGlyph[];
}

interface FontKitLookup {
  subTables: Array<{
    extension?: {
      glyphCount?: number;
      coverage?: { glyphCount?: number };
    };
  }>;
}

interface FontKitGsub {
  scriptList: Array<{
    tag: string;
    script: {
      langSysRecords: Array<{
        tag: string;
        langSys: { featureIndexes: number[] };
      }>;
    };
  }>;
  featureList: Array<{
    tag: string;
    feature: { lookupListIndexes: number[] };
  }>;
  lookupList: { get(index: number): FontKitLookup };
}

interface FontKitFont {
  familyName: string;
  subfamilyName: string;
  postscriptName: string;
  version: string;
  copyright: string;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  lineGap: number;
  variationAxes: Record<string, FontKitAxis>;
  availableFeatures: string[];
  glyphsForString(value: string): FontKitGlyph[];
  hasGlyphForCodePoint(codePoint: number): boolean;
  layout(
    value: string,
    features?: readonly string[],
    script?: string,
    language?: string,
  ): FontKitGlyphRun;
  _tables: { GSUB?: FontKitGsub };
}

type FontFromBuffer = (buffer: Buffer) => FontKitFont;

export interface GoogleSansVerifierIo {
  readFile(filePath: string): Promise<Buffer>;
  readdir(directoryPath: string): Promise<string[]>;
}

export interface GoogleSansVerificationReport {
  assetCount: number;
  totalBytes: number;
  normalCoreBytes: number;
  normalLatinExtendedBytes: number;
  normalCyrillicExtendedBytes: number;
  normalAllSubsetsBytes: number;
  italicAllSubsetsBytes: number;
  preloadPaths: string[];
  geistMonoAssetCount: number;
  geistMonoTotalBytes: number;
  geistMonoPreloadPaths: string[];
  errors: string[];
}

export interface GoogleSansVerifierOptions {
  webRoot?: string;
  io?: GoogleSansVerifierIo;
}

export interface MetricCompatibleFallbackInput {
  targetAzAverageWidth: number;
  targetUnitsPerEm: number;
  targetAscent: number;
  targetDescent: number;
  targetLineGap: number;
  sourceAzAverageWidth: number;
  sourceUnitsPerEm: number;
}

export interface MetricCompatibleFallbackResult {
  sizeAdjustRatio: number;
  sizeAdjust: string;
  ascentOverride: string;
  descentOverride: string;
  lineGapOverride: string;
}

export interface BulgarianShapingGlyphObservation {
  id: number;
  name: string;
  codePoints: readonly number[];
}

export interface BulgarianShapingObservation {
  defaultGlyphs: readonly BulgarianShapingGlyphObservation[];
  russianGlyphs: readonly BulgarianShapingGlyphObservation[];
  bulgarianGlyphs: readonly BulgarianShapingGlyphObservation[];
}

const DEFAULT_IO: GoogleSansVerifierIo = {
  readFile,
  readdir,
};

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function addError(errors: string[], condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

function formatCssPercentage(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function calculateMetricCompatibleFallback(
  input: MetricCompatibleFallbackInput,
): MetricCompatibleFallbackResult {
  const positiveValues = [
    input.targetAzAverageWidth,
    input.targetUnitsPerEm,
    input.sourceAzAverageWidth,
    input.sourceUnitsPerEm,
  ];
  if (
    positiveValues.some((value) => !Number.isFinite(value) || value <= 0) ||
    !Number.isFinite(input.targetAscent) ||
    !Number.isFinite(input.targetDescent) ||
    !Number.isFinite(input.targetLineGap)
  ) {
    throw new Error(
      "Fallback widths and units must be positive; vertical metrics must be finite.",
    );
  }

  const targetAverageWidthRatio =
    input.targetAzAverageWidth / input.targetUnitsPerEm;
  const sourceAverageWidthRatio =
    input.sourceAzAverageWidth / input.sourceUnitsPerEm;
  const sizeAdjustRatio = targetAverageWidthRatio / sourceAverageWidthRatio;
  const adjustedTargetUnitsPerEm = input.targetUnitsPerEm * sizeAdjustRatio;

  return {
    sizeAdjustRatio,
    sizeAdjust: formatCssPercentage(sizeAdjustRatio * 100),
    ascentOverride: formatCssPercentage(
      (input.targetAscent / adjustedTargetUnitsPerEm) * 100,
    ),
    descentOverride: formatCssPercentage(
      (Math.abs(input.targetDescent) / adjustedTargetUnitsPerEm) * 100,
    ),
    lineGapOverride: formatCssPercentage(
      (input.targetLineGap / adjustedTargetUnitsPerEm) * 100,
    ),
  };
}

function glyphMatches(
  glyph: BulgarianShapingGlyphObservation | undefined,
  expected: { id: number; name: string; codePoint: number },
): boolean {
  return (
    glyph?.id === expected.id &&
    glyph.name === expected.name &&
    glyph.codePoints.length === 1 &&
    glyph.codePoints[0] === expected.codePoint
  );
}

function glyphSequenceMatches(
  glyphs: readonly BulgarianShapingGlyphObservation[],
  expected: readonly { id: number; name: string; codePoint: number }[],
): boolean {
  return (
    glyphs.length === expected.length &&
    expected.every((candidate, index) => glyphMatches(glyphs[index], candidate))
  );
}

export function evaluateBulgarianShapingObservation(
  observation: BulgarianShapingObservation,
): string[] {
  const errors: string[] = [];

  if (
    !glyphSequenceMatches(
      observation.defaultGlyphs,
      EXPECTED_CYRILLIC_BASE_GLYPHS,
    )
  ) {
    errors.push("default-cyrillic-glyphs");
  }
  if (
    !glyphSequenceMatches(
      observation.russianGlyphs,
      EXPECTED_CYRILLIC_BASE_GLYPHS,
    )
  ) {
    errors.push("russian-cyrillic-glyphs");
  }
  if (
    !glyphSequenceMatches(
      observation.bulgarianGlyphs,
      EXPECTED_BULGARIAN_LOCALIZED_GLYPHS,
    )
  ) {
    errors.push("bulgarian-localized-glyphs");
  }
  if (
    observation.bulgarianGlyphs.length !== observation.defaultGlyphs.length ||
    observation.bulgarianGlyphs.some(
      (glyph, index) =>
        glyph.id === observation.defaultGlyphs[index]?.id ||
        glyph.name === observation.defaultGlyphs[index]?.name,
    )
  ) {
    errors.push("bulgarian-localized-forms-not-distinct");
  }

  return errors;
}

function assetById(id: TypographyFontAssetV1["id"]): TypographyFontAssetV1 {
  const asset = GOOGLE_SANS_ASSET_MANIFEST.assets.find(
    (candidate) => candidate.id === id,
  );

  if (!asset) throw new Error(`Manifest asset ${id} is missing.`);
  return asset;
}

function sumBytes(assets: readonly { bytes: number }[]): number {
  return assets.reduce((total, asset) => total + asset.bytes, 0);
}

function loadNextBundledFontKit(webRoot: string): FontFromBuffer {
  const require = createRequire(import.meta.url);
  const nextPackagePath = require.resolve("next/package.json", {
    paths: [webRoot],
  });
  const fontKitPath = path.join(
    path.dirname(nextPackagePath),
    "dist/compiled/@next/font/dist/fontkit",
  );
  const loadedModule = require(fontKitPath) as {
    default?: unknown;
  };
  const candidate = loadedModule.default;

  if (typeof candidate !== "function") {
    throw new Error("Next.js bundled fontkit did not expose a font loader.");
  }

  return candidate as FontFromBuffer;
}

function assertAxis(
  errors: string[],
  asset: { id: string },
  axis: FontKitAxis | undefined,
  expected: { min: number; default: number; max: number },
  tag: string,
): void {
  addError(
    errors,
    axis?.min === expected.min &&
      axis.default === expected.default &&
      axis.max === expected.max,
    `${asset.id}: ${tag} axis is not ${expected.min}/${expected.default}/${expected.max}.`,
  );
}

function missingGlyphs(font: FontKitFont, characters: string): string[] {
  return [...new Set(characters)]
    .map((character) => ({
      character,
      codePoint: character.codePointAt(0),
    }))
    .filter(
      (candidate): candidate is { character: string; codePoint: number } =>
        candidate.codePoint !== undefined,
    )
    .filter((candidate) => !font.hasGlyphForCodePoint(candidate.codePoint))
    .map(
      ({ character, codePoint }) =>
        `${character} (U+${codePoint.toString(16).toUpperCase().padStart(4, "0")})`,
    );
}

function inspectBulgarianLocalizedForms(font: FontKitFont): {
  hasBgrLanguageSystem: boolean;
  hasLoclFeature: boolean;
  substitutionCount: number;
} {
  // Accessing availableFeatures asks fontkit to decode the layout tables.
  void font.availableFeatures;
  const gsub = font._tables.GSUB;
  const cyrillicScript = gsub?.scriptList.find(
    (script) => script.tag === "cyrl",
  );
  const bgrLanguageSystem = cyrillicScript?.script.langSysRecords.find(
    (languageSystem) => languageSystem.tag === "BGR ",
  );
  const localizedFeatureIndexes =
    bgrLanguageSystem?.langSys.featureIndexes.filter(
      (featureIndex) => gsub?.featureList[featureIndex]?.tag === "locl",
    ) ?? [];
  const substitutionCount = localizedFeatureIndexes.reduce(
    (total, featureIndex) => {
      const feature = gsub?.featureList[featureIndex];
      if (!feature || !gsub) return total;

      return (
        total +
        feature.feature.lookupListIndexes.reduce((lookupTotal, lookupIndex) => {
          const lookup = gsub.lookupList.get(lookupIndex);
          return (
            lookupTotal +
            lookup.subTables.reduce(
              (subtableTotal, subtable) =>
                subtableTotal +
                (subtable.extension?.glyphCount ??
                  subtable.extension?.coverage?.glyphCount ??
                  0),
              0,
            )
          );
        }, 0)
      );
    },
    0,
  );

  return {
    hasBgrLanguageSystem: Boolean(bgrLanguageSystem),
    hasLoclFeature: localizedFeatureIndexes.length > 0,
    substitutionCount,
  };
}

function inspectBulgarianShaping(
  errors: string[],
  asset: TypographyFontAssetV1,
  font: FontKitFont,
): void {
  const observation: BulgarianShapingObservation = {
    defaultGlyphs: font.layout(BULGARIAN_SHAPING_SAMPLE, undefined, "cyrl")
      .glyphs,
    russianGlyphs: font.layout(
      BULGARIAN_SHAPING_SAMPLE,
      undefined,
      "cyrl",
      "RUS ",
    ).glyphs,
    bulgarianGlyphs: font.layout(
      BULGARIAN_SHAPING_SAMPLE,
      undefined,
      "cyrl",
      "BGR ",
    ).glyphs,
  };

  for (const failure of evaluateBulgarianShapingObservation(observation)) {
    errors.push(
      `${asset.id}: Bulgarian locl shaping failed (${failure}) for ${BULGARIAN_SHAPING_SAMPLE}.`,
    );
  }
}

function inspectOpenTypeAsset(
  errors: string[],
  asset: TypographyFontAssetV1,
  buffer: Buffer,
  fontFromBuffer: FontFromBuffer,
): FontKitFont | null {
  try {
    const font = fontFromBuffer(buffer);
    const expectedStyle = asset.style === "italic" ? "Italic" : "Regular";
    const expectedPostscriptName =
      asset.style === "italic" ? "GoogleSans-Italic" : "GoogleSans-Regular";

    addError(
      errors,
      font.familyName === GOOGLE_SANS_ASSET_MANIFEST.binary.family,
      `${asset.id}: embedded family is ${font.familyName}.`,
    );
    addError(
      errors,
      font.subfamilyName === expectedStyle,
      `${asset.id}: embedded style is ${font.subfamilyName}, expected ${expectedStyle}.`,
    );
    addError(
      errors,
      font.postscriptName === expectedPostscriptName,
      `${asset.id}: embedded PostScript name is ${font.postscriptName}.`,
    );
    addError(
      errors,
      font.version === GOOGLE_SANS_ASSET_MANIFEST.binary.version,
      `${asset.id}: embedded version is ${font.version}.`,
    );
    addError(
      errors,
      font.copyright === GOOGLE_SANS_ASSET_MANIFEST.binary.copyright,
      `${asset.id}: embedded copyright drifted.`,
    );
    addError(
      errors,
      font.unitsPerEm === GOOGLE_SANS_ASSET_MANIFEST.binary.unitsPerEm,
      `${asset.id}: unitsPerEm is ${font.unitsPerEm}.`,
    );

    const axisTags = Object.keys(font.variationAxes).sort();
    addError(
      errors,
      axisTags.join(",") === "opsz,wght",
      `${asset.id}: retained axes are ${axisTags.join(",") || "none"}; GRAD must be pinned at 0 and omitted.`,
    );
    assertAxis(
      errors,
      asset,
      font.variationAxes.opsz,
      GOOGLE_SANS_ASSET_MANIFEST.axes.opticalSize,
      "opsz",
    );
    assertAxis(
      errors,
      asset,
      font.variationAxes.wght,
      GOOGLE_SANS_ASSET_MANIFEST.axes.weight,
      "wght",
    );

    const coverage =
      asset.subset === "latin"
        ? "OverGarden Solanum lycopersicum 0123456789"
        : asset.subset === "latin-ext"
          ? "ČŽ"
          : asset.subset === "cyrillic"
            ? "Ґґ Єє Її Йй Българска градина щъркел ъгъл Ѝѝ Цц Чч Ёёжик подъём объём Ыы Ээ №"
            : "₴ Ѣѣ";
    const missing = missingGlyphs(font, coverage);
    addError(
      errors,
      missing.length === 0,
      `${asset.id}: missing representative glyphs ${missing.join(", ")}.`,
    );

    if (asset.subset === "cyrillic") {
      const localizedForms = inspectBulgarianLocalizedForms(font);
      addError(
        errors,
        localizedForms.hasBgrLanguageSystem,
        `${asset.id}: cyrl/BGR language system is missing.`,
      );
      addError(
        errors,
        localizedForms.hasLoclFeature,
        `${asset.id}: Bulgarian locl feature is missing.`,
      );
      addError(
        errors,
        localizedForms.substitutionCount >= 23,
        `${asset.id}: Bulgarian locl has only ${localizedForms.substitutionCount} substitutions.`,
      );
      inspectBulgarianShaping(errors, asset, font);
    }

    return font;
  } catch (error) {
    errors.push(
      `${asset.id}: OpenType inspection failed: ${error instanceof Error ? error.message : String(error)}.`,
    );
    return null;
  }
}

function inspectGeistMonoOpenTypeAsset(
  errors: string[],
  asset: GeistMonoFontAssetV1,
  buffer: Buffer,
  fontFromBuffer: FontFromBuffer,
): void {
  const label = `Geist Mono ${asset.id}`;

  try {
    const font = fontFromBuffer(buffer);

    addError(
      errors,
      font.familyName === GEIST_MONO_ASSET_MANIFEST.binary.family,
      `${label}: embedded family is ${font.familyName}.`,
    );
    addError(
      errors,
      font.subfamilyName === GEIST_MONO_ASSET_MANIFEST.binary.style,
      `${label}: embedded style is ${font.subfamilyName}.`,
    );
    addError(
      errors,
      font.postscriptName === GEIST_MONO_ASSET_MANIFEST.binary.postscriptName,
      `${label}: embedded PostScript name is ${font.postscriptName}.`,
    );
    addError(
      errors,
      font.version === GEIST_MONO_ASSET_MANIFEST.binary.version,
      `${label}: embedded version is ${font.version}.`,
    );
    addError(
      errors,
      font.copyright === GEIST_MONO_ASSET_MANIFEST.binary.copyright,
      `${label}: embedded copyright drifted.`,
    );
    addError(
      errors,
      font.unitsPerEm === GEIST_MONO_ASSET_MANIFEST.binary.unitsPerEm,
      `${label}: unitsPerEm is ${font.unitsPerEm}.`,
    );

    const axisTags = Object.keys(font.variationAxes).sort();
    addError(
      errors,
      axisTags.join(",") === "wght",
      `${label}: retained axes are ${axisTags.join(",") || "none"}; only wght is allowed.`,
    );
    assertAxis(
      errors,
      { id: label },
      font.variationAxes.wght,
      GEIST_MONO_ASSET_MANIFEST.axes.weight,
      "wght",
    );

    const coverage =
      asset.subset === "latin"
        ? "OverGarden code 0123456789"
        : asset.subset === "latin-ext"
          ? "ČŽ"
          : asset.subset === "cyrillic"
            ? "Ґґ Єє Її Йй Българска щъркел Ѝѝ Ёё №"
            : asset.subset === "cyrillic-ext"
              ? "₴ Ѣѣ"
              : asset.subset === "symbols2"
                ? "─│┌┐└┘█▒"
                : "ĂăĐđŨũƠơƯưẠạ";
    const missing = missingGlyphs(font, coverage);
    addError(
      errors,
      missing.length === 0,
      `${label}: missing representative glyphs ${missing.join(", ")}.`,
    );
  } catch (error) {
    errors.push(
      `${label}: OpenType inspection failed: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

function inspectAverageWidth(errors: string[], font: FontKitFont | null): void {
  if (!font) return;

  const glyphs = font.glyphsForString(NEXT_AVERAGE_WIDTH_CHARACTERS);
  const hasAllCharacters = glyphs
    .flatMap((glyph) => glyph.codePoints)
    .every((codePoint) => font.hasGlyphForCodePoint(codePoint));
  const averageWidth =
    glyphs.reduce((total, glyph) => total + glyph.advanceWidth, 0) /
    glyphs.length;

  addError(
    errors,
    hasAllCharacters,
    "normal-latin: fallback average-width corpus is incomplete.",
  );
  addError(
    errors,
    Math.abs(
      averageWidth - GOOGLE_SANS_ASSET_MANIFEST.fallback.azAverageWidth,
    ) < Number.EPSILON,
    `normal-latin: azAvgWidth is ${averageWidth}.`,
  );

  const fallback = GOOGLE_SANS_ASSET_MANIFEST.fallback;
  addError(
    errors,
    fallback.sourceFamily === PINNED_ARIAL_FALLBACK_METRICS.family &&
      fallback.sourceAzAverageWidth ===
        PINNED_ARIAL_FALLBACK_METRICS.azAverageWidth &&
      fallback.sourceUnitsPerEm === PINNED_ARIAL_FALLBACK_METRICS.unitsPerEm,
    "normal-latin: pinned Arial fallback baseline drifted.",
  );

  const calculatedFallback = calculateMetricCompatibleFallback({
    targetAzAverageWidth: averageWidth,
    targetUnitsPerEm: font.unitsPerEm,
    targetAscent: font.ascent,
    targetDescent: font.descent,
    targetLineGap: font.lineGap,
    sourceAzAverageWidth: PINNED_ARIAL_FALLBACK_METRICS.azAverageWidth,
    sourceUnitsPerEm: PINNED_ARIAL_FALLBACK_METRICS.unitsPerEm,
  });
  addError(
    errors,
    calculatedFallback.sizeAdjust === fallback.sizeAdjust,
    `normal-latin: calculated size-adjust is ${calculatedFallback.sizeAdjust} from ratio ${calculatedFallback.sizeAdjustRatio}.`,
  );
  addError(
    errors,
    calculatedFallback.ascentOverride === fallback.ascentOverride,
    `normal-latin: calculated ascent-override is ${calculatedFallback.ascentOverride} from ascent ${font.ascent}/${font.unitsPerEm}.`,
  );
  addError(
    errors,
    calculatedFallback.descentOverride === fallback.descentOverride,
    `normal-latin: calculated descent-override is ${calculatedFallback.descentOverride} from descent ${font.descent}/${font.unitsPerEm}.`,
  );
  addError(
    errors,
    calculatedFallback.lineGapOverride === fallback.lineGapOverride,
    `normal-latin: calculated line-gap-override is ${calculatedFallback.lineGapOverride} from line gap ${font.lineGap}/${font.unitsPerEm}.`,
  );
}

function inspectGeistMonoManifest(errors: string[]): {
  assetCount: number;
  totalBytes: number;
  preloadPaths: string[];
} {
  const manifest = GEIST_MONO_ASSET_MANIFEST;
  const expectedIds = [
    "normal-cyrillic-ext",
    "normal-cyrillic",
    "normal-symbols2",
    "normal-vietnamese",
    "normal-latin-ext",
    "normal-latin",
  ];
  const ids = manifest.assets.map((asset) => asset.id);

  addError(
    errors,
    manifest.contractVersion === "TypographyAssetManifestV1",
    "Geist Mono manifest contract version drifted.",
  );
  addError(
    errors,
    ids.join(",") === expectedIds.join(","),
    `Geist Mono manifest variants/order are ${ids.join(",")}.`,
  );
  addError(
    errors,
    new Set(ids).size === ids.length,
    "Geist Mono manifest contains duplicate asset ids.",
  );
  addError(
    errors,
    manifest.loading.strategy === "demand-only" &&
      manifest.loading.preloadCount === 0 &&
      GEIST_MONO_PRELOAD_ASSETS.length === 0 &&
      manifest.assets.every((asset) => !asset.preload),
    "Geist Mono must remain demand-loaded with no preload assets.",
  );

  for (const asset of manifest.assets) {
    const source = new URL(asset.sourceUrl);
    const fileName = path.basename(asset.repositoryPath);
    const label = `Geist Mono ${asset.id}`;

    addError(
      errors,
      source.protocol === "https:" &&
        source.hostname === "fonts.gstatic.com" &&
        source.pathname.startsWith("/s/geistmono/v6/") &&
        source.search === "" &&
        source.hash === "",
      `${label}: source URL is outside the pinned Google Fonts v6 allowlist.`,
    );
    addError(
      errors,
      fileName === path.basename(asset.publicPath),
      `${label}: public and repository filenames differ.`,
    );
    addError(
      errors,
      fileName ===
        `geist-mono-v6-${asset.style}-${asset.subset}-${asset.sha256.slice(0, 16)}.woff2`,
      `${label}: filename is not content-hashed from its SHA-256.`,
    );
    addError(
      errors,
      asset.style === "normal" &&
        asset.weight[0] === 100 &&
        asset.weight[1] === 900,
      `${label}: expected the official normal 100..900 variable face.`,
    );
    addError(
      errors,
      asset.contentType === "font/woff2",
      `${label}: content type must be font/woff2.`,
    );
    addError(
      errors,
      asset.cacheControl === "public, max-age=31536000, immutable",
      `${label}: immutable one-year cache contract drifted.`,
    );
  }

  return {
    assetCount: manifest.assets.length,
    totalBytes: sumBytes(manifest.assets),
    preloadPaths: GEIST_MONO_PRELOAD_ASSETS.map((asset) => asset.publicPath),
  };
}

function inspectManifest(errors: string[]): GoogleSansVerificationReport {
  const manifest = GOOGLE_SANS_ASSET_MANIFEST;
  const expectedIds = [
    "normal-cyrillic-ext",
    "normal-cyrillic",
    "normal-latin-ext",
    "normal-latin",
    "italic-cyrillic-ext",
    "italic-cyrillic",
    "italic-latin-ext",
    "italic-latin",
  ];
  const ids = manifest.assets.map((asset) => asset.id);
  const normalAssets = manifest.assets.filter(
    (asset) => asset.style === "normal",
  );
  const italicAssets = manifest.assets.filter(
    (asset) => asset.style === "italic",
  );
  const normalCoreBytes = sumBytes([
    assetById("normal-latin"),
    assetById("normal-cyrillic"),
  ]);
  const normalLatinExtendedBytes =
    normalCoreBytes + assetById("normal-latin-ext").bytes;
  const normalCyrillicExtendedBytes =
    normalCoreBytes + assetById("normal-cyrillic-ext").bytes;
  const normalAllSubsetsBytes = sumBytes(normalAssets);
  const italicAllSubsetsBytes = sumBytes(italicAssets);
  const geistMono = inspectGeistMonoManifest(errors);

  addError(
    errors,
    manifest.contractVersion === "TypographyAssetManifestV1",
    "Manifest contract version drifted.",
  );
  addError(
    errors,
    ids.join(",") === expectedIds.join(","),
    `Manifest variants/order are ${ids.join(",")}.`,
  );
  addError(
    errors,
    new Set(ids).size === ids.length,
    "Manifest contains duplicate asset ids.",
  );
  addError(
    errors,
    JSON.stringify(
      manifest.assets.map(
        ({
          id,
          style,
          subset,
          weight,
          opticalSize,
          grade,
          unicodeRange,
          publicPath,
          contentType,
          cacheControl,
          preload,
          preloadOrder,
        }) => ({
          id,
          style,
          subset,
          weight,
          opticalSize,
          grade,
          unicodeRange,
          publicPath,
          contentType,
          cacheControl,
          preload,
          preloadOrder,
        }),
      ),
    ) ===
      JSON.stringify(
        GOOGLE_SANS_RUNTIME_ASSETS.map(
          ({
            id,
            style,
            subset,
            weight,
            opticalSize,
            grade,
            unicodeRange,
            publicPath,
            contentType,
            cacheControl,
            preload,
            preloadOrder,
          }) => ({
            id,
            style,
            subset,
            weight,
            opticalSize,
            grade,
            unicodeRange,
            publicPath,
            contentType,
            cacheControl,
            preload,
            preloadOrder,
          }),
        ),
      ),
    "Browser-safe Google Sans projection drifted from the provenance manifest.",
  );
  addError(
    errors,
    JSON.stringify(manifest.fallback) ===
      JSON.stringify(GOOGLE_SANS_RUNTIME_FALLBACK),
    "Browser-safe fallback metrics drifted from the provenance manifest.",
  );
  addError(
    errors,
    normalCoreBytes <= manifest.budgets.normalCoreMaxBytes,
    `Normal latin+cyrillic budget is ${normalCoreBytes} bytes.`,
  );
  addError(
    errors,
    Math.max(normalLatinExtendedBytes, normalCyrillicExtendedBytes) <=
      manifest.budgets.normalSingleExtendedMaxBytes,
    `Normal single-extended budget is ${Math.max(normalLatinExtendedBytes, normalCyrillicExtendedBytes)} bytes.`,
  );
  addError(
    errors,
    normalAllSubsetsBytes <= manifest.budgets.normalAllSubsetsMaxBytes,
    `All normal subsets total ${normalAllSubsetsBytes} bytes.`,
  );

  const preloadIds = GOOGLE_SANS_PRELOAD_ASSETS.map((asset) => asset.id);
  addError(
    errors,
    preloadIds.join(",") === "normal-cyrillic",
    `Preload allowlist is ${preloadIds.join(",")}.`,
  );
  addError(
    errors,
    manifest.assets.every(
      (asset) =>
        !asset.preload || (asset.style === "normal" && !asset.id.includes("ext")),
    ),
    "Italic or extended assets must not be preloaded.",
  );

  for (const asset of manifest.assets) {
    const source = new URL(asset.sourceUrl);
    const fileName = path.basename(asset.repositoryPath);
    addError(
      errors,
      source.protocol === "https:" &&
        source.hostname === "fonts.gstatic.com" &&
        source.pathname.startsWith("/s/googlesans/v69/") &&
        source.search === "" &&
        source.hash === "",
      `${asset.id}: source URL is outside the pinned Google Fonts v69 allowlist.`,
    );
    addError(
      errors,
      fileName === path.basename(asset.publicPath),
      `${asset.id}: public and repository filenames differ.`,
    );
    addError(
      errors,
      fileName ===
        `google-sans-v69-${asset.style}-${asset.subset}-${asset.sha256.slice(0, 16)}.woff2`,
      `${asset.id}: filename is not content-hashed from its SHA-256.`,
    );
    addError(
      errors,
      asset.contentType === "font/woff2",
      `${asset.id}: content type must be font/woff2.`,
    );
    addError(
      errors,
      asset.cacheControl === "public, max-age=31536000, immutable",
      `${asset.id}: immutable one-year cache contract drifted.`,
    );
  }

  return {
    assetCount: manifest.assets.length,
    totalBytes: sumBytes(manifest.assets),
    normalCoreBytes,
    normalLatinExtendedBytes,
    normalCyrillicExtendedBytes,
    normalAllSubsetsBytes,
    italicAllSubsetsBytes,
    preloadPaths: GOOGLE_SANS_PRELOAD_ASSETS.map((asset) => asset.publicPath),
    geistMonoAssetCount: geistMono.assetCount,
    geistMonoTotalBytes: geistMono.totalBytes,
    geistMonoPreloadPaths: geistMono.preloadPaths,
    errors,
  };
}

async function inspectLicense(
  errors: string[],
  webRoot: string,
  io: GoogleSansVerifierIo,
): Promise<void> {
  const license = GOOGLE_SANS_ASSET_MANIFEST.license;
  const licensePath = path.resolve(webRoot, license.repositoryPath);
  addError(
    errors,
    !license.repositoryPath.startsWith("public/"),
    "The OFL license must stay outside the runtime public directory.",
  );

  try {
    const buffer = await io.readFile(licensePath);
    const text = buffer.toString("utf8");
    addError(
      errors,
      buffer.byteLength === license.bytes,
      `OFL license is ${buffer.byteLength} bytes, expected ${license.bytes}.`,
    );
    addError(
      errors,
      sha256(buffer) === license.sha256,
      "OFL license SHA-256 drifted from the official Google Fonts download manifest.",
    );
    addError(
      errors,
      text.includes("SIL OPEN FONT LICENSE Version 1.1") &&
        text.includes("PERMISSION & CONDITIONS") &&
        text.includes('THE FONT SOFTWARE IS PROVIDED "AS IS"'),
      "OFL license content is incomplete.",
    );
  } catch (error) {
    errors.push(
      `OFL license cannot be read: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

async function inspectGeistMonoLicense(
  errors: string[],
  webRoot: string,
  io: GoogleSansVerifierIo,
): Promise<void> {
  const license = GEIST_MONO_ASSET_MANIFEST.license;
  const licensePath = path.resolve(webRoot, license.repositoryPath);
  addError(
    errors,
    !license.repositoryPath.startsWith("public/"),
    "The Geist Mono OFL license must stay outside the runtime public directory.",
  );

  try {
    const buffer = await io.readFile(licensePath);
    const text = buffer.toString("utf8");
    addError(
      errors,
      buffer.byteLength === license.bytes,
      `Geist Mono OFL license is ${buffer.byteLength} bytes, expected ${license.bytes}.`,
    );
    addError(
      errors,
      sha256(buffer) === license.sha256,
      "Geist Mono OFL license SHA-256 drifted from the official Google Fonts download manifest.",
    );
    addError(
      errors,
      text.includes("Copyright 2024 The Geist Project Authors") &&
        text.includes("SIL OPEN FONT LICENSE Version 1.1") &&
        text.includes("PERMISSION & CONDITIONS") &&
        text.includes('THE FONT SOFTWARE IS PROVIDED "AS IS"'),
      "Geist Mono OFL license content is incomplete.",
    );
  } catch (error) {
    errors.push(
      `Geist Mono OFL license cannot be read: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

async function inspectGeneratedCss(
  errors: string[],
  webRoot: string,
  io: GoogleSansVerifierIo,
): Promise<void> {
  const cssPath = path.resolve(webRoot, GENERATED_CSS_REPOSITORY_PATH);

  try {
    const css = (await io.readFile(cssPath)).toString("utf8");
    const expectedCss = await format(GOOGLE_SANS_FONT_FACE_CSS, {
      parser: "css",
    });
    addError(
      errors,
      css === expectedCss,
      `${GENERATED_CSS_REPOSITORY_PATH} is not the deterministic contract output; run the verifier with --write.`,
    );
    addError(
      errors,
      !/https?:\/\//u.test(css) && !/@import\b/u.test(css),
      "Generated font CSS must not contain remote URLs or imports.",
    );
    addError(
      errors,
      (css.match(/@font-face\s*\{/gu) ?? []).length === 9,
      "Generated font CSS must contain eight assets and one fallback face.",
    );
    addError(
      errors,
      (css.match(/font-display:\s*swap;/gu) ?? []).length === 8,
      "Every Google Sans asset must use font-display: swap.",
    );
    addError(
      errors,
      !/font-style:\s*oblique/gu.test(css),
      "Generated font CSS must never synthesize italics with oblique styles.",
    );

    for (const asset of GOOGLE_SANS_ASSET_MANIFEST.assets) {
      addError(
        errors,
        css.split(asset.publicPath).length === 2,
        `${asset.id}: generated CSS must reference its same-origin path exactly once.`,
      );
    }
  } catch (error) {
    errors.push(
      `${GENERATED_CSS_REPOSITORY_PATH} cannot be read: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

async function inspectGeistMonoGeneratedCss(
  errors: string[],
  webRoot: string,
  io: GoogleSansVerifierIo,
): Promise<void> {
  const cssPath = path.resolve(
    webRoot,
    GEIST_MONO_GENERATED_CSS_REPOSITORY_PATH,
  );

  try {
    const css = (await io.readFile(cssPath)).toString("utf8");
    const expectedCss = await format(GEIST_MONO_FONT_FACE_CSS, {
      parser: "css",
    });
    addError(
      errors,
      css === expectedCss,
      `${GEIST_MONO_GENERATED_CSS_REPOSITORY_PATH} is not the deterministic contract output; run the verifier with --write.`,
    );
    addError(
      errors,
      !/https?:\/\//u.test(css) && !/@import\b/u.test(css),
      "Generated Geist Mono CSS must not contain remote URLs or imports.",
    );
    addError(
      errors,
      (css.match(/@font-face\s*\{/gu) ?? []).length === 6,
      "Generated Geist Mono CSS must contain exactly six subset faces.",
    );
    addError(
      errors,
      (css.match(/font-display:\s*swap;/gu) ?? []).length === 6,
      "Every Geist Mono asset must use font-display: swap.",
    );
    addError(
      errors,
      (css.match(/font-style:\s*normal;/gu) ?? []).length === 6 &&
        !/font-style:\s*(?:italic|oblique)/gu.test(css),
      "Geist Mono CSS must expose only the official normal variable face.",
    );

    for (const asset of GEIST_MONO_ASSET_MANIFEST.assets) {
      addError(
        errors,
        css.split(asset.publicPath).length === 2,
        `Geist Mono ${asset.id}: generated CSS must reference its same-origin path exactly once.`,
      );
    }
  } catch (error) {
    errors.push(
      `${GEIST_MONO_GENERATED_CSS_REPOSITORY_PATH} cannot be read: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

async function inspectAssets(
  errors: string[],
  webRoot: string,
  io: GoogleSansVerifierIo,
): Promise<void> {
  const fontDirectory = path.resolve(webRoot, FONT_DIRECTORY_REPOSITORY_PATH);
  const expectedFileNames = GOOGLE_SANS_ASSET_MANIFEST.assets
    .map((asset) => path.basename(asset.repositoryPath))
    .sort();

  try {
    const actualFileNames = (await io.readdir(fontDirectory)).sort();
    addError(
      errors,
      actualFileNames.join(",") === expectedFileNames.join(","),
      `Font directory allowlist drifted: ${actualFileNames.join(",")}.`,
    );
  } catch (error) {
    errors.push(
      `Font directory cannot be read: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }

  let fontFromBuffer: FontFromBuffer | null = null;
  try {
    fontFromBuffer = loadNextBundledFontKit(webRoot);
  } catch (error) {
    errors.push(
      `OpenType verifier is unavailable: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }

  for (const asset of GOOGLE_SANS_ASSET_MANIFEST.assets) {
    const assetPath = path.resolve(webRoot, asset.repositoryPath);
    addError(
      errors,
      path.dirname(assetPath) === fontDirectory,
      `${asset.id}: repository path escapes the pinned font directory.`,
    );

    try {
      const buffer = await io.readFile(assetPath);
      addError(
        errors,
        buffer.byteLength === asset.bytes,
        `${asset.id}: ${buffer.byteLength} bytes, expected ${asset.bytes}.`,
      );
      addError(
        errors,
        sha256(buffer) === asset.sha256,
        `${asset.id}: SHA-256 does not match the official pinned asset.`,
      );
      addError(
        errors,
        buffer.subarray(0, 4).toString("ascii") === "wOF2",
        `${asset.id}: missing WOFF2 magic.`,
      );

      if (fontFromBuffer) {
        const font = inspectOpenTypeAsset(
          errors,
          asset,
          buffer,
          fontFromBuffer,
        );
        if (asset.id === "normal-latin") inspectAverageWidth(errors, font);
      }
    } catch (error) {
      errors.push(
        `${asset.id}: asset cannot be read: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }
}

async function inspectGeistMonoAssets(
  errors: string[],
  webRoot: string,
  io: GoogleSansVerifierIo,
): Promise<void> {
  const fontDirectory = path.resolve(
    webRoot,
    GEIST_MONO_FONT_DIRECTORY_REPOSITORY_PATH,
  );
  const expectedFileNames = GEIST_MONO_ASSET_MANIFEST.assets
    .map((asset) => path.basename(asset.repositoryPath))
    .sort();

  try {
    const actualFileNames = (await io.readdir(fontDirectory)).sort();
    addError(
      errors,
      actualFileNames.join(",") === expectedFileNames.join(","),
      `Geist Mono font directory allowlist drifted: ${actualFileNames.join(",")}.`,
    );
  } catch (error) {
    errors.push(
      `Geist Mono font directory cannot be read: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }

  let fontFromBuffer: FontFromBuffer | null = null;
  try {
    fontFromBuffer = loadNextBundledFontKit(webRoot);
  } catch (error) {
    errors.push(
      `Geist Mono OpenType verifier is unavailable: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }

  for (const asset of GEIST_MONO_ASSET_MANIFEST.assets) {
    const assetPath = path.resolve(webRoot, asset.repositoryPath);
    const label = `Geist Mono ${asset.id}`;
    addError(
      errors,
      path.dirname(assetPath) === fontDirectory,
      `${label}: repository path escapes the pinned font directory.`,
    );

    try {
      const buffer = await io.readFile(assetPath);
      addError(
        errors,
        buffer.byteLength === asset.bytes,
        `${label}: ${buffer.byteLength} bytes, expected ${asset.bytes}.`,
      );
      addError(
        errors,
        sha256(buffer) === asset.sha256,
        `${label}: SHA-256 does not match the official pinned asset.`,
      );
      addError(
        errors,
        buffer.subarray(0, 4).toString("ascii") === "wOF2",
        `${label}: missing WOFF2 magic.`,
      );

      if (fontFromBuffer) {
        inspectGeistMonoOpenTypeAsset(errors, asset, buffer, fontFromBuffer);
      }
    } catch (error) {
      errors.push(
        `${label}: asset cannot be read: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }
}

export function sourceReferencesNextFontGoogle(source: string): boolean {
  return source.includes("next/font/google");
}

export function sourceReferencesExternalGoogleFontHost(
  source: string,
): boolean {
  return EXTERNAL_GOOGLE_FONT_HOST_PATTERN.test(source);
}

export function sourceReferencesUnsupportedGoogleSansWeight(
  source: string,
): boolean {
  if (UNSUPPORTED_GOOGLE_SANS_WEIGHT_CLASS_PATTERN.test(source)) return true;
  return [...source.matchAll(NUMERIC_FONT_WEIGHT_PATTERN)].some((match) => {
    const weight = Number(match[1]);
    return weight < 400 || weight > 700;
  });
}

function isRuntimeSourceFile(filePath: string): boolean {
  return (
    RUNTIME_SOURCE_EXTENSIONS.has(path.extname(filePath)) &&
    !/(?:\.test|\.spec)\.[cm]?[jt]sx?$/u.test(filePath)
  );
}

export async function findNextFontGoogleRuntimeImports(
  webRoot = DEFAULT_WEB_ROOT,
): Promise<string[]> {
  const resolvedWebRoot = path.resolve(webRoot);
  const sourceRoot = path.resolve(resolvedWebRoot, "src");
  const matches: string[] = [];

  async function walk(directoryPath: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") await walk(entryPath);
        continue;
      }
      if (!entry.isFile() || !isRuntimeSourceFile(entryPath)) continue;

      const source = await readFile(entryPath, "utf8");
      if (sourceReferencesNextFontGoogle(source)) {
        matches.push(path.relative(resolvedWebRoot, entryPath));
      }
    }
  }

  await walk(sourceRoot);
  return matches.sort();
}

export async function verifyNoNextFontGoogleRuntimeImports(
  webRoot = DEFAULT_WEB_ROOT,
): Promise<string[]> {
  const matches = await findNextFontGoogleRuntimeImports(webRoot);
  if (matches.length > 0) {
    throw new Error(
      `Runtime source still references next/font/google:\n- ${matches.join("\n- ")}`,
    );
  }
  return matches;
}

export async function findUnsupportedGoogleSansRuntimeWeights(
  webRoot = DEFAULT_WEB_ROOT,
): Promise<string[]> {
  const resolvedWebRoot = path.resolve(webRoot);
  const sourceRoot = path.resolve(resolvedWebRoot, "src");
  const matches: string[] = [];

  async function walk(directoryPath: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") await walk(entryPath);
        continue;
      }
      if (!entry.isFile() || !isRuntimeSourceFile(entryPath)) continue;
      const relativePath = path.relative(resolvedWebRoot, entryPath);
      if (relativePath === GEIST_MONO_GENERATED_CSS_REPOSITORY_PATH) continue;
      const source = await readFile(entryPath, "utf8");
      if (sourceReferencesUnsupportedGoogleSansWeight(source)) {
        matches.push(relativePath);
      }
    }
  }

  await walk(sourceRoot);
  return matches.sort();
}

export async function verifyGoogleSansRuntimeWeights(
  webRoot = DEFAULT_WEB_ROOT,
): Promise<string[]> {
  const matches = await findUnsupportedGoogleSansRuntimeWeights(webRoot);
  if (matches.length > 0) {
    throw new Error(
      `Runtime source uses proportional weights outside Google Sans 400..700:\n- ${matches.join("\n- ")}`,
    );
  }
  return matches;
}

export async function findExternalGoogleFontBuiltRuntimeReferences(
  webRoot = DEFAULT_WEB_ROOT,
): Promise<string[]> {
  const resolvedWebRoot = path.resolve(webRoot);
  const roots = [
    path.resolve(resolvedWebRoot, ".next/static"),
    path.resolve(resolvedWebRoot, ".next/server/app"),
  ];
  const matches: string[] = [];

  async function walk(directoryPath: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (
        !entry.isFile() ||
        !BUILT_BROWSER_EXTENSIONS.has(path.extname(entryPath))
      ) {
        continue;
      }
      const source = await readFile(entryPath, "utf8");
      if (sourceReferencesExternalGoogleFontHost(source)) {
        matches.push(path.relative(resolvedWebRoot, entryPath));
      }
    }
  }

  for (const root of roots) {
    try {
      await walk(root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(
          `Production build output is missing at ${path.relative(resolvedWebRoot, root)}.`,
        );
      }
      throw error;
    }
  }
  return matches.sort();
}

export async function verifyNoExternalGoogleFontBuiltRuntimeReferences(
  webRoot = DEFAULT_WEB_ROOT,
): Promise<string[]> {
  const matches = await findExternalGoogleFontBuiltRuntimeReferences(webRoot);
  if (matches.length > 0) {
    throw new Error(
      `Built browser runtime contains external Google font hosts:\n- ${matches.join("\n- ")}`,
    );
  }
  return matches;
}

export async function inspectGoogleSansAssetContract(
  options: GoogleSansVerifierOptions = {},
): Promise<GoogleSansVerificationReport> {
  const webRoot = path.resolve(options.webRoot ?? DEFAULT_WEB_ROOT);
  const io = options.io ?? DEFAULT_IO;
  const errors: string[] = [];
  const report = inspectManifest(errors);

  await Promise.all([
    inspectLicense(errors, webRoot, io),
    inspectGeneratedCss(errors, webRoot, io),
    inspectAssets(errors, webRoot, io),
    inspectGeistMonoLicense(errors, webRoot, io),
    inspectGeistMonoGeneratedCss(errors, webRoot, io),
    inspectGeistMonoAssets(errors, webRoot, io),
  ]);

  return report;
}

export async function verifyGoogleSansAssetContract(
  options: GoogleSansVerifierOptions = {},
): Promise<GoogleSansVerificationReport> {
  const report = await inspectGoogleSansAssetContract(options);
  if (report.errors.length > 0) {
    throw new Error(
      `Google Sans asset verification failed:\n- ${report.errors.join("\n- ")}`,
    );
  }
  return report;
}

export async function writeGeneratedGoogleSansCss(
  webRoot = DEFAULT_WEB_ROOT,
): Promise<string> {
  const cssPath = path.resolve(webRoot, GENERATED_CSS_REPOSITORY_PATH);
  const formattedCss = await format(GOOGLE_SANS_FONT_FACE_CSS, {
    parser: "css",
  });
  await writeFile(cssPath, formattedCss, "utf8");
  return cssPath;
}

export async function writeGeneratedGeistMonoCss(
  webRoot = DEFAULT_WEB_ROOT,
): Promise<string> {
  const cssPath = path.resolve(
    webRoot,
    GEIST_MONO_GENERATED_CSS_REPOSITORY_PATH,
  );
  const formattedCss = await format(GEIST_MONO_FONT_FACE_CSS, {
    parser: "css",
  });
  await writeFile(cssPath, formattedCss, "utf8");
  return cssPath;
}

export async function writeGeneratedTypographyCss(
  webRoot = DEFAULT_WEB_ROOT,
): Promise<string[]> {
  return Promise.all([
    writeGeneratedGoogleSansCss(webRoot),
    writeGeneratedGeistMonoCss(webRoot),
  ]);
}

function printSummary(report: GoogleSansVerificationReport): void {
  console.log(
    `OVE-208 Google Sans asset contract OK: ${report.assetCount} official v69 WOFF2 files, ${report.totalBytes} bytes.`,
  );
  console.log(
    `Normal budgets: core=${report.normalCoreBytes}; +latin-ext=${report.normalLatinExtendedBytes}; +cyrillic-ext=${report.normalCyrillicExtendedBytes}; all=${report.normalAllSubsetsBytes}.`,
  );
  console.log(
    `Italic remains lazy (${report.italicAllSubsetsBytes} bytes); preloads=${report.preloadPaths.join(",")}.`,
  );
  console.log(
    `Binary=${GOOGLE_SANS_ASSET_MANIFEST.binary.version}; family=${GOOGLE_SANS_FAMILY}; license=${GOOGLE_SANS_ASSET_MANIFEST.license.spdx}.`,
  );
  console.log(
    `Geist Mono demand-only assets=${report.geistMonoAssetCount}; bytes=${report.geistMonoTotalBytes}; preloads=${report.geistMonoPreloadPaths.length}.`,
  );
  console.log(
    `Geist Mono binary=${GEIST_MONO_ASSET_MANIFEST.binary.version}; family=${GEIST_MONO_FAMILY}; license=${GEIST_MONO_ASSET_MANIFEST.license.spdx}.`,
  );
}

async function main(): Promise<void> {
  if (process.argv.includes("--write")) {
    const cssPaths = await writeGeneratedTypographyCss();
    for (const cssPath of cssPaths) {
      console.log(`Generated ${path.relative(DEFAULT_WEB_ROOT, cssPath)}.`);
    }
  }

  const report = await verifyGoogleSansAssetContract();
  await verifyGoogleSansRuntimeWeights();
  console.log(
    "Runtime proportional weight boundary OK: Google Sans usage stays within 400..700.",
  );
  if (process.argv.includes("--runtime-imports")) {
    await verifyNoNextFontGoogleRuntimeImports();
    console.log(
      "Runtime font import boundary OK: src contains no next/font/google references outside tests.",
    );
  }
  if (process.argv.includes("--build-output")) {
    await verifyNoExternalGoogleFontBuiltRuntimeReferences();
    console.log(
      "Built font runtime boundary OK: browser artifacts contain no external Google font host.",
    );
  }
  printSummary(report);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
