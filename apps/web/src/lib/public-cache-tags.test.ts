import { describe, expect, it } from "vitest";

import {
  PUBLIC_CACHE_TAGS,
  publicCacheTag,
  publicEntryChangeTags,
  publicProfileChangeTags,
} from "./public-cache-tags";

describe("public cache tags", () => {
  it("names profiles by their normalized handle", () => {
    expect(publicCacheTag.profile("@Green_Thumb ")).toBe("profile:green_thumb");
    expect(publicCacheTag.engagement("journal_entry", "first")).toBe(
      "engagement:journal_entry:first",
    );
  });

  it("touches the entry, its owner, its object, every listing, and the sitemap on an entry change", () => {
    const tags = publicEntryChangeTags({
      entryId: "entry-1",
      publicSlug: "first-flowers",
      ownerUserId: "owner-1",
      plantObjectId: "object-1",
    });

    expect(tags).toEqual([
      "entry:entry-1",
      "entry-slug:first-flowers",
      "profile-owner:owner-1",
      "object:object-1",
      PUBLIC_CACHE_TAGS.catalog,
      PUBLIC_CACHE_TAGS.feed,
      PUBLIC_CACHE_TAGS.journals,
      PUBLIC_CACHE_TAGS.topics,
      PUBLIC_CACHE_TAGS.knowledge,
      PUBLIC_CACHE_TAGS.communities,
      PUBLIC_CACHE_TAGS.profiles,
      PUBLIC_CACHE_TAGS.sitemap,
    ]);
    expect(publicEntryChangeTags({ entryId: "entry-2" })).not.toContain(
      PUBLIC_CACHE_TAGS.catalog,
    );
  });

  it("touches the old and the new handle when a handle changes", () => {
    expect(
      publicProfileChangeTags({
        ownerUserId: "owner-1",
        handle: "new_handle",
        previousHandle: "old_handle",
      }),
    ).toEqual(
      expect.arrayContaining([
        "profile-owner:owner-1",
        "profile:new_handle",
        "profile:old_handle",
        PUBLIC_CACHE_TAGS.profiles,
      ]),
    );
  });
});
