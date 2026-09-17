/**
 * The six states every screen owes its reader (DESIGN.md §5.4).
 *
 * Closed, and named here rather than per page, because "empty" meaning two
 * different things was how the product ended up with a first-run message on a
 * filtered search that matched nothing.
 *
 * - `empty-first-run` — nothing exists yet. Illustration, a sentence, one line,
 *   one action.
 * - `empty-no-results` — something exists but the filters excluded it. **No**
 *   illustration; the active filters instead, and a way to clear them.
 * - `loading` — a skeleton shaped like the real layout, never a page spinner.
 * - `degraded` — one section settled into a bounded failure class (ADR-0023)
 *   while the rest of the page is fine.
 * - `error` — the screen itself failed: one sentence, what to do, the digest,
 *   a retry.
 * - `signed-out` — the real page behind it where possible, one `Callout`, one
 *   link to sign in.
 */
export const SCREEN_STATES = [
  "empty-first-run",
  "empty-no-results",
  "loading",
  "degraded",
  "error",
  "signed-out",
] as const;

export type ScreenState = (typeof SCREEN_STATES)[number];
