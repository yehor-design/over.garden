import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = (...segments: string[]) =>
  readFile(path.join(process.cwd(), "src", ...segments), "utf8");

describe("garden media native-runtime boundary", () => {
  it("keeps the repository lease contract decoder-free while retaining sharp admission", async () => {
    const [contract, repository, admission, gardenPage] = await Promise.all([
      source("server", "media", "media-processing-contract.ts"),
      source("server", "media", "media-repository.ts"),
      source("server", "media", "safe-media-admission.ts"),
      source("app", "garden", "page.tsx"),
    ]);

    expect(contract).toContain(
      "export const SAFE_MEDIA_PROCESSING_LEASE_SECONDS = 90",
    );
    expect(contract).not.toMatch(/from\s+["']sharp["']/);
    expect(repository).toContain(
      'from "@/server/media/media-processing-contract"',
    );
    expect(repository).not.toContain(
      'from "@/server/media/safe-media-admission"',
    );
    expect(admission).toContain('import sharp from "sharp"');
    expect(admission).toContain(
      'from "./media-processing-contract"',
    );
    expect(gardenPage).toContain('from "@/server/journal-repository"');
  });
});
