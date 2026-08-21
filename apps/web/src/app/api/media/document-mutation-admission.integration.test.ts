import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_R2_PRESIGN_TTL_SECONDS,
  resolveEffectiveR2PresignTtlSeconds,
  resolveR2UploadUrlTtlConfiguration,
} from "@/lib/storage";
import {
  OnlineJournalSubmitError,
  uploadOnlineComposerPhoto,
} from "@/lib/garden/online-journal-submit";
import type { OnlineComposerPhotoIntent } from "@/lib/garden/composer-photo-selection";

const GENERATION = "opaque-document-generation";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("media document mutation admission", () => {
  it("closes the configured and effective R2 presign TTL", () => {
    expect(resolveR2UploadUrlTtlConfiguration({})).toEqual({
      source: "default",
      effectiveSeconds: 900,
    });
    expect(
      resolveR2UploadUrlTtlConfiguration({
        R2_UPLOAD_URL_TTL_SECONDS: "900",
      }),
    ).toEqual({ source: "environment", effectiveSeconds: 900 });
    expect(() =>
      resolveR2UploadUrlTtlConfiguration({
        R2_UPLOAD_URL_TTL_SECONDS: "901",
      }),
    ).toThrow("TTL configuration is invalid");
    expect(
      resolveEffectiveR2PresignTtlSeconds({
        configuration: { source: "default", effectiveSeconds: 900 },
        envelopeExpiresAtSeconds: 10_500,
        nowSeconds: 10_000,
      }),
    ).toBe(500);
    expect(MAX_R2_PRESIGN_TTL_SECONDS).toBe(900);
  });

  it("sends the generation to every same-origin media stage and never to R2", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, headers: new Headers(init?.headers) });
        if (url === "/api/media/uploads") {
          return Response.json({
            mediaAssetId: "media-1",
            uploadUrl: "https://r2.example.invalid/private-capability",
          });
        }
        if (url.startsWith("https://r2.example.invalid/")) {
          return new Response(null, { status: 200 });
        }
        if (url === "/api/media/process") {
          return Response.json({
            mediaAsset: { id: "media-1", status: "processed" },
            publicUrl: "https://media.example.invalid/opaque.webp",
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );

    await uploadOnlineComposerPhoto({
      intent: photoIntent(),
      authReturnTo: "/garden",
      documentMutationGeneration: GENERATION,
    });

    expect(calls.map((call) => call.url)).toEqual([
      "/api/media/uploads",
      "https://r2.example.invalid/private-capability",
      "/api/media/process",
    ]);
    for (const call of calls.filter((item) => item.url.startsWith("/"))) {
      expect(call.headers.get("x-overgarden-document-generation")).toBe(
        GENERATION,
      );
    }
    const r2Call = calls.find((call) => call.url.startsWith("https://r2"));
    expect(r2Call?.headers.has("x-overgarden-document-generation")).toBe(false);
    expect(r2Call?.headers.get("content-type")).toBe("image/jpeg");
  });

  it("stops after a closed stale-document response and retains opaque evidence", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ code: "DOCUMENT_OWNER_CHANGED" }, { status: 409 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    let received: unknown;
    try {
      await uploadOnlineComposerPhoto({
        intent: photoIntent(),
        authReturnTo: "/garden",
        documentMutationGeneration: GENERATION,
      });
    } catch (error) {
      received = error;
    }

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(received).toBeInstanceOf(OnlineJournalSubmitError);
    expect(received).toMatchObject({
      status: 409,
      documentMutationAdmission: "DOCUMENT_OWNER_CHANGED",
    });
    expect(JSON.stringify(received)).not.toMatch(
      /ownerUserId|sessionId|latitude|longitude|coordinates|private-capability/i,
    );
  });

  it("places admission before parsing or the first effect in every media route", () => {
    const sources = [
      readRoute("./uploads/route.ts"),
      readRoute("./process/route.ts"),
      readRoute("./[mediaAssetId]/focal/route.ts"),
    ];

    for (const source of sources) {
      const handler = source.slice(source.indexOf("export async function"));
      const admission = handler.indexOf("await admitDocumentMutation");
      expect(admission).toBeGreaterThan(0);
      const firstBodyRead = handler.search(/request\.json\(|context\.params/);
      expect(admission).toBeLessThan(firstBodyRead);
      const firstEffect = handler.search(
        /await (?:createQuarantinedMediaAsset|findMediaAssetForOwner|updateMediaAssetFocalForOwner)/,
      );
      expect(admission).toBeLessThan(firstEffect);
    }
  });
});

function photoIntent(): OnlineComposerPhotoIntent {
  const blob = new Blob(["synthetic-photo"], { type: "image/jpeg" });
  return {
    fileName: "synthetic.jpg",
    contentType: "image/jpeg",
    size: blob.size,
    blob,
  };
}

function readRoute(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}
