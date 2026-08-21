import { describe, expect, it } from "vitest";

import { getLegacyDeviceRetirementCopy } from "./legacy-device-retirement-copy";

describe("legacy device retirement copy", () => {
  it.each(["uk", "bg", "ru"] as const)(
    "covers the complete safe state/action contract in %s",
    (locale) => {
      const copy = getLegacyDeviceRetirementCopy(locale);

      expect(copy.title).toBeTruthy();
      expect(copy.windowEnds).toBeTruthy();
      expect(copy.counts({ drafts: 2, mutations: 1, mediaIntents: 3 })).toMatch(
        /2|1|3/,
      );
      expect(copy.actions).toMatchObject({
        transfer: expect.any(String),
        retry: expect.any(String),
        cancel: expect.any(String),
        signOut: expect.any(String),
        discard: expect.any(String),
        keepDevice: expect.any(String),
        keepServer: expect.any(String),
      });
      for (const state of [
        "offered",
        "transferring",
        "verifying",
        "deleting",
        "completed",
        "failed_retryable",
        "conflict_blocked",
        "another_account",
        "foreign_or_orphan_retained",
        "divergent_copy",
        "bounded_inventory",
        "deletion_blocked",
        "session_changed",
      ] as const) {
        expect(copy.states[state]).toBeTruthy();
      }
      expect(JSON.stringify(copy)).not.toMatch(/sorry|вибач|извин/i);
    },
  );
});
