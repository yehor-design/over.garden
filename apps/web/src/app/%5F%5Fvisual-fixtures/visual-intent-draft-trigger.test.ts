import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { seedVisualIntentDraft } from "./visual-intent-draft-trigger";

const OBJECT_ID = "18700003-0000-4000-8000-000000000001";
const OWNER_ID = "18700001-0000-4000-8000-000000000001";

describe("visual auth-intent draft trigger", () => {
  it("rehearses first-entry navigation without browser persistence", async () => {
    await expect(
      seedVisualIntentDraft({
        kind: "first_entry",
        ownerUserId: OWNER_ID,
      }),
    ).resolves.toBe(true);

    const source = await readFile(
      fileURLToPath(new URL("./visual-intent-draft-trigger.tsx", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/@\/lib\/offline|IndexedDB|indexedDB|Dexie/);
  });

  it("accepts an exact follow-up object without storing its payload", async () => {
    await expect(
      seedVisualIntentDraft({
        kind: "follow_up_entry",
        ownerUserId: OWNER_ID,
        objectId: OBJECT_ID,
      }),
    ).resolves.toBe(true);
  });

  it("rejects a follow-up rehearsal without its exact object", async () => {
    await expect(
      seedVisualIntentDraft({
        kind: "follow_up_entry",
        ownerUserId: OWNER_ID,
      }),
    ).rejects.toThrow("Fixture object id is required.");
  });
});
