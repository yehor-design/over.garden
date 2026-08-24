import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("locale routing config", () => {
  it("lets Proxy hard-404 retired trailing-slash routes before canonicalization", () => {
    expect(nextConfig.skipTrailingSlashRedirect).toBe(true);
  });

  it("keeps locale redirects in Proxy so preference cookies are not bypassed", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];

    expect(redirects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "/uk" }),
        expect.objectContaining({ source: "/uk/:path*" }),
      ]),
    );
  });

  it("serves pinned same-origin font binaries with immutable WOFF2 headers", async () => {
    const headers = (await nextConfig.headers?.()) ?? [];
    const fontHeaders = headers.find(
      ({ source }) => source === "/fonts/:path*",
    )?.headers;

    expect(fontHeaders).toEqual(
      expect.arrayContaining([
        { key: "Content-Type", value: "font/woff2" },
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      ]),
    );
  });

  it("does not package a server image decoder or retired processing route", () => {
    expect(nextConfig.serverExternalPackages).toBeUndefined();
    expect(nextConfig.outputFileTracingIncludes).toBeUndefined();
  });
});
