/**
 * The illustration manifest — the one module that names an illustration file.
 *
 * ADR-0031 D10: the source is `thiings.co`, the owner's decision of 2026-09-17,
 * taken with the licence terms in front of them and reaffirmed. Three rules come
 * with it, and this module is how two of them stay true:
 *
 * 1. **The swap stays cheap.** No component names a path. A component takes a
 *    resolved `Illustration` as a prop, a page resolves it here, and moving to
 *    [3dicons.co](https://3dicons.co/) (CC0) or buying the $49 indie licence is
 *    a change to this file and the bucket, not a hunt through components.
 * 2. **They are never republished as assets.** They are referenced from a page.
 *    There is no route that lists them, no archive, no sprite sheet and no
 *    directory index — that prohibition binds at every licence tier, including
 *    the paid ones.
 *
 * The third rule — a visible credit to `thiings.co` in the footer — belongs to
 * the footer, which the product does not have yet (`OVE-443`).
 *
 * **Nothing is published yet.** `PUBLISHED_ILLUSTRATIONS` is empty, so every
 * `resolveIllustration` call answers `null` and every empty state renders
 * without an illustration — which DESIGN.md §5.4 already allows, since only
 * `empty-first-run` has an illustration slot at all. Adding one is three steps:
 * buy the licence, upload `illustrations/<key>.webp` to the public bucket
 * through the existing media pipeline, and add the key here with the dimensions
 * the file actually has. File the download receipt beside
 * `docs/launch-corpus-unsplash-license-receipt.md` so the position stays dated.
 */

/** The closed set. A screen that wants a new one adds it here first. */
export const ILLUSTRATION_KEYS = [
  "empty-journal",
  "empty-garden",
  "empty-community",
  "empty-wishlist",
  "empty-notifications",
  "first-entry",
] as const;

export type IllustrationKey = (typeof ILLUSTRATION_KEYS)[number];

export interface Illustration {
  /** The URL a page hands to `EmptyState`. */
  src: string;
  /** Intrinsic pixels, so the box is reserved and nothing shifts (§2.10). */
  width: number;
  height: number;
}

/** DESIGN.md §2.9: 96 px in a card, 144 px at page level, 180 px maximum. */
export const ILLUSTRATION_SIZES = { card: 96, page: 144 } as const;

export type IllustrationSize = keyof typeof ILLUSTRATION_SIZES;

/**
 * The object key, under the one directory the whole set lives in. Kept separate
 * from the URL so a bucket policy, a purge, or a licence change can address the
 * set without a component knowing it exists.
 */
export function illustrationObjectKey(key: IllustrationKey): string {
  return `illustrations/${key}.webp`;
}

/**
 * Keys whose WebP is actually in the public bucket, with its intrinsic size.
 * Empty until the licence is bought and the files are uploaded.
 */
const PUBLISHED_ILLUSTRATIONS: Partial<
  Record<IllustrationKey, { width: number; height: number }>
> = {};

/**
 * The URL for a published illustration, or `null` — for a key with no file yet,
 * or in a browser, where the media base is not exposed. A resolved illustration
 * therefore only ever reaches a component from a server render.
 */
export function resolveIllustration(
  key: IllustrationKey,
  options: { baseUrl?: string } = {},
): Illustration | null {
  const published = PUBLISHED_ILLUSTRATIONS[key];
  if (!published) return null;
  const baseUrl = options.baseUrl ?? process.env.R2_PUBLIC_BASE_URL;
  if (!baseUrl) return null;
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return {
    src: new URL(illustrationObjectKey(key), normalized).toString(),
    width: published.width,
    height: published.height,
  };
}
