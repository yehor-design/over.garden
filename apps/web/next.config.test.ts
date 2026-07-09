import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("locale routing config", () => {
  it("keeps locale redirects in Proxy so preference cookies are not bypassed", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];

    expect(redirects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "/uk" }),
        expect.objectContaining({ source: "/uk/:path*" }),
      ]),
    );
  });
});
