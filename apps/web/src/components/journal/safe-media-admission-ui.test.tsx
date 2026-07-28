import { describe, expect, it } from "vitest";

import {
  COMPOSER_PHOTO_ACCEPT,
  composerPhotoSelectionError,
} from "@/lib/garden/composer-photo-selection";
import { isJournalMediaWaitSafeControlDisabled } from "@/components/garden/journal-cover-controls";

describe("OVE-244 safe media UI contract", () => {
  it("keeps remove/no-photo controls available while media work waits", () => {
    expect(isJournalMediaWaitSafeControlDisabled(false)).toBe(false);
    expect(isJournalMediaWaitSafeControlDisabled(true)).toBe(true);
  });

  it("exposes the same closed image set to the browser", () => {
    expect(COMPOSER_PHOTO_ACCEPT).toContain("image/heic");
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/heic"]) {
      expect(composerPhotoSelectionError({ type, size: 1024 })).toBeNull();
    }
    expect(composerPhotoSelectionError({ type: "image/svg+xml", size: 1024 }))
      .toMatch(/JPEG, PNG, WebP, or HEIC/);
  });
});
