import { describe, expect, it } from "vitest";

import { normalizePublicJournalDirectoryReturnTo } from "./public-journal-directory-navigation";

describe("public journal directory return navigation", () => {
  it("strips visual fixture state unless the caller proves an isolated environment", () => {
    const value = "/bg/journals?kind=plant&page=2&__visualJournals=corpus";

    expect(normalizePublicJournalDirectoryReturnTo(value, "uk")).toBe(
      "/bg/journals?kind=plant&page=2",
    );
    expect(normalizePublicJournalDirectoryReturnTo(value, "uk", true)).toBe(
      "/bg/journals?kind=plant&page=2&__visualJournals=corpus",
    );
  });

  it("rejects external and unsupported return paths", () => {
    expect(
      normalizePublicJournalDirectoryReturnTo(
        "https://evil.example/journals",
        "ru",
        true,
      ),
    ).toBe("/ru/journals");
    expect(
      normalizePublicJournalDirectoryReturnTo(
        "/garden?__visualJournals=corpus",
        "bg",
        true,
      ),
    ).toBe("/bg/journals");
  });
});
