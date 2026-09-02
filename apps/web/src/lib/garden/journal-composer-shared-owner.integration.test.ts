import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd(), "src");

describe("shared journal composer integration", () => {
  it("routes every journal mode through one lazy Lexical owner", () => {
    for (const file of [
      "app/(default)/garden/first-entry-composer.tsx",
      "app/(default)/garden/space-entry-composer.tsx",
      "app/(default)/garden/objects/[objectId]/follow-up-entry-composer.tsx",
      "app/(default)/garden/entries/[entryId]/edit/journal-entry-edit-composer.tsx",
    ]) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).toContain("<StructuredJournalComposer");
      expect(source).not.toMatch(/from ["'](?:@lexical\/|lexical["'])/);
    }

    const sharedOwner = readFileSync(
      path.join(root, "components/garden/structured-journal-composer.tsx"),
      "utf8",
    );
    expect(sharedOwner).toContain(
      'import("./lexical-journal/journal-lexical-client")',
    );
  });

  it("binds local-only create owners immediately without durable browser or server drafts", () => {
    for (const file of [
      "app/(default)/garden/first-entry-composer.tsx",
      "app/(default)/garden/space-entry-composer.tsx",
      "app/(default)/garden/objects/[objectId]/follow-up-entry-composer.tsx",
    ]) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).toContain("useLocalJournalComposer({");
      expect(source).toMatch(/\bbindingReady\b/);
      expect(source).not.toContain("useOnlineJournalComposer({");
      expect(source).not.toMatch(/@\/lib\/offline|IndexedDB|indexedDB|Dexie/);
    }
  });

  it("cuts edit over to the same local-only atomic owner without server drafts", () => {
    const editOwner = readFileSync(
      path.join(
        root,
        "app/(default)/garden/entries/[entryId]/edit/journal-entry-edit-composer.tsx",
      ),
      "utf8",
    );
    expect(editOwner).toContain("useLocalJournalComposer({");
    expect(editOwner).toContain("publishEdit({");
    expect(editOwner).toMatch(/\bbindingReady\b/);
    expect(editOwner).not.toContain("useOnlineJournalComposer({");
    expect(editOwner).not.toContain("JournalEntryDraftPayloadV1");
    expect(editOwner).not.toMatch(/@\/lib\/offline|IndexedDB|indexedDB|Dexie/);

    const sharedOwner = readFileSync(
      path.join(root, "components/garden/structured-journal-composer.tsx"),
      "utf8",
    );
    expect(sharedOwner).toContain("bindingReady?: boolean");
    expect(sharedOwner).toContain("if (props.bindingReady === false)");
  });
});
