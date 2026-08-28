import { describe, expect, it } from "vitest";

import {
  isStableRegistryPublicDiscoveryEnabled,
  isStableRegistryReleaseCenterEnabled,
} from "./feature-gate";

describe("Stable Registry Release Center feature gate", () => {
  it("stays dark by default and in every Vercel deployment", () => {
    expect(isStableRegistryReleaseCenterEnabled({})).toBe(false);
    expect(
      isStableRegistryReleaseCenterEnabled({
        STABLE_REGISTRY_RELEASE_CENTER: "true",
        VERCEL: "1",
        VERCEL_ENV: "production",
      }),
    ).toBe(false);
    expect(
      isStableRegistryReleaseCenterEnabled({
        STABLE_REGISTRY_RELEASE_CENTER: "true",
        VERCEL_ENV: "preview",
      }),
    ).toBe(false);
  });

  it("permits the explicitly enabled local-only proof path", () => {
    expect(
      isStableRegistryReleaseCenterEnabled({
        STABLE_REGISTRY_RELEASE_CENTER: "true",
      }),
    ).toBe(true);
  });
});

describe("Stable Registry public discovery feature gate", () => {
  it("requires a separate explicit enablement", () => {
    expect(isStableRegistryPublicDiscoveryEnabled({})).toBe(false);
    expect(
      isStableRegistryPublicDiscoveryEnabled({
        STABLE_REGISTRY_RELEASE_CENTER: "true",
      }),
    ).toBe(false);
    expect(
      isStableRegistryPublicDiscoveryEnabled({
        STABLE_REGISTRY_PUBLIC_DISCOVERY: "true",
        VERCEL_ENV: "production",
      }),
    ).toBe(true);
  });
});
