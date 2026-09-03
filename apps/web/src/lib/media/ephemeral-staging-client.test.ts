import { describe, expect, it, vi } from "vitest";

import { BrowserEphemeralMediaStager } from "./ephemeral-staging-client";

const ID = "8f5fa87d-b94e-4217-b68d-28303827ad89";
const SESSION = "46045ba1-d1dc-465a-aea9-0240785e3aa0";
const SHA = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

function sessionResponse(expiresAt = Math.floor(Date.now() / 1_000) + 900) {
  return Response.json({
    stagingSessionId: SESSION,
    sessionCapability: "s".repeat(40),
    expiresAt,
  });
}

function stagedResponse(receipt: string, deleteCapability: string) {
  return Response.json(
    { status: "staged", stagingReceipt: receipt, deleteCapability },
    { status: 201 },
  );
}

describe("BrowserEphemeralMediaStager (OVE-372 session contract)", () => {
  it("fetches one session capability and sends the WebP bytes straight to the Worker", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(stagedResponse("r".repeat(40), "d".repeat(40)))
      .mockResolvedValueOnce(stagedResponse("v".repeat(40), "w".repeat(40)));
    const stager = new BrowserEphemeralMediaStager({ fetcher });
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
        width: 2560,
        height: 1920,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      stagingReceipt: "r".repeat(40),
      deleteCapability: "d".repeat(40),
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/media/staging/sessions",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        body: JSON.stringify({ stagingSessionId: SESSION }),
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
          authorization: `Bearer ${"s".repeat(40)}`,
          "content-sha256": SHA,
          "content-type": "image/webp",
          "x-media-width": "2560",
          "x-media-height": "1920",
        }),
      }),
    );

    // A variant reuses the session and lands on its own path; no second
    // request reaches Vercel.
    await expect(
      stager.stage({
        stagingSessionId: SESSION,
        mediaAssetId: ID,
        generation: 1,
        variant: 1280,
        blob,
        sha256: SHA,
        width: 1280,
        height: 960,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      stagingReceipt: "v".repeat(40),
      deleteCapability: "w".repeat(40),
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2]![0]).toBe(
      `https://media-stage.over.garden/v1/staging/${SESSION}/${ID}/1/v1280`,
    );
  });

  it("prepares the session ahead of the first photo and renews it near expiry", async () => {
    let nowMs = 1_000_000_000_000;
    const nowSeconds = () => Math.floor(nowMs / 1_000);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) => {
        if (String(url) === "/api/media/staging/sessions") {
          return sessionResponse(nowSeconds() + 900);
        }
        if (String(url).endsWith("/touch")) {
          return Response.json({ status: "touched" });
        }
        return stagedResponse("r".repeat(40), "d".repeat(40));
      });
    const stager = new BrowserEphemeralMediaStager({
      fetcher,
      now: () => nowMs,
    });

    await stager.prepare(SESSION);
    await stager.touch(SESSION);
    expect(
      fetcher.mock.calls.filter(([url]) => String(url) === "/api/media/staging/sessions"),
    ).toHaveLength(1);
    expect(fetcher.mock.calls.at(-1)![0]).toBe(
      `https://media-stage.over.garden/v1/staging/${SESSION}/touch`,
    );

    // Less than three minutes left: the next use renews first.
    nowMs += (900 - 100) * 1_000;
    await stager.touch(SESSION);
    expect(
      fetcher.mock.calls.filter(([url]) => String(url) === "/api/media/staging/sessions"),
    ).toHaveLength(2);
  });

  it("uses only the generation-scoped delete capability for cleanup", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ status: "deleted" }));
    const stager = new BrowserEphemeralMediaStager({ fetcher });

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

  it("refuses a session answer for another session and asks again next time", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          stagingSessionId: ID,
          sessionCapability: "s".repeat(40),
          expiresAt: Math.floor(Date.now() / 1_000) + 900,
        }),
      )
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(stagedResponse("r".repeat(40), "d".repeat(40)));
    const stager = new BrowserEphemeralMediaStager({ fetcher });
    const input = {
      stagingSessionId: SESSION,
      mediaAssetId: ID,
      generation: 1,
      blob: new Blob([new Uint8Array([1])], { type: "image/webp" }),
      sha256: SHA,
      width: 1,
      height: 1,
      signal: new AbortController().signal,
    };

    await expect(stager.stage(input)).rejects.toMatchObject({
      code: "staging_session_invalid",
    });
    await expect(stager.stage(input)).resolves.toMatchObject({
      stagingReceipt: "r".repeat(40),
    });
  });

  it("bounds a stalled session request inside the same stage deadline", async () => {
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
      controlDeadlineMs: 5,
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
      code: expect.stringMatching(/^staging_(session|upload)_timeout$/),
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
