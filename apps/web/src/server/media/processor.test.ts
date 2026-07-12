import type { MediaAsset } from "@/db/schema";
import { describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  calls: [] as string[],
}));

vi.mock("@/lib/storage", () => ({
  getQuarantineObjectBuffer: vi.fn(async () => {
    storageMock.calls.push("get-original");
    return Buffer.from("original");
  }),
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
  it("deletes the quarantine original before publishing the public derivative", async () => {
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
      original_deleted_at: null,
      created_at: new Date("2026-06-26T00:00:00Z"),
      updated_at: new Date("2026-06-26T00:00:00Z"),
    } satisfies MediaAsset);

    expect(storageMock.calls).toEqual([
      "get-original",
      "create-derivative",
      "delete-original",
      "put-derivative",
    ]);
    expect(result.derivativeKey).toBe("derivatives/user/photo.webp");
    expect(result.publicUrl).toBe(
      "https://media.over.garden/derivatives/user/photo.webp",
    );
  });
});
