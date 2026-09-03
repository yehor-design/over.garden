import path from "node:path";

import type { NextConfig } from "next";

// Security headers applied to every response.
//
// HSTS is set EXPLICITLY here (a hard invariant): `over.garden` is a `.garden`
// gTLD and is NOT HSTS-preloaded at the TLD level, so HTTPS is not auto-enforced
// — we must assert it. In production Cloudflare (ADR-0009) also owns HSTS at the
// edge; keep this value identical to the Cloudflare policy to avoid drift.
// Note: browsers ignore HSTS over plain HTTP/localhost — it only takes effect
// over HTTPS (verify on the deployed/edge environment, not `next dev`).
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  // ADR-0022, D4: Cache Components ("use cache", cacheLife, cacheTag) with
  // Partial Prerendering for the public pages.
  cacheComponents: true,
  // Retired control-plane paths must reach Proxy before framework-level
  // trailing-slash canonicalization so they can return a direct hard 404.
  // Proxy preserves the existing 308 canonical redirect for every other path.
  skipTrailingSlashRedirect: true,
  // No optimised `next/image` remains (OVE-371): public photos are plain
  // `<img srcset>` of final WebP renditions, and the few `next/image` uses
  // left (avatars, editorial guide art) are `unoptimized`, so no remote
  // pattern allowlist is needed.
  // Pin the workspace root to the MONOREPO root (two levels up from apps/web).
  // This matches the `outputFileTracingRoot` Vercel forces to the repo clone
  // root (otherwise Next warns they must be equal), and it also stops local
  // builds from inferring the root from a stray lockfile outside the repo.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
