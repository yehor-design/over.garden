import { notFound } from "next/navigation";

/**
 * The catch-all page every unprefixed route family mounts as
 * `[...missing]/page.tsx` (ADR-0022, D4). A path under a known root segment
 * that no page serves must not fall through to the `[locale]` routes with
 * the root segment as its locale. This page throws `notFound()`, so the
 * answer is the family's own not-found page with `noindex`. The status is
 * still 200: the root loading boundary streams the shell before the page
 * runs (see the Cache Components soft-404 note), so a real 404 needs the
 * proxy, which only knows first segments.
 */
export default function MissingRoute(): never {
  notFound();
}
