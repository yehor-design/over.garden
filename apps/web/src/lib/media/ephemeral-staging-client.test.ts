import { describe, expect, it, vi } from "vitest";

import { BrowserEphemeralMediaStager } from "./ephemeral-staging-client";
import { buildEphemeralMediaUploadReservation } from "./ephemeral-staging-contract";

const ID = "8f5fa87d-b94e-4217-b68d-28303827ad89";
const SESSION = "46045ba1-d1dc-465a-aea9-0240785e3aa0";
const SHA = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/**
 * Built from the shared declaration rather than hand-written, so this suite and
 * the route suite cannot drift apart on the wire shape again. The previous
 * fixture used a fixed `expiresAt: 2_000_000_000`, a value the route has never
 * sent, which is how a total production failure coexisted with a green run.
 */
function reservationFixture(
  overrides: Partial<{
    uploadUrl: string;
    uploadCapability: string;
    expiresAt: number;
  }> = {},
) {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  return {
    ...buildEphemeralMediaUploadReservation({
      stagingOrigin: "https://media-stage.over.garden",
      binding: { stagingSessionId: SESSION, mediaAssetId: ID, generation: 1 },
      uploadCapability: "u".repeat(40),
      expiresAtSeconds: nowSeconds + 900,
      nowSeconds,
    }),
    ...overrides,
  };
}

describe("BrowserEphemeralMediaStager", () => {
  it("reserves a variant with its long edge and uploads it to the variant path (OVE-371)", async () => {
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          buildEphemeralMediaUploadReservation({
            stagingOrigin: "https://media-stage.over.garden",
            binding: {
              stagingSessionId: SESSION,
              mediaAssetId: ID,
              generation: 1,
              variant: 1280,
            },
            uploadCapability: "u".repeat(40),
            expiresAtSeconds: nowSeconds + 900,
            nowSeconds,
          }),
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            status: "staged",
            stagingReceipt: "v".repeat(40),
            deleteCapability: "w".repeat(40),
          },
          { status: 201 },
        ),
      );
    const stager = new BrowserEphemeralMediaStager({ fetcher });

    await expect(
      stager.stage({
        stagingSessionId: SESSION,
        mediaAssetId: ID,
        generation: 1,
        variant: 1280,
        blob: new Blob([new Uint8Array([82, 73, 70, 70])], {
          type: "image/webp",
        }),
        sha256: SHA,
        width: 1280,
        height: 960,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      stagingReceipt: "v".repeat(40),
      deleteCapability: "w".repeat(40),
    });
    expect(
      JSON.parse(String((fetcher.mock.calls[0]![1] as RequestInit).body)),
    ).toMatchObject({ variant: 1280, width: 1280, height: 960 });
    expect(fetcher.mock.calls[1]![0]).toBe(
      `https://media-stage.over.garden/v1/staging/${SESSION}/${ID}/1/v1280`,
    );
  });

  it("reserves with JSON and sends the WebP bytes directly to the Worker origin", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(reservationFixture()))
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
      Response.json(
        reservationFixture({
          uploadUrl: `https://attacker.example/v1/staging/${SESSION}/${ID}/1`,
        }),
      ),
    );
    const stager = new BrowserEphemeralMediaStager({
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
