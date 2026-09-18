import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The three routes an entry's older addresses still reach, and the one helper
 * behind them (ADR-0029 D9, amendment of 2026-09-18).
 *
 * A document request never gets here — the proxy answers it with one 308. What
 * does is a client-side transition from a page rendered while the name was
 * still the address, and the route has to send the router on to the number
 * rather than hand it a not-found page for an entry that exists.
 */
const mocks = vi.hoisted(() => ({
  resolveJournalEntryAddress: vi.fn(),
  connection: vi.fn().mockResolvedValue(undefined),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  logAddressRefusal: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  permanentRedirect: mocks.permanentRedirect,
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));

vi.mock("@/server/journal-slug-repository", () => ({
  resolveJournalEntryAddress: mocks.resolveJournalEntryAddress,
}));

vi.mock("@/server/address-refusal-log", () => ({
  logAddressRefusal: mocks.logAddressRefusal,
}));

const SLUG = "полив-без-календарної-пастки";

/**
 * A route receives its segments as the URL carried them. Both spellings must
 * name the same entry, or every Cyrillic name — which is all of them — would
 * resolve to nothing and a working old link would become a 404.
 */
const SPELLINGS = [
  ["decoded", { profileHandle: "@yehor", entrySlug: SLUG }],
  [
    "percent-encoded",
    { profileHandle: "%40yehor", entrySlug: encodeURIComponent(SLUG) },
  ],
] as const;

describe("an entry's older addresses send the router to its number", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveJournalEntryAddress.mockResolvedValue({
      handle: "yehor",
      entryNumber: 12,
    });
  });

  it.each(SPELLINGS)(
    "redirects /@{handle}/{slug} when the segments arrive %s",
    async (_name, segments) => {
      const { default: Route } = await import(
        "@/app/[locale]/[profileHandle]/[entrySlug]/page"
      );

      await expect(
        Route({ params: Promise.resolve({ locale: "uk", ...segments }) }),
      ).rejects.toThrow("NEXT_REDIRECT:/@yehor/post/12");
      // The handle is part of the key, not a check made afterwards: the name
      // is per author since `0073`.
      expect(mocks.resolveJournalEntryAddress).toHaveBeenCalledWith(
        SLUG,
        undefined,
        "yehor",
      );
    },
  );

  it("redirects the flat /journal/{slug} without a handle, prefixed or not", async () => {
    const { default: Localized } = await import(
      "@/app/[locale]/journal/[slug]/page"
    );
    const { default: Root } = await import("@/app/(default)/journal/[slug]/page");

    await expect(
      Localized({
        params: Promise.resolve({
          locale: "bg",
          slug: encodeURIComponent(SLUG),
        }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/@yehor/post/12");
    await expect(
      Root({ params: Promise.resolve({ slug: SLUG }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/@yehor/post/12");

    for (const call of mocks.resolveJournalEntryAddress.mock.calls) {
      expect(call).toEqual([SLUG, undefined, null]);
    }
  });

  it("says a build may not reach the database before it reads it", async () => {
    const { default: Route } = await import(
      "@/app/[locale]/[profileHandle]/[entrySlug]/page"
    );
    await expect(
      Route({
        params: Promise.resolve({
          locale: "uk",
          profileHandle: "@yehor",
          entrySlug: SLUG,
        }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.resolveJournalEntryAddress.mock.invocationCallOrder[0]!,
    );
  });

  it("answers not found for a name no entry ever held", async () => {
    mocks.resolveJournalEntryAddress.mockResolvedValue(null);
    const { default: Route } = await import(
      "@/app/[locale]/[profileHandle]/[entrySlug]/page"
    );

    await expect(
      Route({
        params: Promise.resolve({
          locale: "uk",
          profileHandle: "@yehor",
          entrySlug: "такого-запису-немає",
        }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.permanentRedirect).not.toHaveBeenCalled();
  });

  it("refuses a segment that could never have been a name, without a lookup", async () => {
    const { default: Route } = await import(
      "@/app/[locale]/[profileHandle]/[entrySlug]/page"
    );

    for (const entrySlug of ["Не слаг", "a--b", "%E0%A4%A", ""]) {
      await expect(
        Route({
          params: Promise.resolve({
            locale: "uk",
            profileHandle: "@yehor",
            entrySlug,
          }),
        }),
      ).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(mocks.resolveJournalEntryAddress).not.toHaveBeenCalled();
  });
});
