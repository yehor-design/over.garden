import { describe, expect, it, vi } from "vitest";

/**
 * `OVE-456` AC8: every page in the reader's own family is `no-store`, and none
 * of them is indexable.
 *
 * Both halves are asserted here because they are decided in two different
 * places and had drifted apart: the robots directive is the page's own
 * metadata, and the cache header is the proxy's — where `/notifications`,
 * `/bookmarks`, `/wishlist` and `/feed` were simply absent from the list, so a
 * page whose body is one person's data was leaving its cache header to
 * whatever Next chose.
 */
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: vi.fn(async () => "uk" as const),
}));

const LOCALE_SURFACES = [
  ["/notifications", () => import("./[locale]/notifications/page")],
  ["/bookmarks", () => import("./[locale]/bookmarks/page")],
  ["/wishlist", () => import("./[locale]/wishlist/page")],
  ["/feed", () => import("./[locale]/feed/page")],
] as const;

describe("the reader's own pages", () => {
  it.each(LOCALE_SURFACES)("keeps %s out of the index", async (_path, load) => {
    const { generateMetadata } = await load();
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "uk" }),
    });
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("keeps the erasure request out of the index", async () => {
    const { generateMetadata } = await import("./(default)/erasure/page");
    await expect(generateMetadata()).resolves.toMatchObject({
      robots: { index: false, follow: false },
    });
  });

  it("keeps the owner's erasure queue out of the index", async () => {
    const { generateMetadata } = await import(
      "./(default)/garden/privacy/erasure-requests/page"
    );
    await expect(generateMetadata()).resolves.toMatchObject({
      robots: { index: false, follow: false },
    });
  });

  it("keeps the account family out of the index", async () => {
    const { metadata } = await import("./(default)/account/layout");
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("answers no-store for every address in the family", async () => {
    const { isNoStoreAppRoute } = await import("@/proxy");
    for (const path of [
      "/notifications",
      "/bookmarks",
      "/wishlist",
      "/feed",
      "/erasure",
      "/account/communities",
      "/account/communities/observation-and-care",
      "/garden/privacy/erasure-requests",
      "/bg/notifications",
      "/ru/wishlist",
    ]) {
      expect(isNoStoreAppRoute(path), path).toBe(true);
    }
  });
});
