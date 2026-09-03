import { notFound } from "next/navigation";

/**
 * The catch-all page every unprefixed route family mounts as
 * `[...missing]/page.tsx` (ADR-0022, D4). A path under a known root segment
 * that no page serves must not fall through to the `[locale]` routes with
 * the root segment as its locale; this page throws `notFound()` while the
 * route is prerendered, so the answer is a real 404 with the not-found page.
 */
export default function MissingRoute(): never {
  notFound();
}
