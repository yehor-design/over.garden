import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd(), "src");

describe("shared journal composer integration", () => {
  it("routes every journal mode through one lazy Lexical owner", () => {
    for (const file of [
      "app/garden/first-entry-composer.tsx",
      "app/garden/space-entry-composer.tsx",
      "app/garden/objects/[objectId]/follow-up-entry-composer.tsx",
      "app/garden/entries/[entryId]/edit/journal-entry-edit-composer.tsx",
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

  it("waits for every owner-scoped server draft to hydrate before Lexical binds", () => {
    for (const file of [
      "app/garden/first-entry-composer.tsx",
      "app/garden/space-entry-composer.tsx",
      "app/garden/objects/[objectId]/follow-up-entry-composer.tsx",
      "app/garden/entries/[entryId]/edit/journal-entry-edit-composer.tsx",
    ]) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).toContain("useOnlineJournalComposer({");
      expect(source).toMatch(
        /bindingReady=\{(?:draftHydrated|online\.state\.hydrated)\}/,
      );
      expect(source).not.toMatch(/@\/lib\/offline|IndexedDB|indexedDB|Dexie/);
    }

    const followUpOwner = readFileSync(
      path.join(
        root,
        "app/garden/objects/[objectId]/follow-up-entry-composer.tsx",
      ),
      "utf8",
    );
    expect(followUpOwner).toContain("const draftHydrated = online.state.hydrated");

    const sharedOwner = readFileSync(
      path.join(root, "components/garden/structured-journal-composer.tsx"),
      "utf8",
    );
    expect(sharedOwner).toContain("bindingReady?: boolean");
    expect(sharedOwner).toContain("if (props.bindingReady === false)");
  });
});
