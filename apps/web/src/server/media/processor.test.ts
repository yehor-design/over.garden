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
    };
  }),
}));

import { processQuarantinedImage } from "./processor";

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
      created_at: new Date("2026-06-26T00:00:00Z"),
      updated_at: new Date("2026-06-26T00:00:00Z"),
    } satisfies MediaAsset);

    expect(storageMock.calls).toEqual([
      "get-original",
      "create-derivative",
      "put-derivative",
    ]);
    expect(storageMock.getQuarantineObjectBuffer).toHaveBeenCalledWith(
      "quarantine/user/photo.png",
      MAX_COMPOSER_IMAGE_BYTES,
    );
    expect(result.derivativeKey).toBe("derivatives/user/photo.webp");
    expect(result.publicUrl).toBe(
      "https://media.over.garden/derivatives/user/photo.webp",
    );
  });
});
