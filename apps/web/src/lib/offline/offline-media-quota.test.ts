import { describe, expect, it } from "vitest";

import {
  MAX_OFFLINE_PHOTO_LOGICAL_BYTES,
  canAcceptOfflinePhotoBytes,
  sumOfflinePhotoIntentBytes,
} from "./offline-media-quota";

describe("offline media quota", () => {
  it("sums intent sizes and enforces the 120 MiB logical ceiling", () => {
    expect(
      sumOfflinePhotoIntentBytes([
        { fileName: "a.jpg", contentType: "image/jpeg", size: 10 },
        { fileName: "b.jpg", contentType: "image/jpeg", size: 20 },
        null,
      ]),
    ).toBe(30);

    expect(
      canAcceptOfflinePhotoBytes({
        existingBytes: MAX_OFFLINE_PHOTO_LOGICAL_BYTES - 100,
        nextBytes: 50,
      }),
    ).toBe(true);

    expect(
      canAcceptOfflinePhotoBytes({
        existingBytes: MAX_OFFLINE_PHOTO_LOGICAL_BYTES - 100,
        nextBytes: 101,
      }),
    ).toBe(false);
  });
});
