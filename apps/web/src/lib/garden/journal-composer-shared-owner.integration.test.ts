import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd(), "src");

describe("OVE-213 shared journal composer integration", () => {
  it("routes every journal mode through the one Editor.js and reorder owner", () => {
    for (const file of [
      "app/garden/first-entry-composer.tsx",
      "app/garden/space-entry-composer.tsx",
      "app/garden/objects/[objectId]/follow-up-entry-composer.tsx",
      "app/garden/entries/[entryId]/edit/journal-entry-edit-composer.tsx",
    ]) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).toContain("<StructuredJournalComposer");
    }

    const sharedOwner = readFileSync(
      path.join(root, "components/garden/structured-journal-composer.tsx"),
      "utf8",
    );
    expect(sharedOwner).toContain("attachJournalBlockReorderController({");
  });
});
