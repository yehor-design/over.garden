import {
  GOOGLE_SANS_FAMILY,
  GOOGLE_SANS_FALLBACK_FAMILY,
  GOOGLE_SANS_FONT_FACE_CSS,
  GOOGLE_SANS_PRELOAD_ASSETS,
  GOOGLE_SANS_STACK,
} from "./google-sans-runtime";

export {
  GOOGLE_SANS_FAMILY,
  GOOGLE_SANS_FALLBACK_FAMILY,
  GOOGLE_SANS_FONT_FACE_CSS,
  GOOGLE_SANS_PRELOAD_ASSETS,
  GOOGLE_SANS_STACK,
};

export type GoogleSansStyle = "normal" | "italic";
export type GoogleSansSubset =
  | "cyrillic-ext"
  | "cyrillic"
  | "latin-ext"
  | "latin";

export interface TypographyFontAssetV1 {
  id: `${GoogleSansStyle}-${GoogleSansSubset}`;
  style: GoogleSansStyle;
  subset: GoogleSansSubset;
  weight: readonly [min: 400, max: 700];
  opticalSize: readonly [min: 17, max: 18];
  grade: 0;
  unicodeRange: string;
  sourceUrl: `https://fonts.gstatic.com/s/googlesans/v69/${string}.woff2`;
  sourceLastModified: string;
  bytes: number;
  sha256: string;
  publicPath: `/fonts/google-sans/v69/${string}.woff2`;
  repositoryPath: `public/fonts/google-sans/v69/${string}.woff2`;
  contentType: "font/woff2";
  cacheControl: "public, max-age=31536000, immutable";
  preload: boolean;
  preloadOrder: number | null;
}

export interface TypographyAssetManifestV1 {
  contractVersion: "TypographyAssetManifestV1";
  issue: "OVE-208";
  family: typeof GOOGLE_SANS_FAMILY;
  upstreamFamily: typeof GOOGLE_SANS_FAMILY;
  retrievedAt: string;
  upstream: {
    specimenUrl: string;
    metadataUrl: string;
    downloadManifestUrl: string;
    cssApiUrl: string;
    cssApiUserAgent: string;
    metadataLastModified: string;
    gstaticRevision: "v69";
  };
  license: {
    spdx: "OFL-1.1";
    sourceUrl: string;
    repositoryPath: string;
    bytes: number;
    sha256: string;
  };
  binary: {
    version: string;
    copyright: string;
    family: typeof GOOGLE_SANS_FAMILY;
    unitsPerEm: 1000;
  };
  axes: {
    grade: { min: -50; default: 0; max: 200; retainedInWebAssets: false };
    opticalSize: { min: 17; default: 18; max: 18 };
    weight: { min: 400; default: 400; max: 700 };
  };
  fallback: {
    family: typeof GOOGLE_SANS_FALLBACK_FAMILY;
    sourceFamily: "Arial";
    // Metrically identical to Arial, so they share the overrides below and keep
    // the face resolvable where Arial is absent.
    metricCompatibleFamilies: readonly [
      "Liberation Sans",
      "Liberation Sans Regular",
      "LiberationSans",
      "LiberationSans-Regular",
      "Arimo",
      "Arimo-Regular",
    ];
    azAverageWidth: number;
    sourceAzAverageWidth: number;
    sourceUnitsPerEm: 2048;
    sizeAdjust: "101.55%";
    ascentOverride: "95.12%";
    descentOverride: "28.16%";
    lineGapOverride: "0.00%";
  };
  // Cyrillic-derived metrics for the same fallback family. Every OverGarden
  // locale is Cyrillic, and the Latin-derived size-adjust above renders
  // Cyrillic about 3% too wide, so this face corrects the swap reflow.
  cyrillicFallback: {
    azAverageWidth: number;
    sourceAzAverageWidth: number;
    sourceUnitsPerEm: 2048;
    sizeAdjust: "98.53%";
    ascentOverride: "98.04%";
    descentOverride: "29.03%";
    lineGapOverride: "0.00%";
  };
  budgets: {
    normalCoreMaxBytes: number;
    normalSingleExtendedMaxBytes: number;
    normalAllSubsetsMaxBytes: number;
  };
  assets: readonly TypographyFontAssetV1[];
}

