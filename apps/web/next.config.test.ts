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

  it("does not package a server image decoder or retired processing route", () => {
    expect(nextConfig.serverExternalPackages).toBeUndefined();
    expect(nextConfig.outputFileTracingIncludes).toBeUndefined();
  });
});
