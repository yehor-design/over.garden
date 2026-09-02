import { describe, expect, it } from "vitest";

import { normalizePublicJournalDirectoryReturnTo } from "./public-journal-directory-navigation";

describe("public journal directory return navigation", () => {
  it("keeps only the directory's own query keys", () => {
    expect(
      normalizePublicJournalDirectoryReturnTo(
        "/bg/journals?kind=plant&page=2&unknown=1",
        "uk",
      ),
    ).toBe("/bg/journals?kind=plant&page=2");
  });

  it("rejects external and unsupported return paths", () => {
    expect(
      normalizePublicJournalDirectoryReturnTo(
        "https://evil.example/journals",
        "ru",
      ),
    ).toBe("/ru/journals");
    expect(normalizePublicJournalDirectoryReturnTo("/garden?x=1", "bg")).toBe(
      "/bg/journals",
    );
  });
});
