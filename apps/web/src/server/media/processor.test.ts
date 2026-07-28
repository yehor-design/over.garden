import type { MediaAsset } from "@/db/schema";
import { MAX_COMPOSER_IMAGE_BYTES } from "@/lib/media/image-limits";
import { describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  calls: [] as string[],
  getQuarantineObjectBuffer: vi.fn(async () => {
    storageMock.calls.push("get-original");
    return Buffer.from("original");
  }),
}));
const qualityMock = vi.hoisted(() => ({
  classifyLaunchMediaDerivative: vi.fn<
    () => Promise<{
      policyVersion: string;
      qualityClass: "accepted" | "rejected" | "review_required";
      reasonCodes: string[];
      metrics: {
        sampledPixels: number;
        visibleFraction: number;
        meanLuminance: number;
        luminanceDeviation: number;
        luminanceEntropy: number;
        edgeEnergy: number;
        occupiedColorBins: number;
      };
    }>
  >(async () => ({
    policyVersion: "ove231.launch-media-quality.v1",
    qualityClass: "accepted",
    reasonCodes: ["quality_accepted"],
    metrics: {
      sampledPixels: 4096,
      visibleFraction: 1,
      meanLuminance: 96,
      luminanceDeviation: 24,
      luminanceEntropy: 3,
      edgeEnergy: 4,
      occupiedColorBins: 24,
    },
  })),
}));

vi.mock("@/lib/storage", () => ({
  getQuarantineObjectBuffer: storageMock.getQuarantineObjectBuffer,
  deleteQuarantineObject: vi.fn(async () => {
    storageMock.calls.push("delete-original");
  }),
  putPublicDerivativeObject: vi.fn(async () => {
    storageMock.calls.push("put-derivative");
  }),
  getPublicDerivativeUrl: vi.fn(
    (objectKey: string) => `https://media.over.garden/${objectKey}`,
  ),
}));

vi.mock("./derivatives", () => ({
  createPublicImageDerivative: vi.fn(async () => {
    storageMock.calls.push("create-derivative");
    return {
      buffer: Buffer.from("derivative"),
      contentType: "image/webp",
      extension: "webp",
      width: 800,
      height: 600,
    };
  }),
}));
vi.mock("./safe-media-admission", () => ({
  admitSafeMediaBytes: vi.fn(async () => "image/png"),
}));
vi.mock("./launch-media-quality", () => ({
  classifyLaunchMediaDerivative: qualityMock.classifyLaunchMediaDerivative,
}));

const safeFields = {
  admitted_media_type: null,
  declared_media_type: "image/png",
  declared_size_bytes: "8",
  media_readiness_state: "processing",
  processing_claim_token: "00000000-0000-4000-8000-000000000010",
  processing_claimed_at: new Date("2026-06-26T00:00:00Z"),
  public_object_id: "00000000-0000-4000-8000-000000000011",
  upload_generation: 1,
  upload_generation_id: "00000000-0000-4000-8000-000000000012",
  quality_policy_version: null,
  quality_class: null,
  quality_reason_codes: null,
  quality_metrics: null,
  quality_evaluated_at: null,
} as const;

import { MediaLaunchQualityError, processQuarantinedImage } from "./processor";
import { createPublicImageDerivative } from "./derivatives";

describe("processQuarantinedImage", () => {
  it("publishes the derivative while leaving original cleanup to the durable route", async () => {
    storageMock.calls = [];

    const result = await processQuarantinedImage({
      id: "00000000-0000-0000-0000-000000000001",
      owner_user_id: "00000000-0000-0000-0000-000000000002",
      journal_entry_id: null,
      quarantine_key: "quarantine/user/photo.png",
      derivative_key: null,
      alt_text: null,
      caption: null,
      status: "quarantined",
      document_position: null,
      original_deleted_at: null,
      usage_role: "inline",
      revoked_at: null,
      public_unreachable_at: null,
      intrinsic_width: null,
      intrinsic_height: null,
      focal_x: 0.5,
      focal_y: 0.5,
      created_at: new Date("2026-06-26T00:00:00Z"),
      updated_at: new Date("2026-06-26T00:00:00Z"),
      ...safeFields,
    } satisfies MediaAsset);

    expect(storageMock.calls).toEqual([
      "get-original",
      "create-derivative",
      "put-derivative",
    ]);
    expect(storageMock.getQuarantineObjectBuffer).toHaveBeenCalledWith(
      "quarantine/user/photo.png",
      MAX_COMPOSER_IMAGE_BYTES,
      undefined,
    );
    expect(result.derivativeKey).toBe(
      "derivatives/00000000-0000-4000-8000-000000000011.webp",
    );
    expect(result.publicUrl).toBe(
      "https://media.over.garden/derivatives/00000000-0000-4000-8000-000000000011.webp",
    );
    expect(result.intrinsicWidth).toBe(800);
    expect(result.intrinsicHeight).toBe(600);
  });

  it("rejects tiny launch-quality failures before publishing", async () => {
    vi.mocked(createPublicImageDerivative).mockResolvedValueOnce({
      buffer: Buffer.from("tiny"),
      contentType: "image/webp",
      extension: "webp",
      width: 10,
      height: 10,
    });

    await expect(
      processQuarantinedImage({
        id: "00000000-0000-0000-0000-000000000001",
        owner_user_id: "00000000-0000-0000-0000-000000000002",
        journal_entry_id: null,
        quarantine_key: "quarantine/user/tiny.png",
        derivative_key: null,
        alt_text: null,
        caption: null,
        status: "quarantined",
        document_position: null,
        original_deleted_at: null,
        usage_role: "inline",
        revoked_at: null,
        public_unreachable_at: null,
        intrinsic_width: null,
        intrinsic_height: null,
        focal_x: 0.5,
        focal_y: 0.5,
        created_at: new Date("2026-06-26T00:00:00Z"),
        updated_at: new Date("2026-06-26T00:00:00Z"),
        ...safeFields,
      } satisfies MediaAsset),
    ).rejects.toBeInstanceOf(MediaLaunchQualityError);
  });

  it("does not publish a derivative classified for review", async () => {
    storageMock.calls = [];
    qualityMock.classifyLaunchMediaDerivative.mockResolvedValueOnce({
      policyVersion: "ove231.launch-media-quality.v1",
      qualityClass: "review_required",
      reasonCodes: ["ambiguous_dark_low_contrast"],
      metrics: {
        sampledPixels: 4096,
        visibleFraction: 1,
        meanLuminance: 12,
        luminanceDeviation: 4,
        luminanceEntropy: 1,
        edgeEnergy: 1,
        occupiedColorBins: 8,
      },
    });

    await expect(
      processQuarantinedImage({
        id: "00000000-0000-0000-0000-000000000001",
        owner_user_id: "00000000-0000-0000-0000-000000000002",
        journal_entry_id: null,
        quarantine_key: "quarantine/user/dark.png",
        derivative_key: null,
        alt_text: null,
        caption: null,
        status: "quarantined",
        document_position: null,
        original_deleted_at: null,
        usage_role: "inline",
        revoked_at: null,
        public_unreachable_at: null,
        intrinsic_width: null,
        intrinsic_height: null,
        focal_x: 0.5,
        focal_y: 0.5,
        created_at: new Date("2026-06-26T00:00:00Z"),
        updated_at: new Date("2026-06-26T00:00:00Z"),
        ...safeFields,
      } satisfies MediaAsset),
    ).rejects.toMatchObject({ qualityClass: "review_required" });

    expect(storageMock.calls).toEqual(["get-original", "create-derivative"]);
  });
});
