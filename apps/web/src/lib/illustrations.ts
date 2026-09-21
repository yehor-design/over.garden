/**
 * The illustration manifest — the one module that names an illustration file.
 *
 * ADR-0031 D10: the source is `thiings.co`. The owner's position, taken with
 * the licence terms in front of them and reaffirmed on 2026-09-17, is to use
 * the free tier and to carry no attribution. `DESIGN.md` §2.9 records that and
 * what the terms actually say; this module's job is to make the position cheap
 * to reverse.
 *
 * Two rules follow, and both are mechanical:
 *
 * 1. **No component names a path.** A component takes a resolved
 *    `Illustration` as a prop and a page resolves it here, so moving to
 *    [3dicons.co](https://3dicons.co/) (CC0), buying the $49 indie licence, or
 *    dropping the set altogether is a change to this file and one directory.
 *    `src/lib/illustrations.test.ts` fails if a path appears anywhere else.
 * 2. **They are never republished as assets.** They are referenced from a page.
 *    There is no route that lists them, no archive, no sprite sheet and no
 *    directory index — that prohibition binds at every licence tier, paid ones
 *    included, and is the one term no reading of the terms excuses.
 *
 * **Where the files live, and why not R2.** `apps/web/public/illustrations/`,
 * served by the CDN as plain static WebP — not the Vercel image optimizer,
 * which ADR-0022 D2 bans. `DESIGN.md` §2.9 first said "the existing media
 * pipeline", and that pipeline is wrong for these: it exists for a gardener's
 * photographs, which arrive through a staging worker, get published atomically
 * and are subject to retention and revocation. Six permanent pieces of app art
 * have none of that, and putting them in the user-media bucket would make
 * every tool that reasons about that bucket learn an exception. Shipping them
 * with the code also means a rollback rolls them back, which an object in a
 * bucket does not.
 */

/** The closed set. A screen that wants a new one adds it here first. */
export const ILLUSTRATION_KEYS = [
  "empty-journal",
  "empty-garden",
  "empty-community",
  "empty-wishlist",
  "empty-notifications",
  "first-entry",
  "space-setup",
  "object-setup",
  "no-results",
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
 * Every file is 360 × 360: twice the 180 px maximum, so the largest declared
 * size is still sharp on a 2× display and no size needs a second file.
 */
const INTRINSIC_SIZE = 360;

/**
 * The path, under the one directory the whole set lives in. Kept separate from
 * the resolver so a licence change, a purge or a move can address the set
 * without a component knowing it exists.
 */
export function illustrationPath(key: IllustrationKey): string {
  return `/illustrations/${key}.webp`;
}

/**
 * What each key is a picture of, and the name it carries on `thiings.co`.
 *
 * Recorded because the choice is not obvious from a file name and because
 * replacing one later means finding its equivalent: `Nature Journal` was
 * rejected for the Latin word baked into its cover, which no Ukrainian or
 * Bulgarian reader should meet, and `Notification` for the badge reading `1` —
 * on an *empty* state, a picture that says "there is one" is a picture that
 * lies.
 */
export const ILLUSTRATION_SUBJECTS: Readonly<Record<IllustrationKey, string>> =
  {
    "empty-journal": "Pressed Flower Journal",
    "empty-garden": "Plant Pot",
    "empty-community": "Village",
    "empty-wishlist": "Wishlist",
    "empty-notifications": "Mailbox",
    "first-entry": "Sprout",
    "space-setup": "Garden",
    "object-setup": "Terracotta Pot",
    "no-results": "Bird Watching Binoculars",
  };

/** Purpose names remain stable when the selected artwork changes. */
export const ILLUSTRATION_ROLES = {
  "first-garden": "empty-garden",
  "space-setup": "space-setup",
  "object-setup": "object-setup",
  "no-entries": "empty-journal",
  "no-results": "no-results",
  "setup-success": "first-entry",
} as const satisfies Record<string, IllustrationKey>;

export type IllustrationRole = keyof typeof ILLUSTRATION_ROLES;

export function resolveIllustrationRole(role: IllustrationRole): Illustration {
  return resolveIllustration(ILLUSTRATION_ROLES[role]);
}

/** The picture for a key, at its intrinsic size. */
export function resolveIllustration(key: IllustrationKey): Illustration {
  return {
    src: illustrationPath(key),
    width: INTRINSIC_SIZE,
    height: INTRINSIC_SIZE,
  };
}
