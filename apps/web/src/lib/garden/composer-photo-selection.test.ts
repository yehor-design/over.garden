import { describe, expect, it } from "vitest";

import {
  clearComposerPhotoIntent,
  createComposerPhotoIntent,
  isSupportedComposerPhoto,
} from "./composer-photo-selection";

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
