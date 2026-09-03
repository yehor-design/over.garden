import { describe, expect, it } from "vitest";

import {
  canEncodeWebpNatively,
  encodeJournalImage,
  resetNativeWebpProbeForTests,
  toWebpDataUri,
} from "./journal-image-codec";

describe("journal image codec (OVE-371)", () => {
  it("reports no native WebP encoder where OffscreenCanvas is missing", async () => {
    resetNativeWebpProbeForTests();
    await expect(canEncodeWebpNatively()).resolves.toBe(false);
  });

  it("refuses an oversized or empty source before touching any decoder", async () => {
    await expect(
      encodeJournalImage(new Blob([]), { onPhase: () => undefined }),
    ).rejects.toThrow("source_bytes_exceeded");
    await expect(
      encodeJournalImage(new Blob([new Uint8Array([1, 2, 3])]), {
        onPhase: () => undefined,
      }),
    ).rejects.toThrow("unsupported_source");
  });

  it("renders a placeholder as an inline WebP data URI", () => {
    expect(toWebpDataUri(new Uint8Array([82, 73, 70, 70]).buffer)).toBe(
      "data:image/webp;base64,UklGRg==",
    );
  });
});
