import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = (...segments: string[]) =>
  readFile(path.join(process.cwd(), "src", ...segments), "utf8");

describe("garden media native-runtime boundary", () => {
  it("keeps final-media repositories decoder-free and retired processors absent", async () => {
    const [repository, storage, gardenPage] = await Promise.all([
      source("server", "media", "media-repository.ts"),
      source("lib", "storage.ts"),
      source("app", "garden", "page.tsx"),
    ]);

    expect(repository).not.toMatch(/processing_claim|quarantine|sharp/i);
    expect(storage).not.toMatch(/presign|quarantine|sharp/i);
    expect(gardenPage).toContain('from "@/server/journal-repository"');
    await expect(
      access(path.join(process.cwd(), "src/server/media/processor.ts")),
    ).rejects.toThrow();
    await expect(
      access(path.join(process.cwd(), "src/server/media/safe-media-admission.ts")),
    ).rejects.toThrow();
  });
});
