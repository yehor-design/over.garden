import { describe, expect, it } from "vitest";

import { getLegacyDeviceRetirementCopy } from "./legacy-device-retirement-copy";

describe("legacy device retirement copy", () => {
  it.each(["uk", "bg", "ru"] as const)(
    "describes only name-based cleanup and recovery actions in %s",
    (locale) => {
      const copy = getLegacyDeviceRetirementCopy(locale);

      expect(copy).toMatchObject({
        ariaLabel: expect.any(String),
        title: expect.any(String),
        reason: expect.any(String),
        states: {
          deleting: expect.any(String),
          deletionBlocked: expect.any(String),
          unresolved: expect.any(String),
          cancelled: expect.any(String),
        },
        actions: {
          retry: expect.any(String),
          cancel: expect.any(String),
          signOut: expect.any(String),
          dismiss: expect.any(String),
        },
      });
      expect(JSON.stringify(copy)).not.toMatch(
        /transfer|перенес|прехвър|draft|чернет|чернов|payload|photo|фото|сним/i,
      );
    },
  );
});
