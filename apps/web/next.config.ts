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
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.over.garden" },
      { protocol: "http", hostname: "localhost", port: "9000" },
    ],
  },
  // Pin the workspace root to the MONOREPO root (two levels up from apps/web).
  // This matches the `outputFileTracingRoot` Vercel forces to the repo clone
  // root (otherwise Next warns they must be equal), and it also stops local
  // builds from inferring the root from a stray lockfile outside the repo.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
  outputFileTracingIncludes: {
    "/api/media/process": [
      "./node_modules/.pnpm/@img+sharp-linux-x64@*/node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The (empty) service worker must never be cached, so SW updates ship.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/uk",
        destination: "/",
        permanent: true,
      },
      {
        source: "/uk/:path*",
        destination: "/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
