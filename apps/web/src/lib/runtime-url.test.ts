import { describe, expect, it } from "vitest";

import {
  getAuthBaseUrl,
  getPublicSiteUrl,
  shouldForceInsecureRecoveryCookies,
  vercelUrl,
} from "./runtime-url";

describe("runtime URL resolution", () => {
  it("uses explicit public site URL before Vercel deployment URL", () => {
    expect(
      getPublicSiteUrl({
        PUBLIC_SITE_URL: "https://over.garden/path?x=1",
        VERCEL_URL: "preview.vercel.app",
      }),
    ).toBe("https://over.garden/");
  });

  it("uses Vercel deployment URL when explicit public URL is missing", () => {
    expect(
      getPublicSiteUrl({
        VERCEL_URL: "over-garden-preview.vercel.app",
      }),
    ).toBe("https://over-garden-preview.vercel.app/");
  });

  it("uses Better Auth URL before public URL for auth base", () => {
    expect(
      getAuthBaseUrl({
        BETTER_AUTH_URL: "https://auth.example.test/app",
        PUBLIC_SITE_URL: "https://public.example.test",
      }),
    ).toBe("https://auth.example.test/");
  });

  it("does not infer a Vercel deployment URL as the production auth base", () => {
    expect(
      getAuthBaseUrl({
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_URL: "over-garden-production.vercel.app",
      }),
    ).toBe("https://over.garden/");
  });

  it("keeps Vercel deployment URL inference available outside production", () => {
    expect(
      getAuthBaseUrl({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_URL: "over-garden-preview.vercel.app",
      }),
    ).toBe("https://over-garden-preview.vercel.app/");
  });

  it("normalizes Vercel URL values with or without scheme", () => {
    expect(vercelUrl({ VERCEL_URL: "preview.example.test" })).toBe(
      "https://preview.example.test",
    );
    expect(vercelUrl({ VERCEL_URL: "https://preview.example.test" })).toBe(
      "https://preview.example.test",
    );
  });

  it("keeps recovery cookies secure when the auth authority is HTTPS", () => {
    expect(
      shouldForceInsecureRecoveryCookies({
        BETTER_AUTH_URL: "https://over.garden",
        OVE230_RECOVERY_DRILL: "true",
      }),
    ).toBe(false);
  });

  it("allows insecure recovery cookies only for an HTTP auth authority", () => {
    expect(
      shouldForceInsecureRecoveryCookies({
        BETTER_AUTH_URL: "http://127.0.0.1:4310",
        OVE230_RECOVERY_DRILL: "true",
      }),
    ).toBe(true);
    expect(
      shouldForceInsecureRecoveryCookies({
        BETTER_AUTH_URL: "http://127.0.0.1:4310",
      }),
    ).toBe(false);
  });
});
