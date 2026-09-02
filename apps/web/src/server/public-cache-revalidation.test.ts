import { revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidatePublicCacheTags } from "./public-cache-revalidation";

describe("public cache revalidation", () => {
  beforeEach(() => {
    vi.mocked(revalidateTag).mockClear();
    vi.mocked(updateTag).mockClear();
  });

  it("marks tags stale-while-revalidate for edits", () => {
    revalidatePublicCacheTags(["feed", "feed", "entry:1"], "stale");

    expect(vi.mocked(revalidateTag).mock.calls).toEqual([
      ["feed", "max"],
      ["entry:1", "max"],
    ]);
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("expires tags immediately for deletions from route handlers", () => {
    revalidatePublicCacheTags(["entry:1"], "expire");

    expect(revalidateTag).toHaveBeenCalledWith("entry:1", { expire: 0 });
  });

  it("uses updateTag for read-your-own-writes in Server Actions", () => {
    revalidatePublicCacheTags(["profile:me"], "update");

    expect(updateTag).toHaveBeenCalledWith("profile:me");
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
