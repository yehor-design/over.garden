import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CANONICAL_PRODUCTION_R2_ENDPOINT } from "../src/lib/r2-addressing-contract";
import {
  formatR2AddressingCheck,
  parseR2AddressingCliArgs,
  runR2AddressingCheck,
} from "./check-r2-addressing-contract";

const VERIFIED_ENV = {
  R2_ENDPOINT: CANONICAL_PRODUCTION_R2_ENDPOINT,
  R2_FORCE_PATH_STYLE: "true",
};

describe("check-r2-addressing-contract", () => {
  it("keeps local prebuilds non-applicable and fails a production build closed", () => {
    expect(runR2AddressingCheck([], {})).toMatchObject({
      environmentClass: "non_production",
      enforcement: "not_applicable",
    });
    expect(
      runR2AddressingCheck([], {
        ...VERIFIED_ENV,
        VERCEL_ENV: "production",
        R2_FORCE_PATH_STYLE: "false",
      }),
    ).toMatchObject({
      environmentClass: "production",
      addressingClass: "virtual_hosted_style",
      enforcement: "refused",
    });
  });

  it("requires an exact explicit production confirmation for read-back", () => {
    const args = [
      "--environment",
      "production",
      "--confirm-environment",
      "production",
      "--read-back",
    ];

    expect(parseR2AddressingCliArgs(args)).toEqual({
      mode: "read_back",
      environment: "production",
    });
    expect(runR2AddressingCheck(args, VERIFIED_ENV)).toEqual({
      schemaVersion: "overgarden.r2-addressing.v1",
      environmentClass: "production",
      addressingClass: "path_style",
      enforcement: "verified",
    });
    expect(() =>
      parseR2AddressingCliArgs([
        "--environment",
        "production",
        "--confirm-environment",
        "preview",
        "--read-back",
      ]),
    ).toThrow("requires --confirm-environment production");
  });

  it("emits only the closed receipt and rejects unsupported flags", () => {
    const receipt = runR2AddressingCheck(
      [
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--read-back",
      ],
      { ...VERIFIED_ENV, R2_ACCESS_KEY_ID: "do-not-emit" },
    );

    expect(JSON.parse(formatR2AddressingCheck(receipt))).toEqual(receipt);
    expect(formatR2AddressingCheck(receipt)).not.toContain("do-not-emit");
    expect(() => parseR2AddressingCliArgs(["--print-secrets"])).toThrow(
      "unsupported flag",
    );
  });

  it("wires the guard before production proof and into every build", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["check:r2-addressing"]).toBe(
      "tsx scripts/check-r2-addressing-contract.ts",
    );
    expect(packageJson.scripts.prebuild).toContain(
      "pnpm run check:r2-addressing",
    );
    expect(packageJson.scripts["ove316:production-proof"]).toMatch(
      /^pnpm run check:r2-addressing -- .*--read-back && /,
    );
    expect(packageJson.scripts["ove316:production-proof"]).toContain(
      "scripts/recertify-final-main-media-proof.ts",
    );
  });

  it("pins the immutable OVE-316 operation, digest, stop rule, and predecessor refusal", () => {
    const runbook = readFileSync(
      new URL(
        "../../../docs/runbooks/OVE_316_R2_PATH_STYLE_RECOVERY.md",
        import.meta.url,
      ),
      "utf8",
    );

    expect(runbook).toContain(
      "aadd6156c440c020fd435178b1631e20359c52119e6ea081663c1e495beb101d",
    );
    expect(runbook).toContain("one-config-correction|one-canary");
    expect(runbook).toContain("Never run more than one OVE-316 apply");
    expect(runbook).toContain("consumed OVE-302 or OVE-315");
    expect(runbook).toContain("cleanup twice");
    expect(runbook).toContain("--read-back");
    expect(runbook).toContain("--plan");
    expect(runbook).toContain("--apply");
    expect(runbook).toContain("--status");
    expect(runbook).toContain("--cancel");
    expect(runbook).toContain("--cleanup");
  });
});
