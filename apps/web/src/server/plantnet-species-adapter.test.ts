import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import {
  buildPlantNetFingerprint,
  classifyPlantNetStatus,
  identifyPlantSpecies,
  reencodePlantNetImage,
} from "./plantnet-species-adapter";

describe("Pl@ntNet species adapter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends only re-encoded JPEG binary parts and organ labels to the one species endpoint", async () => {
    const source = await sharp({
      create: { width: 24, height: 24, channels: 3, background: "green" },
    })
      .withMetadata({ exif: { IFD0: { Copyright: "private" } } })
      .png()
      .toBuffer();
    let observedUrl = "";
    let observedForm = new FormData();
    const result = await identifyPlantSpecies(
      [{ bytes: source, organ: "leaf" }],
      {
        enabled: true,
        apiKey: "test-key",
        fetchImpl: async (input, init) => {
          observedUrl = String(input);
          observedForm = init?.body as FormData;
          return Response.json({
            version: "model-v1",
            remainingIdentificationRequests: 7,
            results: [
              {
                score: 0.9,
                species: {
                  scientificNameWithoutAuthor: "Malus domestica",
                  genus: { scientificName: "Malus" },
                  family: { scientificName: "Rosaceae" },
                },
              },
            ],
          });
        },
      },
    );

    expect(observedUrl).toMatch(
      /^https:\/\/my-api\.plantnet\.org\/v2\/identify\/all\?/,
    );
    expect(observedUrl).toContain("no-reject=false");
    expect(observedUrl).toContain("include-related-images=false");
    expect(observedUrl).not.toContain("private");
    expect(observedForm.getAll("organs")).toEqual(["leaf"]);
    const image = observedForm.getAll("images")[0];
    expect(image).toBeInstanceOf(Blob);
    expect((image as Blob).type).toBe("image/jpeg");
    expect(result.candidates).toEqual([
      {
        rank: 1,
        score: 0.9,
        scientificName: "Malus domestica",
        genus: "Malus",
        family: "Rosaceae",
      },
    ]);
  });

  it("re-encodes a processed derivative without retaining embedded metadata", async () => {
    const source = await sharp({
      create: { width: 24, height: 24, channels: 3, background: "green" },
    })
      .withMetadata({ exif: { IFD0: { Copyright: "private" } } })
      .png()
      .toBuffer();
    const derivative = await reencodePlantNetImage(source);
    const metadata = await sharp(derivative.bytes).metadata();

    expect(metadata.format).toBe("jpeg");
    expect(metadata.exif).toBeUndefined();
    expect(derivative.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("has a stable owner-scoped fingerprint and closed provider status classes", () => {
    const input = {
      ownerUserId: "00000000-0000-4000-8000-000000000001",
      images: [
        { derivativeSha256: "a".repeat(64), organ: "leaf" as const },
        { derivativeSha256: "b".repeat(64), organ: "flower" as const },
      ],
    };
    expect(buildPlantNetFingerprint(input)).toBe(
      buildPlantNetFingerprint({
        ...input,
        images: [...input.images].reverse(),
      }),
    );
    expect(classifyPlantNetStatus(429)).toBe("rate_limited");
    expect(classifyPlantNetStatus(401)).toBe("provider_unavailable");
    expect(classifyPlantNetStatus(422)).toBe("provider_rejected_non_plant");
  });

  it("records the provider's daily allowance separately from a short rate limit", async () => {
    const source = await sharp({
      create: { width: 24, height: 24, channels: 3, background: "green" },
    })
      .png()
      .toBuffer();

    await expect(
      identifyPlantSpecies(
        [{ bytes: source, organ: "auto" }],
        {
          enabled: true,
          apiKey: "test-key",
          fetchImpl: async () =>
            new Response(JSON.stringify({ error: "Daily quota exceeded" }), {
              status: 429,
            }),
        },
      ),
    ).rejects.toMatchObject({ code: "quota_exhausted" });
  });

  it("aborts one overdue submission at the fixed deadline without a retry", async () => {
    vi.useFakeTimers();
    const source = await sharp({
      create: { width: 24, height: 24, channels: 3, background: "green" },
    })
      .png()
      .toBuffer();
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) throw new Error("Missing abort signal.");
          if (signal.aborted) {
            reject(new Error("request already aborted"));
            return;
          }
          signal.addEventListener("abort", () =>
            reject(new Error("request timed out")),
          );
        }),
    );
    const pending = identifyPlantSpecies(
      [{ bytes: source, organ: "auto" }],
      { enabled: true, apiKey: "test-key", fetchImpl },
    );

    const rejection = expect(pending).rejects.toMatchObject({
      code: "provider_timeout",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
