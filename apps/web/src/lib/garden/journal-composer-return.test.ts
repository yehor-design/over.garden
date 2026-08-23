import { describe, expect, it } from "vitest";

import {
  journalCreateReturnFallback,
  normalizeJournalComposerReturnTo,
} from "./journal-composer-return";

describe("atomic journal composer return target", () => {
  it("preserves a same-origin path, query, and hash exactly", () => {
    expect(
      normalizeJournalComposerReturnTo(
        "/garden/objects/00000000-0000-4000-8000-000000000001?tab=journal#entry",
        "/garden",
      ),
    ).toBe(
      "/garden/objects/00000000-0000-4000-8000-000000000001?tab=journal#entry",
    );
    expect(
      normalizeJournalComposerReturnTo(
        "https://over.garden/bg/journals?from=garden#latest",
        "/garden",
        "https://over.garden",
      ),
    ).toBe("/bg/journals?from=garden#latest");
  });

  it.each([
    "https://example.test/garden",
    "//example.test/garden",
    "/api/garden/entries",
    "/_next/static/chunk.js",
    "/garden\\evil",
    "javascript:alert(1)",
    "",
  ])("fails closed to the context fallback for %s", (unsafe) => {
    expect(
      normalizeJournalComposerReturnTo(
        unsafe,
        "/garden/objects/00000000-0000-4000-8000-000000000001",
        "https://over.garden",
      ),
    ).toBe("/garden/objects/00000000-0000-4000-8000-000000000001");
  });

  it("derives deterministic fallbacks for all three create contexts", () => {
    expect(journalCreateReturnFallback({ target: "first_plant_entry" })).toBe(
      "/garden",
    );
    expect(
      journalCreateReturnFallback({
        target: "plant_object_entry",
        plantObjectId: "00000000-0000-4000-8000-000000000001",
      }),
    ).toBe("/garden/objects/00000000-0000-4000-8000-000000000001");
    expect(journalCreateReturnFallback({ target: "space_entry" })).toBe(
      "/garden",
    );
  });
});
