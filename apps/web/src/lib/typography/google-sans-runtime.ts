/**
 * Browser-safe projection of the pinned OVE-208 manifest.
 *
 * Keep provenance and upstream URLs in google-sans-contract.ts. Client
 * boundaries (notably global-error.tsx) import this projection so official
 * acquisition metadata never becomes a browser-runtime dependency. The asset
 * verifier checks this generated projection, the tracked CSS, and the full
 * provenance manifest together.
 */

export const GOOGLE_SANS_FAMILY = "Google Sans";
export const GOOGLE_SANS_FALLBACK_FAMILY = "Google Sans Fallback";
export const GOOGLE_SANS_STACK = `"${GOOGLE_SANS_FAMILY}", "${GOOGLE_SANS_FALLBACK_FAMILY}", Arial, sans-serif`;

export type GoogleSansStyle = "normal" | "italic";
export type GoogleSansSubset =
  | "cyrillic-ext"
  | "cyrillic"
  | "latin-ext"
  | "latin";

export interface GoogleSansRuntimeAssetV1 {
  id: `${GoogleSansStyle}-${GoogleSansSubset}`;
  style: GoogleSansStyle;
  subset: GoogleSansSubset;
  weight: readonly [min: 400, max: 700];
  opticalSize: readonly [min: 17, max: 18];
  grade: 0;
  unicodeRange: string;
  publicPath: `/fonts/google-sans/v69/${string}.woff2`;
  contentType: "font/woff2";
  cacheControl: "public, max-age=31536000, immutable";
  preload: boolean;
  preloadOrder: number | null;
}

export const GOOGLE_SANS_RUNTIME_FALLBACK = {
  family: GOOGLE_SANS_FALLBACK_FAMILY,
  sourceFamily: "Arial",
  // Arial is absent on Linux and on some Android builds, and `local()` matches
  // by font name rather than through fontconfig aliasing, so an Arial-only
  // source leaves the face unresolved there: the overrides below never apply
  // and text reflows when the real font swaps in. Liberation Sans and Arimo are
  // metrically identical to Arial, so the same overrides stay correct.
  metricCompatibleFamilies: ["Liberation Sans", "Arimo"] as const,
  azAverageWidth: 463.3953488372093,
  sourceAzAverageWidth: 934.5116279069767,
  sourceUnitsPerEm: 2_048,
  sizeAdjust: "101.55%",
  ascentOverride: "95.12%",
  descentOverride: "28.16%",
  lineGapOverride: "0.00%",
} as const;

const CYRILLIC_EXT_RANGE =
  "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F";
const CYRILLIC_RANGE = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";
const LATIN_EXT_RANGE =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";
const LATIN_RANGE =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

const SHARED_RUNTIME_ASSET_CONTRACT = {
  weight: [400, 700] as const,
  opticalSize: [17, 18] as const,
  grade: 0 as const,
  contentType: "font/woff2" as const,
  cacheControl: "public, max-age=31536000, immutable" as const,
};

