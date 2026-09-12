import { describe, expect, it, vi, beforeEach } from "vitest";

const passportRoute = vi.fn(async () => "passport");
const passportMetadata = vi.fn(async () => ({ title: "Томат | OverGarden" }));
const getPublicObjectPassportIdBySlug = vi.fn(
  async (handle: string, slug: string) =>
    handle === "yehor" && slug === "томат" ? "object-1" : null,
);

vi.mock("@/app/[locale]/lineage/objects/[objectId]/page", () => ({
  default: (...args: unknown[]) => passportRoute(...(args as [])),
  generateMetadata: (...args: unknown[]) => passportMetadata(...(args as [])),
}));
vi.mock("@/server/public-object-passport-repository", () => ({
  getPublicObjectPassportIdBySlug: (...args: [string, string]) =>
    getPublicObjectPassportIdBySlug(...args),
}));

const { default: AuthorScopedPassportRoute, generateMetadata } = await import(
  "./page"
);

/**
 * The two spellings a router can hand a route, and the one that shipped broken.
 *
 * A URL carries a Cyrillic slug percent-encoded. `publicObjectPassportPath`
 * encodes what it is given, so passing the raw segment through encoded it a
 * second time and the address matched nothing: every object passport at its own
 * address answered `200` and rendered the not-found page, from the day the
 * addresses moved under their authors until 2026-09-12. No test covered this
 * route at all — that is why a whole surface could be dead for a day.
 */
describe("the object passport at its author's address", () => {
  beforeEach(() => {
    passportRoute.mockClear();
    passportMetadata.mockClear();
    getPublicObjectPassportIdBySlug.mockClear();
  });

  for (const [name, params] of [
    [
      "percent-encoded, as a URL carries them",
      {
        locale: "uk",
        profileHandle: "%40yehor",
        objectSlug: encodeURIComponent("томат"),
      },
    ],
    [
      "decoded",
      { locale: "uk", profileHandle: "@yehor", objectSlug: "томат" },
    ],
  ] as const) {
    it(`renders the passport when the segments arrive ${name}`, async () => {
      await AuthorScopedPassportRoute({ params: Promise.resolve(params) });

      expect(getPublicObjectPassportIdBySlug).toHaveBeenCalledWith(
        "yehor",
        "томат",
      );
      expect(passportRoute).toHaveBeenCalledTimes(1);
    });

    it(`names the passport in its metadata when the segments arrive ${name}`, async () => {
      const metadata = await generateMetadata({ params: Promise.resolve(params) });

      expect(metadata).toEqual({ title: "Томат | OverGarden" });
    });
  }

  it("refuses an address whose slug belongs to nobody", async () => {
    await expect(
      AuthorScopedPassportRoute({
        params: Promise.resolve({
          locale: "uk",
          profileHandle: "@yehor",
          objectSlug: "no-such-object",
        }),
      }),
    ).rejects.toThrowError(/NEXT_HTTP_ERROR_FALLBACK;404/u);
    expect(passportRoute).not.toHaveBeenCalled();
  });
});
