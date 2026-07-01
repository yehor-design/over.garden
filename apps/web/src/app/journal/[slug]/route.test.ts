import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicJournalEntryLookup: vi.fn(),
}));

vi.mock("@/server/journal-repository", () => ({
  getPublicJournalEntryLookup: mocks.getPublicJournalEntryLookup,
}));

import { GET } from "./route";

describe("public journal route", () => {
  beforeEach(() => {
    mocks.getPublicJournalEntryLookup.mockReset();
  });

  it("returns a safe 404 HTML response for an unknown public slug", async () => {
    mocks.getPublicJournalEntryLookup.mockResolvedValue({
      status: "not_found",
    });

    const response = await GET(
      new Request("https://over.garden/journal/missing"),
      {
        params: Promise.resolve({ slug: "missing" }),
      },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(await response.text()).toContain("Entry not found");
    expect(mocks.getPublicJournalEntryLookup).toHaveBeenCalledWith("missing");
  });
});
