import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  SafeMediaAdmissionError,
  admitSafeMediaBytes,
  detectSafeMediaType,
} from "./safe-media-admission";
import { isPublicMediaEligible } from "./public-media-eligibility";

describe("OVE-244 safe media admission", () => {
  it.each([
    ["image/jpeg", "jpeg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ] as const)("admits actual %s bytes before decode", async (contentType, format) => {
    const pipeline = sharp({
      create: { width: 32, height: 24, channels: 3, background: "green" },
    });
    const bytes = await pipeline[format]().toBuffer();

    await expect(admitSafeMediaBytes(bytes, contentType)).resolves.toBe(contentType);
    expect(detectSafeMediaType(bytes)).toBe(contentType);
  });

  it("recognizes the closed HEIC brand family without trusting an extension", () => {
    const bytes = Buffer.alloc(16);
    bytes.writeUInt32BE(16, 0);
    bytes.write("ftyp", 4, "ascii");
    bytes.write("heic", 8, "ascii");
    expect(detectSafeMediaType(bytes)).toBe("image/heic");
  });

  it("rejects declared/actual mismatch, SVG and valid-image polyglot suffixes", async () => {
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "red" },
    }).png().toBuffer();
    await expect(admitSafeMediaBytes(png, "image/jpeg")).rejects.toMatchObject({
      code: "declared_actual_mismatch",
    });
    await expect(
      admitSafeMediaBytes(Buffer.from("<svg><script/></svg>"), "image/png"),
    ).rejects.toBeInstanceOf(SafeMediaAdmissionError);

    const jpeg = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "blue" },
    }).jpeg().toBuffer();
    const polyglot = Buffer.concat([
      jpeg,
      Buffer.from("<script>alert(1)</script>"),
    ]);
    await expect(admitSafeMediaBytes(polyglot, "image/jpeg")).rejects.toMatchObject({
      code: "polyglot_rejected",
    });
    expect(detectSafeMediaType(polyglot)).toBeNull();
  });

  it("fails public serialization closed until every readiness proof is present", () => {
    const ready = {
      status: "processed",
      derivativeKey: "derivatives/opaque.webp",
      originalDeletedAt: new Date(),
      revokedAt: null,
      mediaReadinessState: "public_ready",
      publicObjectId: "00000000-0000-4000-8000-000000000011",
      qualityPolicyVersion: "ove231.launch-media-quality.v1",
      qualityClass: "accepted",
    };
    expect(isPublicMediaEligible(ready)).toBe(true);
    for (const missing of [
      { ...ready, originalDeletedAt: null },
      { ...ready, mediaReadinessState: "derivative_written" },
      { ...ready, publicObjectId: null },
      { ...ready, revokedAt: new Date() },
      { ...ready, qualityClass: "review_required" },
      { ...ready, qualityPolicyVersion: "stale-policy" },
    ]) expect(isPublicMediaEligible(missing)).toBe(false);
    expect(
      isPublicMediaEligible({
        ...ready,
        qualityPolicyVersion: null,
        qualityClass: null,
      }),
    ).toBe(true);
  });

  it("keeps every public media query on the shared eligibility contract", () => {
    const files = [
      "../journal-cover.ts",
      "../journal-repository.ts",
      "../owner-profile-repository.ts",
      "../public-feed-repository.ts",
      "../public-object-passport-repository.ts",
      "../public-profile-repository.ts",
      "../search/public-journal-eligibility.ts",
    ];
    for (const relative of files) {
      const source = readFileSync(
        fileURLToPath(new URL(relative, import.meta.url)),
        "utf8",
      );
      expect(source, relative).toContain("publicMediaEligibilityPredicate");
    }
    for (const relative of [
      "../community-repository.ts",
      "../public-variety-repository.ts",
    ]) {
      const source = readFileSync(
        fileURLToPath(new URL(relative, import.meta.url)),
        "utf8",
      );
      expect(source, relative).toContain("publicMediaEligibilityPredicate");
    }
  });
});
