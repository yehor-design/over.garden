import type { MetadataRoute } from "next";

import { absolutePublicUrl } from "@/lib/garden/public-url";

/**
 * Routes a crawler has no reason to fetch (ADR-0029 D15 phase 0). These are
 * already `noindex` and already refuse an unauthorised reader with 401/403 —
 * privacy is enforced on the server and never by this file. What the list buys
 * is crawl budget: without it a crawler walks the whole workspace and every
 * API path before reaching the public pages.
 *
 * `PUBLIC_SEO_AEO_SURFACE_POLICY.md` has claimed this list existed since the
 * policy was written. It did not.
 */
const DISALLOWED_PREFIXES = [
  "/garden",
  "/account",
  "/auth",
  "/erasure",
  "/api",
  "/skeleton",
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...DISALLOWED_PREFIXES],
      },
    ],
    sitemap: absolutePublicUrl("/sitemap.xml"),
  };
}
