import { describe, expect, it, vi } from "vitest";

import { BrowserEphemeralMediaStager } from "./ephemeral-staging-client";

const ID = "8f5fa87d-b94e-4217-b68d-28303827ad89";
const SESSION = "46045ba1-d1dc-465a-aea9-0240785e3aa0";
const SHA = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

describe("BrowserEphemeralMediaStager", () => {
  it("reserves with JSON and sends the WebP bytes directly to the Worker origin", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          uploadUrl: `https://media-stage.over.garden/v1/staging/${SESSION}/${ID}/1`,
          uploadCapability: "u".repeat(40),
          expiresAt: 2_000_000_000,
        }),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            status: "staged",
            stagingReceipt: "r".repeat(40),
            deleteCapability: "d".repeat(40),
          },
          { status: 201 },
        ),
      );
    const stager = new BrowserEphemeralMediaStager({
      documentMutationGeneration: "signed-generation",
      fetcher,
    });
    const blob = new Blob([new Uint8Array([82, 73, 70, 70])], {
      type: "image/webp",
    });

    await expect(
      stager.stage({
        stagingSessionId: SESSION,
        mediaAssetId: ID,
        generation: 1,
        blob,
        sha256: SHA,
        width: 1,
        height: 1,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      stagingReceipt: "r".repeat(40),
      deleteCapability: "d".repeat(40),
    });

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/media/staging/reservations",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-overgarden-document-generation": "signed-generation",
        }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `https://media-stage.over.garden/v1/staging/${SESSION}/${ID}/1`,
      expect.objectContaining({
        method: "PUT",
        redirect: "error",
        body: blob,
        headers: expect.objectContaining({
          authorization: `Bearer ${"u".repeat(40)}`,
          "content-sha256": SHA,
          "content-type": "image/webp",
        }),
      }),
    );
  });

  it("uses only the generation-scoped delete capability for cleanup", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ status: "deleted" }));
    const stager = new BrowserEphemeralMediaStager({
      documentMutationGeneration: "signed-generation",
      fetcher,
    });

    await stager.delete({
      stagingSessionId: SESSION,
      mediaAssetId: ID,
      generation: 3,
      deleteCapability: "d".repeat(40),
    });

    expect(fetcher).toHaveBeenCalledWith(
      `https://media-stage.over.garden/v1/staging/${SESSION}/${ID}/3`,
      expect.objectContaining({
        method: "DELETE",
        redirect: "error",
        headers: { authorization: `Bearer ${"d".repeat(40)}` },
      }),
    );
  });

  it("rejects a provider upload URL outside the exact staging origin", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        uploadUrl: `https://attacker.example/v1/staging/${SESSION}/${ID}/1`,
        uploadCapability: "u".repeat(40),
        expiresAt: 2_000_000_000,
      }),
    );
    const stager = new BrowserEphemeralMediaStager({
      documentMutationGeneration: "signed-generation",
      fetcher,
    });

    await expect(
      stager.stage({
        stagingSessionId: SESSION,
        mediaAssetId: ID,
        generation: 1,
        blob: new Blob([new Uint8Array([1])], { type: "image/webp" }),
        sha256: SHA,
        width: 1,
        height: 1,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "staging_reservation_invalid" });
  });

  it("bounds a stalled reservation inside the same stage deadline", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("deadline", "AbortError")),
            { once: true },
          );
        }),
    ) as unknown as typeof fetch;
    const stager = new BrowserEphemeralMediaStager({
      documentMutationGeneration: "signed-generation",
      fetcher,
      uploadDeadlineMs: 5,
    });

    const stage = stager.stage({
      stagingSessionId: SESSION,
      mediaAssetId: ID,
      generation: 1,
      blob: new Blob([new Uint8Array([1])], { type: "image/webp" }),
      sha256: SHA,
      width: 1,
      height: 1,
      signal: new AbortController().signal,
    });
    const rejection = expect(stage).rejects.toMatchObject({
      code: "staging_upload_timeout",
    });
    await vi.advanceTimersByTimeAsync(6);

    await rejection;
    vi.useRealTimers();
  });

  it("bounds a stalled generation delete", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("deadline", "AbortError")),
            { once: true },
          );
        }),
    ) as unknown as typeof fetch;
    const stager = new BrowserEphemeralMediaStager({
      documentMutationGeneration: "signed-generation",
      fetcher,
      controlDeadlineMs: 5,
    });
    const removal = stager.delete({
      stagingSessionId: SESSION,
      mediaAssetId: ID,
      generation: 3,
      deleteCapability: "d".repeat(40),
    });
    const rejection = expect(removal).rejects.toMatchObject({
      code: "staging_delete_timeout",
    });
    await vi.advanceTimersByTimeAsync(6);

    await rejection;
    vi.useRealTimers();
  });
});
