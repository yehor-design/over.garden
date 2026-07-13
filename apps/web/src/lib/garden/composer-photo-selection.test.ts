import { describe, expect, it } from "vitest";

import {
  clearComposerPhotoIntent,
  composerPhotoSelectionError,
  createComposerPhotoIntent,
  isSupportedComposerPhoto,
} from "./composer-photo-selection";
import { MAX_COMPOSER_IMAGE_BYTES } from "@/lib/media/image-limits";

describe("composer photo selection", () => {
  it("accepts only the image types supported by the composer", () => {
    expect(
      isSupportedComposerPhoto(
        new File(["a"], "a.jpg", { type: "image/jpeg" }),
      ),
    ).toBe(true);
    expect(
      isSupportedComposerPhoto(new File(["a"], "a.png", { type: "image/png" })),
    ).toBe(true);
    expect(
      isSupportedComposerPhoto(
        new File(["a"], "a.webp", { type: "image/webp" }),
      ),
    ).toBe(true);
    expect(
      isSupportedComposerPhoto(new File(["a"], "a.gif", { type: "image/gif" })),
    ).toBe(false);
  });

  it("rejects empty and oversized images before persisting private bytes", async () => {
    const empty = new File([], "empty.jpg", { type: "image/jpeg" });
    const oversized = {
      type: "image/jpeg",
      size: MAX_COMPOSER_IMAGE_BYTES + 1,
    };

    expect(isSupportedComposerPhoto(empty)).toBe(false);
    expect(isSupportedComposerPhoto(oversized)).toBe(false);
    expect(composerPhotoSelectionError(oversized)).toBe(
      "Choose a photo up to 12 MB.",
    );
    await expect(createComposerPhotoIntent(empty)).rejects.toThrow(
      "Choose a photo up to 12 MB.",
    );
  });

  it("copies the replacement photo bytes and can clear the selection", async () => {
    const first = await createComposerPhotoIntent(
      new File([new Uint8Array([1, 2, 3])], "first.jpg", {
        type: "image/jpeg",
      }),
    );
    const replacement = await createComposerPhotoIntent(
      new File([new Uint8Array([9, 8, 7])], "replacement.webp", {
        type: "image/webp",
      }),
    );

    expect(first.fileName).toBe("first.jpg");
    expect(replacement.fileName).toBe("replacement.webp");
    expect(replacement.contentType).toBe("image/webp");
    expect(new Uint8Array(await replacement.blob!.arrayBuffer())).toEqual(
      new Uint8Array([9, 8, 7]),
    );
    expect(clearComposerPhotoIntent()).toBeNull();
  });
});
