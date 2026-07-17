import { describe, expect, it } from "vitest";

import { getProtectiveDnsResolutionPlan } from "./check-protective-dns";
import {
  assessResolution,
  summarizeResolutionChecks,
  type ResolutionCheck,
} from "./protective-dns-contract";

describe("protective DNS resolution contract", () => {
  it("keeps the complete two-domain by seven-resolver-endpoint matrix", () => {
    expect(getProtectiveDnsResolutionPlan()).toEqual([
      { resolver: "system-default", domain: "over.garden" },
      { resolver: "system-default", domain: "www.over.garden" },
      { resolver: "cloudflare", domain: "over.garden" },
      { resolver: "cloudflare", domain: "www.over.garden" },
      { resolver: "cloudflare-security", domain: "over.garden" },
      { resolver: "cloudflare-security", domain: "www.over.garden" },
      { resolver: "google", domain: "over.garden" },
      { resolver: "google", domain: "www.over.garden" },
      { resolver: "quad9", domain: "over.garden" },
      { resolver: "quad9", domain: "www.over.garden" },
      { resolver: "cisco-umbrella", domain: "over.garden" },
      { resolver: "cisco-umbrella", domain: "www.over.garden" },
      { resolver: "cisco-umbrella-secondary", domain: "over.garden" },
      {
        resolver: "cisco-umbrella-secondary",
        domain: "www.over.garden",
      },
    ]);
  });

  it("passes when a resolver returns the authoritative address set", () => {
    expect(
      assessResolution({
        resolver: "cloudflare",
        domain: "over.garden",
        expected: ["76.76.21.21"],
        observed: ["76.76.21.21", "76.76.21.21"],
      }),
    ).toEqual({
      resolver: "cloudflare",
      domain: "over.garden",
      expected: ["76.76.21.21"],
      observed: ["76.76.21.21"],
      status: "pass",
    });
  });

  it("detects a protective-DNS replacement address", () => {
    expect(
      assessResolution({
        resolver: "system-default",
        domain: "over.garden",
        expected: ["76.76.21.21"],
        observed: ["213.226.0.180"],
      }),
    ).toMatchObject({
      status: "mismatch",
      expected: ["76.76.21.21"],
      observed: ["213.226.0.180"],
    });
  });

  it("reports resolver failures without exposing resolver network details", () => {
    expect(
      assessResolution({
        resolver: "cisco-umbrella",
        domain: "www.over.garden",
        expected: ["76.76.21.21"],
        error: new Error("query timed out via 192.0.2.53"),
      }),
    ).toEqual({
      resolver: "cisco-umbrella",
      domain: "www.over.garden",
      expected: ["76.76.21.21"],
      observed: [],
      status: "error",
      error: "DNS query failed",
    });
  });

  it("fails closed when authoritative DNS returns no expected address", () => {
    expect(
      assessResolution({
        resolver: "google",
        domain: "over.garden",
        expected: [],
        observed: ["76.76.21.21"],
      }),
    ).toEqual({
      resolver: "google",
      domain: "over.garden",
      expected: [],
      observed: ["76.76.21.21"],
      status: "error",
      error: "DNS query failed",
    });
  });

  it("uses a distinct exit code for reputation mismatches", () => {
    const passingCheck: ResolutionCheck = {
      resolver: "google",
      domain: "over.garden",
      expected: ["76.76.21.21"],
      observed: ["76.76.21.21"],
      status: "pass",
    };
    const mismatchCheck: ResolutionCheck = {
      ...passingCheck,
      resolver: "system-default",
      observed: ["213.226.0.180"],
      status: "mismatch",
    };

    expect(summarizeResolutionChecks([passingCheck])).toMatchObject({
      status: "pass",
      exitCode: 0,
      counts: { pass: 1, mismatch: 0, error: 0 },
    });
    expect(
      summarizeResolutionChecks([passingCheck, mismatchCheck]),
    ).toMatchObject({
      status: "mismatch",
      exitCode: 2,
      counts: { pass: 1, mismatch: 1, error: 0 },
    });
  });

  it("gives operational errors precedence over reputation mismatches", () => {
    const checks: ResolutionCheck[] = [
      {
        resolver: "system-default",
        domain: "over.garden",
        expected: ["76.76.21.21"],
        observed: ["213.226.0.180"],
        status: "mismatch",
      },
      {
        resolver: "cloudflare",
        domain: "over.garden",
        expected: ["76.76.21.21"],
        observed: [],
        status: "error",
        error: "DNS query failed",
      },
    ];

    expect(summarizeResolutionChecks(checks)).toMatchObject({
      status: "error",
      exitCode: 1,
      counts: { pass: 0, mismatch: 1, error: 1 },
    });
  });

  it("treats an empty resolver matrix as an incomplete check", () => {
    expect(summarizeResolutionChecks([])).toEqual({
      status: "error",
      exitCode: 1,
      counts: { pass: 0, mismatch: 0, error: 0 },
    });
  });
});
