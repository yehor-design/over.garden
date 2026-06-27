import { describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  requireCurrentUserId: vi.fn(
    async () => "00000000-0000-0000-0000-000000000001",
  ),
}));

const mediaRepositoryMock = vi.hoisted(() => ({
  createQuarantinedMediaAsset: vi.fn(async () => ({
    id: "00000000-0000-0000-0000-000000000010",
  })),
}));

const storageMock = vi.hoisted(() => ({
  createQuarantineUploadUrl: vi.fn(async () => ({
    uploadUrl: "https://uploads.example.test/quarantine-photo",
  })),
}));

vi.mock("@/server/auth-session", () => authMock);
vi.mock("@/server/media/media-repository", () => mediaRepositoryMock);
vi.mock("@/lib/storage", () => storageMock);

import { POST } from "./route";

describe("media upload API", () => {
  it("rejects attempts to pre-bind quarantined media to a journal entry", async () => {
    const response = await POST(
      new Request("http://localhost/api/media/uploads", {
        method: "POST",
        body: JSON.stringify({
          contentType: "image/jpeg",
          journalEntryId: "00000000-0000-0000-0000-000000000020",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(
      mediaRepositoryMock.createQuarantinedMediaAsset,
    ).not.toHaveBeenCalled();
    expect(storageMock.createQuarantineUploadUrl).not.toHaveBeenCalled();
  });

  it("creates quarantine uploads without an entry binding", async () => {
    mediaRepositoryMock.createQuarantinedMediaAsset.mockClear();
    storageMock.createQuarantineUploadUrl.mockClear();

    const response = await POST(
      new Request("http://localhost/api/media/uploads", {
        method: "POST",
        body: JSON.stringify({
          contentType: "image/webp",
        }),
      }),
    );
    const body = (await response.json()) as { mediaAssetId?: string };

    expect(response.status).toBe(200);
    expect(body.mediaAssetId).toBe("00000000-0000-0000-0000-000000000010");
    expect(
      mediaRepositoryMock.createQuarantinedMediaAsset,
    ).toHaveBeenCalledOnce();
    const createMediaCall = mediaRepositoryMock.createQuarantinedMediaAsset.mock
      .calls[0] as unknown[];
    expect(createMediaCall).toHaveLength(2);
    expect(createMediaCall[1]).toMatch(
      /^quarantine\/00000000-0000-0000-0000-000000000001\/.+\.webp$/,
    );
    expect(storageMock.createQuarantineUploadUrl).toHaveBeenCalledWith({
      objectKey: expect.stringMatching(
        /^quarantine\/00000000-0000-0000-0000-000000000001\/.+\.webp$/,
      ),
      contentType: "image/webp",
    });
  });
});
