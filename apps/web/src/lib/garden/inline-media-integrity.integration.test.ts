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
      expect(source).toMatch(
        /useInlineMediaSelection\((ownerUserId|entryId)\)/,
      );
      expect(source).toContain("await selectInlineMedia({");
      expect(source).not.toContain(
        "const existingBytes = sumOfflinePhotoIntentBytes",
      );
    }
  });

  it("gives edit selections a processed durable identity before insertion", () => {
    const source = readFileSync(
      path.join(
        root,
        "app/garden/entries/[entryId]/edit/journal-entry-edit-composer.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("await uploadComposerPhotoIntent(");
    expect(source).toContain("return { mediaAssetId, previewUrl }");
    expect(source).not.toContain(
      "return { previewUrl: URL.createObjectURL(file) }",
    );
  });

  it("binds explicit save flush to the finite idle deadline", () => {
    const source = readFileSync(
      path.join(root, "components/garden/structured-journal-composer.tsx"),
      "utf8",
    );
    expect(source).toContain("await waitForComposerIdle({");
    expect(source).not.toContain(
      "await new Promise((resolve) => setTimeout(resolve, 16))",
    );
  });
});
