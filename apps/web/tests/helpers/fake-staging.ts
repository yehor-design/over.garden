import { randomBytes } from "node:crypto";
import type { BrowserContext, Page } from "playwright/test";

/**
 * The staging Worker is `media-stage.over.garden`, which a local run cannot
 * sign for, so specs that upload a photograph answer the session route and
 * the Worker themselves (`OVE-487`, `OVE-523`). What the browser sends is the
 * proof; the server's claim of those uploads is the ADR-0019 contract.
 */
export const STAGING_ORIGIN = "https://media-stage.over.garden";

/** Browser-made pixels in the format a phone hands over, no real photograph. */
export async function photograph(
  page: Page,
  orientation: "portrait" | "landscape",
  type: "image/jpeg" | "image/png",
) {
  const base64 = await page.evaluate(
    async ({ orientation, type }) => {
      const width = orientation === "portrait" ? 1200 : 1600;
      const height = orientation === "portrait" ? 1600 : 1200;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d")!;
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#2f6b2f");
      gradient.addColorStop(1, "#c9b037");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#7a3b12";
      for (let i = 0; i < 40; i += 1) {
        context.beginPath();
        context.arc(
          (i * 97) % width,
          (i * 131) % height,
          30 + (i % 7) * 9,
          0,
          7,
        );
        context.fill();
      }
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((value) => resolve(value!), type, 0.9),
      );
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(binary);
    },
    { orientation, type },
  );
  return Buffer.from(base64, "base64");
}

function token() {
  return randomBytes(36).toString("base64url");
}

export interface StagedUpload {
  mediaAssetId: string;
  generation: number;
  variant: number;
  status: number;
  contentType: string | null;
  width: number;
  height: number;
  bytes: number;
  receipt: string | null;
}

/**
 * The session route and the Worker, answered in the browser's own terms: a
 * session capability, then one receipt per staged WebP. Each upload waits for
 * `decide`, so a test can hold one mid-flight or refuse it.
 */
export async function fakeStaging(
  context: BrowserContext,
  decide: (upload: {
    mediaAssetId: string;
    generation: number;
    variant: number;
  }) => Promise<"stage" | "fail">,
) {
  const uploads: StagedUpload[] = [];
  const deletes: string[] = [];
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "PUT, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "*",
  };
  await context.route("**/api/media/staging/sessions", async (route) => {
    const { stagingSessionId } = route.request().postDataJSON() as {
      stagingSessionId: string;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        stagingSessionId,
        sessionCapability: token(),
        expiresAt: Math.floor(Date.now() / 1000) + 900,
      }),
    });
  });
  await context.route(`${STAGING_ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const path = new URL(request.url()).pathname.split("/").filter(Boolean);
    if (request.method() === "DELETE") {
      deletes.push(path[3] ?? "");
      await route.fulfill({
        status: 200,
        headers: cors,
        contentType: "application/json",
        body: "{}",
      });
      return;
    }
    if (request.method() === "POST" && path.at(-1) === "touch") {
      await route.fulfill({
        status: 200,
        headers: cors,
        contentType: "application/json",
        body: "{}",
      });
      return;
    }
    // /v1/staging/<session>/<asset>/<generation>[/v<edge>]
    const [, , , mediaAssetId, generation, variant] = path;
    const upload = {
      mediaAssetId: mediaAssetId!,
      generation: Number(generation),
      variant: variant ? Number(variant.slice(1)) : 0,
    };
    const headers = request.headers();
    const verdict = await decide(upload);
    const receipt = verdict === "stage" ? token() : null;
    uploads.push({
      ...upload,
      status: verdict === "stage" ? 200 : 503,
      contentType: headers["content-type"] ?? null,
      width: Number(headers["x-media-width"]),
      height: Number(headers["x-media-height"]),
      bytes: request.postDataBuffer()?.length ?? 0,
      receipt,
    });
    await route.fulfill(
      verdict === "stage"
        ? {
            status: 200,
            headers: cors,
            contentType: "application/json",
            body: JSON.stringify({
              status: "staged",
              stagingReceipt: receipt,
              deleteCapability: token(),
            }),
          }
        : {
            status: 503,
            headers: cors,
            contentType: "application/json",
            body: JSON.stringify({ code: "staging_unavailable" }),
          },
    );
  });
  return { uploads, deletes };
}
