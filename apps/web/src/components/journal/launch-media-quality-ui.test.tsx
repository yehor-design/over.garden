import { describe, expect, it } from "vitest";

import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";

describe("launch media quality degraded composer controls", () => {
  it.each(["uk", "bg", "ru"] as const)(
    "keeps localized remove-photo and text-save controls for %s",
    (locale) => {
      const copy = getGardenWorkspaceCopy(locale);
      expect(copy.composer.fields.removePhoto.length).toBeGreaterThan(3);
      expect(copy.composer.actions.saveOnline.length).toBeGreaterThan(3);
      expect(
        copy.composer.messages.visualRecoverableError.length,
      ).toBeGreaterThan(10);
    },
  );
});
