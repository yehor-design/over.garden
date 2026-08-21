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
  // Retired control-plane paths must reach Proxy before framework-level
  // trailing-slash canonicalization so they can return a direct hard 404.
  // Proxy preserves the existing 308 canonical redirect for every other path.
  skipTrailingSlashRedirect: true,
  images: {
    dangerouslyAllowLocalIP:
      process.env.VISUAL_FIXTURES_ENABLED === "true" &&
      process.env.VISUAL_FIXTURES_TARGET === "local",
    remotePatterns: [
      { protocol: "https", hostname: "media.over.garden" },
      { protocol: "http", hostname: "localhost", port: "9000" },
      { protocol: "http", hostname: "127.0.0.1", port: "9000" },
    ],
  },
  // Pin the workspace root to the MONOREPO root (two levels up from apps/web).
  // This matches the `outputFileTracingRoot` Vercel forces to the repo clone
  // root (otherwise Next warns they must be equal), and it also stops local
  // builds from inferring the root from a stray lockfile outside the repo.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
  // Keep the native decoder at its one explicit server route. The garden SSR
  // graph must not cause sharp to load; tracing below packages its Linux
  // runtime only for the protected processing boundary.
  serverExternalPackages: ["sharp"],
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
        // Typography binaries are pinned, content-hashed, and same-origin.
        // Keep them outside the personalized app-cache boundary and immutable
        // for one year; a changed binary must ship under a changed pathname.
        source: "/fonts/:path*",
        headers: [
          { key: "Content-Type", value: "font/woff2" },
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
