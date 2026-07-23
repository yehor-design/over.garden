export const GEIST_MONO_FAMILY = "Geist Mono";
export const GEIST_MONO_STACK = `"${GEIST_MONO_FAMILY}", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;

export type GeistMonoSubset =
  | "cyrillic-ext"
  | "cyrillic"
  | "symbols2"
  | "vietnamese"
  | "latin-ext"
  | "latin";

export interface GeistMonoFontAssetV1 {
  id: `normal-${GeistMonoSubset}`;
  style: "normal";
  subset: GeistMonoSubset;
  weight: readonly [min: 100, max: 900];
  unicodeRange: string;
  sourceUrl: `https://fonts.gstatic.com/s/geistmono/v6/${string}.woff2`;
  sourceLastModified: string;
  bytes: number;
  sha256: string;
  publicPath: `/fonts/geist-mono/v6/${string}.woff2`;
  repositoryPath: `public/fonts/geist-mono/v6/${string}.woff2`;
  contentType: "font/woff2";
  cacheControl: "public, max-age=31536000, immutable";
  preload: false;
}

export interface GeistMonoAssetManifestV1 {
  contractVersion: "TypographyAssetManifestV1";
  issue: "OVE-208";
  role: "semantic-monospace";
  family: typeof GEIST_MONO_FAMILY;
  upstreamFamily: typeof GEIST_MONO_FAMILY;
  retrievedAt: string;
  upstream: {
    specimenUrl: string;
    metadataUrl: string;
    downloadManifestUrl: string;
    cssApiUrl: string;
    cssApiUserAgent: string;
    metadataLastModified: string;
    gstaticRevision: "v6";
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
    family: typeof GEIST_MONO_FAMILY;
    style: "Regular";
    postscriptName: "GeistMono-Regular";
    unitsPerEm: 1000;
  };
  axes: {
    weight: { min: 100; default: 400; max: 900 };
  };
  loading: {
    strategy: "demand-only";
    preloadCount: 0;
  };
  assets: readonly GeistMonoFontAssetV1[];
}

const CYRILLIC_EXT_RANGE =
  "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F";
const CYRILLIC_RANGE = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";
const SYMBOLS_2_RANGE =
  "U+2000-2001, U+2004-2008, U+200A, U+23B8-23BD, U+2500-259F";
const VIETNAMESE_RANGE =
  "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB";
const LATIN_EXT_RANGE =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";
const LATIN_RANGE =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

const SHARED_ASSET_CONTRACT = {
  style: "normal" as const,
  weight: [100, 900] as const,
  contentType: "font/woff2" as const,
  cacheControl: "public, max-age=31536000, immutable" as const,
  preload: false as const,
};

