import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd(), "src");

describe("OVE-243 vertical inline-media integration", () => {
  it("routes every create composer through the shared atomic selection owner", () => {
    for (const file of [
      "app/garden/first-entry-composer.tsx",
      "app/garden/space-entry-composer.tsx",
      "app/garden/objects/[objectId]/follow-up-entry-composer.tsx",
    ]) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).toContain("<StructuredJournalComposer");
      expect(source).toContain("useLocalJournalComposer({");
      expect(source).toContain('imageInsertionMode="immediate"');
      expect(source).toContain(
        "const selected = local.selectImage(file, blockId, mediaAssetId);",
      );
      expect(source).toContain("const ready = await selected.ready;");
      expect(source).not.toContain("useInlineMediaSelection(");
      expect(source).not.toContain("uploadOnlineComposerPhoto({");
      expect(source).not.toContain(
        "const existingBytes = sumOfflinePhotoIntentBytes",
      );
    }
  });

  it("gives edit selections one local generation-fenced identity before atomic save", () => {
    const source = readFileSync(
      path.join(
        root,
        "app/garden/entries/[entryId]/edit/journal-entry-edit-composer.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("<StructuredJournalComposer");
    expect(source).toContain("useLocalJournalComposer({");
    expect(source).toContain('imageInsertionMode="immediate"');
    expect(source).toContain(
      "const selected = local.selectImage(file, blockId, mediaAssetId);",
    );
    expect(source).toContain("local.replaceImage(mediaAssetId, file)");
    expect(source).not.toContain("uploadOnlineComposerPhoto({");
    expect(source).not.toContain("useInlineMediaSelection(");
    expect(source).not.toContain(
      "return { previewUrl: URL.createObjectURL(file) }",
    );
  });

  it("binds explicit save flush to the finite idle deadline", () => {
    const ownerSource = readFileSync(
      path.join(root, "components/garden/structured-journal-composer.tsx"),
      "utf8",
    );
    const lexicalSource = readFileSync(
      path.join(
        root,
        "components/garden/lexical-journal/journal-lexical-client.tsx",
      ),
      "utf8",
    );
    expect(ownerSource).toContain(
      'import("./lexical-journal/journal-lexical-client")',
    );
    expect(lexicalSource).toContain("await waitForComposerIdle({");
    expect(lexicalSource).not.toContain(
      "await new Promise((resolve) => setTimeout(resolve, 16))",
    );
  });
});