const CYRILLIC_EXT_RANGE =
  "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F";
const CYRILLIC_RANGE = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";
const LATIN_EXT_RANGE =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";
const LATIN_RANGE =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

const SHARED_ASSET_CONTRACT = {
  weight: [400, 700] as const,
  opticalSize: [17, 18] as const,
  grade: 0 as const,
  contentType: "font/woff2" as const,
  cacheControl: "public, max-age=31536000, immutable" as const,
};

export const GOOGLE_SANS_ASSET_MANIFEST = {
  contractVersion: "TypographyAssetManifestV1",
  issue: "OVE-208",
  family: GOOGLE_SANS_FAMILY,
  upstreamFamily: GOOGLE_SANS_FAMILY,
  retrievedAt: "2026-07-22",
  upstream: {
    specimenUrl: "https://fonts.google.com/specimen/Google+Sans",
    metadataUrl: "https://fonts.google.com/metadata/fonts/Google%20Sans",
    downloadManifestUrl:
      "https://fonts.google.com/download/list?family=Google%20Sans",
    cssApiUrl:
      "https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&display=swap",
    cssApiUserAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    metadataLastModified: "2026-05-21",
    gstaticRevision: "v69",
  },
  license: {
    spdx: "OFL-1.1",
    sourceUrl: "https://fonts.google.com/download/list?family=Google%20Sans",
    repositoryPath: "licenses/google-sans/v69/OFL-1.1.txt",
    bytes: 4_394,
    sha256: "07424db4089211e77dd8a0bca14fbf46e8801045d6db9061fbd6ce08e582594e",
  },
  binary: {
    version: "Version 13.002;[5e3df34c1]",
    copyright:
      "Copyright 2025 The Google Sans Project Authors (github.com/googlefonts/googlesans)",
    family: GOOGLE_SANS_FAMILY,
    unitsPerEm: 1_000,
  },
  axes: {
    grade: {
      min: -50,
      default: 0,
      max: 200,
      retainedInWebAssets: false,
    },
    opticalSize: { min: 17, default: 18, max: 18 },
    weight: { min: 400, default: 400, max: 700 },
  },
  fallback: {
    family: GOOGLE_SANS_FALLBACK_FAMILY,
    sourceFamily: "Arial",
    metricCompatibleFamilies: [
      "Liberation Sans",
      "Liberation Sans Regular",
      "LiberationSans",
      "LiberationSans-Regular",
      "Arimo",
      "Arimo-Regular",
    ],
    azAverageWidth: 463.3953488372093,
    sourceAzAverageWidth: 934.5116279069767,
    sourceUnitsPerEm: 2_048,
    sizeAdjust: "101.55%",
    ascentOverride: "95.12%",
    descentOverride: "28.16%",
    lineGapOverride: "0.00%",
  },
  cyrillicFallback: {
    azAverageWidth: 507.1860465116279,
    sourceAzAverageWidth: 1_054.2093023255813,
    sourceUnitsPerEm: 2_048,
    sizeAdjust: "98.53%",
    ascentOverride: "98.04%",
    descentOverride: "29.03%",
    lineGapOverride: "0.00%",
  },
  budgets: {
    normalCoreMaxBytes: 80 * 1_024,
    normalSingleExtendedMaxBytes: 105 * 1_024,
    normalAllSubsetsMaxBytes: 130 * 1_024,
  },
  assets: [
    {
      ...SHARED_ASSET_CONTRACT,
      id: "normal-cyrillic-ext",
      style: "normal",
      subset: "cyrillic-ext",
      unicodeRange: CYRILLIC_EXT_RANGE,
      sourceUrl:
        "https://fonts.gstatic.com/s/googlesans/v69/4UaRrENHsxJlGDuGo1OIlJfC6l_24rlCK1Yo_Iq2swCIhM907-0x.woff2",
      sourceLastModified: "Wed, 20 May 2026 19:40:31 GMT",
      bytes: 23_996,
      sha256:
        "6afd640338d8347583ef6592ae90bcc7d19999d916659c0a7a4e8b2cb23a6bf2",
      publicPath:
        "/fonts/google-sans/v69/google-sans-v69-normal-cyrillic-ext-6afd640338d83475.woff2",
      repositoryPath:
        "public/fonts/google-sans/v69/google-sans-v69-normal-cyrillic-ext-6afd640338d83475.woff2",
      preload: false,
      preloadOrder: null,
    },
    {
      ...SHARED_ASSET_CONTRACT,
      id: "normal-cyrillic",
      style: "normal",
      subset: "cyrillic",
      unicodeRange: CYRILLIC_RANGE,
      sourceUrl:
        "https://fonts.gstatic.com/s/googlesans/v69/4UaRrENHsxJlGDuGo1OIlJfC6l_24rlCK1Yo_Iq2ugCIhM907-0x.woff2",
      sourceLastModified: "Wed, 20 May 2026 19:40:41 GMT",
      bytes: 24_248,
      sha256:
        "a0c080f0d0cba3898bf11fbae986ada27453c00acbdee317fb9c010cd9aac067",
      publicPath:
        "/fonts/google-sans/v69/google-sans-v69-normal-cyrillic-a0c080f0d0cba389.woff2",
      repositoryPath:
        "public/fonts/google-sans/v69/google-sans-v69-normal-cyrillic-a0c080f0d0cba389.woff2",
      preload: true,
      preloadOrder: 1,
    },
    {
      ...SHARED_ASSET_CONTRACT,
      id: "normal-latin-ext",
      style: "normal",
      subset: "latin-ext",
      unicodeRange: LATIN_EXT_RANGE,
      sourceUrl:
        "https://fonts.gstatic.com/s/googlesans/v69/4UaRrENHsxJlGDuGo1OIlJfC6l_24rlCK1Yo_Iq2sACIhM907-0x.woff2",
      sourceLastModified: "Wed, 20 May 2026 19:42:04 GMT",
      bytes: 31_144,
      sha256:
        "ccf1c4db8ac323f7978f68382ca5afcd76a2b9c23134607e2d7a409708eb5e5f",
      publicPath:
        "/fonts/google-sans/v69/google-sans-v69-normal-latin-ext-ccf1c4db8ac323f7.woff2",
      repositoryPath:
        "public/fonts/google-sans/v69/google-sans-v69-normal-latin-ext-ccf1c4db8ac323f7.woff2",
      preload: false,
      preloadOrder: null,
    },
    {
      ...SHARED_ASSET_CONTRACT,
      id: "normal-latin",
      style: "normal",
      subset: "latin",
      unicodeRange: LATIN_RANGE,
      sourceUrl:
        "https://fonts.gstatic.com/s/googlesans/v69/4UaRrENHsxJlGDuGo1OIlJfC6l_24rlCK1Yo_Iq2vgCIhM907w.woff2",
      sourceLastModified: "Wed, 20 May 2026 19:40:57 GMT",
      bytes: 51_956,
      sha256:
        "73a7f9cfb110ed6731b3fd56ad86bfeae56abac8ed564a6978bacefbea051d92",
      publicPath:
        "/fonts/google-sans/v69/google-sans-v69-normal-latin-73a7f9cfb110ed67.woff2",
      repositoryPath:
        "public/fonts/google-sans/v69/google-sans-v69-normal-latin-73a7f9cfb110ed67.woff2",
      preload: false,
      preloadOrder: null,
    },
    {
      ...SHARED_ASSET_CONTRACT,
      id: "italic-cyrillic-ext",
      style: "italic",
      subset: "cyrillic-ext",
      unicodeRange: CYRILLIC_EXT_RANGE,
      sourceUrl:
        "https://fonts.gstatic.com/s/googlesans/v69/4UaXrENHsxJlGDuGo1OIlL3L2JB874GPhFI9_IqmuTCHjshW7d0wve4.woff2",
      sourceLastModified: "Wed, 20 May 2026 19:40:51 GMT",
      bytes: 25_668,
      sha256:
        "446716d6c1bb5267aabe5abc9137fff4c30f0a4449024186e18d5159980fd4e0",
      publicPath:
        "/fonts/google-sans/v69/google-sans-v69-italic-cyrillic-ext-446716d6c1bb5267.woff2",
      repositoryPath:
        "public/fonts/google-sans/v69/google-sans-v69-italic-cyrillic-ext-446716d6c1bb5267.woff2",
      preload: false,
      preloadOrder: null,
    },
    {
      ...SHARED_ASSET_CONTRACT,
      id: "italic-cyrillic",
      style: "italic",
      subset: "cyrillic",
      unicodeRange: CYRILLIC_RANGE,
      sourceUrl:
        "https://fonts.gstatic.com/s/googlesans/v69/4UaXrENHsxJlGDuGo1OIlL3L2JB874GPhFI9_IqmuTCOjshW7d0wve4.woff2",
      sourceLastModified: "Wed, 20 May 2026 19:40:45 GMT",
      bytes: 26_216,
      sha256:
        "4d5923050bedeb0bc4a15947904d0e01e5e01b0af4699236db923479ba676a58",
      publicPath:
        "/fonts/google-sans/v69/google-sans-v69-italic-cyrillic-4d5923050bedeb0b.woff2",
      repositoryPath:
        "public/fonts/google-sans/v69/google-sans-v69-italic-cyrillic-4d5923050bedeb0b.woff2",
      preload: false,
      preloadOrder: null,
    },
    {
      ...SHARED_ASSET_CONTRACT,
      id: "italic-latin-ext",
      style: "italic",
      subset: "latin-ext",
      unicodeRange: LATIN_EXT_RANGE,
      sourceUrl:
        "https://fonts.gstatic.com/s/googlesans/v69/4UaXrENHsxJlGDuGo1OIlL3L2JB874GPhFI9_IqmuTCEjshW7d0wve4.woff2",
      sourceLastModified: "Wed, 20 May 2026 19:44:15 GMT",
      bytes: 32_980,
      sha256:
        "2ca2b314df183802acba615cf0c4c02e4f109e515d74d194532998331f775f51",
      publicPath:
        "/fonts/google-sans/v69/google-sans-v69-italic-latin-ext-2ca2b314df183802.woff2",
      repositoryPath:
        "public/fonts/google-sans/v69/google-sans-v69-italic-latin-ext-2ca2b314df183802.woff2",
      preload: false,
      preloadOrder: null,
    },
    {
      ...SHARED_ASSET_CONTRACT,
      id: "italic-latin",
      style: "italic",
      subset: "latin",
      unicodeRange: LATIN_RANGE,
      sourceUrl:
        "https://fonts.gstatic.com/s/googlesans/v69/4UaXrENHsxJlGDuGo1OIlL3L2JB874GPhFI9_IqmuTCKjshW7d0w.woff2",
      sourceLastModified: "Wed, 20 May 2026 19:40:57 GMT",
      bytes: 56_980,
      sha256:
        "e55b6b52cd3f2d49cfd4b6267dc2ae61c4a4fd86661c5103e9b7cff2f0c087d7",
      publicPath:
        "/fonts/google-sans/v69/google-sans-v69-italic-latin-e55b6b52cd3f2d49.woff2",
      repositoryPath:
        "public/fonts/google-sans/v69/google-sans-v69-italic-latin-e55b6b52cd3f2d49.woff2",
      preload: false,
      preloadOrder: null,
    },
  ],
} as const satisfies TypographyAssetManifestV1;