export const GOOGLE_SANS_RUNTIME_ASSETS = [
  {
    ...SHARED_RUNTIME_ASSET_CONTRACT,
    id: "normal-cyrillic-ext",
    style: "normal",
    subset: "cyrillic-ext",
    unicodeRange: CYRILLIC_EXT_RANGE,
    publicPath:
      "/fonts/google-sans/v69/google-sans-v69-normal-cyrillic-ext-6afd640338d83475.woff2",
    preload: false,
    preloadOrder: null,
  },
  {
    ...SHARED_RUNTIME_ASSET_CONTRACT,
    id: "normal-cyrillic",
    style: "normal",
    subset: "cyrillic",
    unicodeRange: CYRILLIC_RANGE,
    publicPath:
      "/fonts/google-sans/v69/google-sans-v69-normal-cyrillic-a0c080f0d0cba389.woff2",
    preload: true,
    preloadOrder: 1,
  },
  {
    ...SHARED_RUNTIME_ASSET_CONTRACT,
    id: "normal-latin-ext",
    style: "normal",
    subset: "latin-ext",
    unicodeRange: LATIN_EXT_RANGE,
    publicPath:
      "/fonts/google-sans/v69/google-sans-v69-normal-latin-ext-ccf1c4db8ac323f7.woff2",
    preload: false,
    preloadOrder: null,
  },
  {
    ...SHARED_RUNTIME_ASSET_CONTRACT,
    id: "normal-latin",
    style: "normal",
    subset: "latin",
    unicodeRange: LATIN_RANGE,
    publicPath:
      "/fonts/google-sans/v69/google-sans-v69-normal-latin-73a7f9cfb110ed67.woff2",
    preload: false,
    preloadOrder: null,
  },
  {
    ...SHARED_RUNTIME_ASSET_CONTRACT,
    id: "italic-cyrillic-ext",
    style: "italic",
    subset: "cyrillic-ext",
    unicodeRange: CYRILLIC_EXT_RANGE,
    publicPath:
      "/fonts/google-sans/v69/google-sans-v69-italic-cyrillic-ext-446716d6c1bb5267.woff2",
    preload: false,
    preloadOrder: null,
  },
  {
    ...SHARED_RUNTIME_ASSET_CONTRACT,
    id: "italic-cyrillic",
    style: "italic",
    subset: "cyrillic",
    unicodeRange: CYRILLIC_RANGE,
    publicPath:
      "/fonts/google-sans/v69/google-sans-v69-italic-cyrillic-4d5923050bedeb0b.woff2",
    preload: false,
    preloadOrder: null,
  },
  {
    ...SHARED_RUNTIME_ASSET_CONTRACT,
    id: "italic-latin-ext",
    style: "italic",
    subset: "latin-ext",
    unicodeRange: LATIN_EXT_RANGE,
    publicPath:
      "/fonts/google-sans/v69/google-sans-v69-italic-latin-ext-2ca2b314df183802.woff2",
    preload: false,
    preloadOrder: null,
  },
  {
    ...SHARED_RUNTIME_ASSET_CONTRACT,
    id: "italic-latin",
    style: "italic",
    subset: "latin",
    unicodeRange: LATIN_RANGE,
    publicPath:
      "/fonts/google-sans/v69/google-sans-v69-italic-latin-e55b6b52cd3f2d49.woff2",
    preload: false,
    preloadOrder: null,
  },
] as const satisfies readonly GoogleSansRuntimeAssetV1[];

export const GOOGLE_SANS_PRELOAD_ASSETS = Object.freeze(
  GOOGLE_SANS_RUNTIME_ASSETS.filter((asset) => asset.preload).sort(
    (left, right) => left.preloadOrder - right.preloadOrder,
  ),
);

const GENERATED_CSS_HEADER =
  "/* Generated from GOOGLE_SANS_ASSET_MANIFEST. Verify with scripts/verify-google-sans-assets.ts. */";

function renderFontFace(asset: GoogleSansRuntimeAssetV1): string {
  return `/* ${asset.style} ${asset.subset} */
@font-face {
  font-family: "${GOOGLE_SANS_FAMILY}";
  font-style: ${asset.style};
  font-weight: ${asset.weight[0]} ${asset.weight[1]};
  font-display: swap;
  src: url("${asset.publicPath}") format("woff2");
  unicode-range: ${asset.unicodeRange};
}`;
}

function renderFallbackFontFace(): string {
  return `/* Metric-compatible fallback generated with Next.js local-font weighting. */
@font-face {
  font-family: "${GOOGLE_SANS_FALLBACK_FAMILY}";
  src: ${[
    GOOGLE_SANS_RUNTIME_FALLBACK.sourceFamily,
    ...GOOGLE_SANS_RUNTIME_FALLBACK.metricCompatibleFamilies,
  ]
    .map((family) => `local("${family}")`)
    .join(", ")};
  size-adjust: ${GOOGLE_SANS_RUNTIME_FALLBACK.sizeAdjust};
  ascent-override: ${GOOGLE_SANS_RUNTIME_FALLBACK.ascentOverride};
  descent-override: ${GOOGLE_SANS_RUNTIME_FALLBACK.descentOverride};
  line-gap-override: ${GOOGLE_SANS_RUNTIME_FALLBACK.lineGapOverride};
}`;
}

export const GOOGLE_SANS_FONT_FACE_CSS = `${GENERATED_CSS_HEADER}

${GOOGLE_SANS_RUNTIME_ASSETS.map(renderFontFace).join("\n\n")}

${renderFallbackFontFace()}
`;
