import { describe, expect, it, vi, beforeEach } from "vitest";

const entryRoute = vi.fn(async () => "entry");
const entryMetadata = vi.fn(async () => ({
  title: "Полив без календарної пастки | OverGarden",
}));
const getPublicJournalEntryLifecycleLookup = vi.fn(async (slug: string) =>
  slug === "полив-без-календарної-пастки"
    ? { status: "active" as const, publicSlug: slug, addressHandle: "yehor" }
    : { status: "not_found" as const },
);

vi.mock("@/app/[locale]/journal/[slug]/page", () => ({
  default: (...args: unknown[]) => entryRoute(...(args as [])),
  generateMetadata: (...args: unknown[]) => entryMetadata(...(args as [])),
}));
vi.mock("@/server/journal-repository", () => ({
  getPublicJournalEntryLifecycleLookup: (slug: string) =>
    getPublicJournalEntryLifecycleLookup(slug),
}));

const { default: AuthorScopedEntryRoute, generateMetadata } = await import(
  "./page"
);

const SLUG = "полив-без-календарної-пастки";

/**
 * The two spellings a router can hand a route.
 *
 * A URL carries a Cyrillic slug percent-encoded and `@` as either itself or
 * `%40`, and an address builder encodes whatever it is handed — so a route that
 * assumes one spelling refuses its own address in the other. This route had no
 * test at all, and the passport route beside it shipped exactly that defect.
 */
describe("a journal entry at its author's address", () => {
  beforeEach(() => {
    entryRoute.mockClear();
    entryMetadata.mockClear();
    getPublicJournalEntryLifecycleLookup.mockClear();
  });

  for (const [name, params] of [
    [
      "percent-encoded, as a URL carries them",
      {
        locale: "uk",
        profileHandle: "%40yehor",
        entrySlug: encodeURIComponent(SLUG),
      },
    ],
    ["decoded", { locale: "uk", profileHandle: "@yehor", entrySlug: SLUG }],
  ] as const) {
    it(`renders the entry when the segments arrive ${name}`, async () => {
      await AuthorScopedEntryRoute({ params: Promise.resolve(params) });

      expect(getPublicJournalEntryLifecycleLookup).toHaveBeenCalledWith(SLUG);
      expect(entryRoute).toHaveBeenCalledTimes(1);
    });

    it(`names the entry in its metadata when the segments arrive ${name}`, async () => {
      const metadata = await generateMetadata({
        params: Promise.resolve(params),
      });

      expect(metadata).toEqual({
        title: "Полив без календарної пастки | OverGarden",
      });
    });
  }

  it("refuses the entry under another gardener's handle", async () => {
    await expect(
      AuthorScopedEntryRoute({
        params: Promise.resolve({
          locale: "uk",
          profileHandle: "@someone-else",
          entrySlug: SLUG,
        }),
      }),
    ).rejects.toThrowError(/NEXT_HTTP_ERROR_FALLBACK;404/u);
    expect(entryRoute).not.toHaveBeenCalled();
  });

  it("refuses a slug no entry holds", async () => {
    await expect(
      AuthorScopedEntryRoute({
        params: Promise.resolve({
          locale: "uk",
          profileHandle: "@yehor",
          entrySlug: "no-such-entry",
        }),
      }),
    ).rejects.toThrowError(/NEXT_HTTP_ERROR_FALLBACK;404/u);
    expect(entryRoute).not.toHaveBeenCalled();
  });
});