export const GEIST_MONO_ASSET_MANIFEST = {
  contractVersion: "TypographyAssetManifestV1",
  issue: "OVE-208",
  role: "semantic-monospace",
  family: GEIST_MONO_FAMILY,
  upstreamFamily: GEIST_MONO_FAMILY,
  retrievedAt: "2026-07-22",
  upstream: {
    specimenUrl: "https://fonts.google.com/specimen/Geist+Mono",
    metadataUrl: "https://fonts.google.com/metadata/fonts/Geist%20Mono",
    downloadManifestUrl:
      "https://fonts.google.com/download/list?family=Geist%20Mono",
    cssApiUrl:
      "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&display=swap",
    cssApiUserAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    metadataLastModified: "2026-06-08",
    gstaticRevision: "v6",
  },
  license: {
    spdx: "OFL-1.1",
    sourceUrl: "https://fonts.google.com/download/list?family=Geist%20Mono",
    repositoryPath: "licenses/geist-mono/v6/OFL-1.1.txt",
    bytes: 4_481,
    sha256: "0acca17d633ecc7180aa12d8a60a95889d87a439cb83884597ff278046743dcb",
  },
  binary: {
    version: "Version 1.701",
    copyright:
      "Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font.git)",
    family: GEIST_MONO_FAMILY,
    style: "Regular",
    postscriptName: "GeistMono-Regular",
    unitsPerEm: 1_000,
  },
  axes: {
    weight: { min: 100, default: 400, max: 900 },
  },
  loading: {
    strategy: "demand-only",
    preloadCount: 0,
  },
  assets: [
    {
      ...SHARED_ASSET_CONTRACT,
      id: "normal-cyrillic-ext",
      subset: "cyrillic-ext",
      unicodeRange: CYRILLIC_EXT_RANGE,
      sourceUrl:
        "https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrodmhHkjkotbA.woff2",
      sourceLastModified: "Mon, 08 Jun 2026 16:32:08 GMT",
      bytes: 6_204,
      sha256:
        "e27f657e38d52887baa3b6b2f812bef93dfdd356f0810e40edd4ee284cc7e9f6",
      publicPath:
        "/fonts/geist-mono/v6/geist-mono-v6-normal-cyrillic-ext-e27f657e38d52887.woff2",
      repositoryPath:
        "public/fonts/geist-mono/v6/geist-mono-v6-normal-cyrillic-ext-e27f657e38d52887.woff2",
    },
    {
      ...SHARED_ASSET_CONTRACT,
      id: "normal-cyrillic",
      subset: "cyrillic",
      unicodeRange: CYRILLIC_RANGE,
      sourceUrl:
        "https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrMdmhHkjkotbA.woff2",
      sourceLastModified: "Mon, 08 Jun 2026 16:32:04 GMT",
      bytes: 12_872,
      sha256:
        "75b3bedbebc35f347c0ae3b416aa871941555357e7b0f83767eb5987875589ed",
      publicPath:
        "/fonts/geist-mono/v6/geist-mono-v6-normal-cyrillic-75b3bedbebc35f34.woff2",
      repositoryPath:
        "public/fonts/geist-mono/v6/geist-mono-v6-normal-cyrillic-75b3bedbebc35f34.woff2",
    },
    {
      ...SHARED_ASSET_CONTRACT,
      id: "normal-symbols2",
      subset: "symbols2",
      unicodeRange: SYMBOLS_2_RANGE,
      sourceUrl:
        "https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFg08vz7MhEIVVeA.woff2",
      sourceLastModified: "Mon, 08 Jun 2026 16:32:04 GMT",
      bytes: 5_892,
      sha256:
        "d67e4a94ba498635f764ddca7d1ec4271f5642f032eb24b426764480f66f8497",
      publicPath:
        "/fonts/geist-mono/v6/geist-mono-v6-normal-symbols2-d67e4a94ba498635.woff2",
      repositoryPath:
        "public/fonts/geist-mono/v6/geist-mono-v6-normal-symbols2-d67e4a94ba498635.woff2",
    },
    {
      ...SHARED_ASSET_CONTRACT,
      id: "normal-vietnamese",
      subset: "vietnamese",
      unicodeRange: VIETNAMESE_RANGE,
      sourceUrl:
        "https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrgdmhHkjkotbA.woff2",
      sourceLastModified: "Mon, 08 Jun 2026 16:32:10 GMT",
      bytes: 7_728,
      sha256:
        "16e1d48b6dd29eb240aec5db36184eb182933c082cd43de7f35af686d58087d2",
      publicPath:
        "/fonts/geist-mono/v6/geist-mono-v6-normal-vietnamese-16e1d48b6dd29eb2.woff2",
      repositoryPath:
        "public/fonts/geist-mono/v6/geist-mono-v6-normal-vietnamese-16e1d48b6dd29eb2.woff2",
    },
    {
      ...SHARED_ASSET_CONTRACT,
      id: "normal-latin-ext",
      subset: "latin-ext",
      unicodeRange: LATIN_EXT_RANGE,
      sourceUrl:
        "https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrkdmhHkjkotbA.woff2",
      sourceLastModified: "Mon, 08 Jun 2026 16:32:06 GMT",
      bytes: 14_712,
      sha256:
        "745994b5cd950ec201b66526375f057d540847cccfc70f4f24f5f571d26d3923",
      publicPath:
        "/fonts/geist-mono/v6/geist-mono-v6-normal-latin-ext-745994b5cd950ec2.woff2",
      repositoryPath:
        "public/fonts/geist-mono/v6/geist-mono-v6-normal-latin-ext-745994b5cd950ec2.woff2",
    },
    {
      ...SHARED_ASSET_CONTRACT,
      id: "normal-latin",
      subset: "latin",
      unicodeRange: LATIN_RANGE,
      sourceUrl:
        "https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrcdmhHkjko.woff2",
      sourceLastModified: "Mon, 08 Jun 2026 16:32:04 GMT",
      bytes: 23_108,
      sha256:
        "5f3d6ad60f29d6cb708414ec6887163d63bf197377ef5417d2483ff31ace6c3b",
      publicPath:
        "/fonts/geist-mono/v6/geist-mono-v6-normal-latin-5f3d6ad60f29d6cb.woff2",
      repositoryPath:
        "public/fonts/geist-mono/v6/geist-mono-v6-normal-latin-5f3d6ad60f29d6cb.woff2",
    },
  ],
} as const satisfies GeistMonoAssetManifestV1;

export const GEIST_MONO_PRELOAD_ASSETS = Object.freeze(
  GEIST_MONO_ASSET_MANIFEST.assets.filter((asset) => asset.preload),
);

const GENERATED_CSS_HEADER =
  "/* Generated from GEIST_MONO_ASSET_MANIFEST. Verify with scripts/verify-google-sans-assets.ts. */";

function renderFontFace(asset: GeistMonoFontAssetV1): string {
  return `/* ${asset.style} ${asset.subset} */
@font-face {
  font-family: "${GEIST_MONO_FAMILY}";
  font-style: ${asset.style};
  font-weight: ${asset.weight[0]} ${asset.weight[1]};
  font-display: swap;
  src: url("${asset.publicPath}") format("woff2");
  unicode-range: ${asset.unicodeRange};
}`;
}

export const GEIST_MONO_FONT_FACE_CSS = `${GENERATED_CSS_HEADER}

${GEIST_MONO_ASSET_MANIFEST.assets.map(renderFontFace).join("\n\n")}
`;
