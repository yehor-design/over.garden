import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const announce = vi.fn();
const getPublicAuthorHandle = vi.fn(
  async (): Promise<string | null> => "yehor",
);

vi.mock("@/server/indexnow-announcer", () => ({
  announcePublicUrlsToIndexNow: (urls: readonly string[]) => announce(urls),
}));
vi.mock("@/server/author-handle-repository", () => ({
  getPublicAuthorHandle: () => getPublicAuthorHandle(),
}));
vi.mock("@/db", () => ({ db: {} }));

const {
  announceCatalogCard,
  announceCommunity,
  announceJournalEntry,
} = await import("@/server/indexnow-public-addresses");

/** A Kysely-shaped stub that answers one row, or none. */
function cardExecutor(row: Record<string, unknown> | undefined) {
  const chain = {
    select: () => chain,
    where: () => chain,
    executeTakeFirst: async () => row,
  };
  return { selectFrom: () => chain } as never;
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("which address a mutation announces", () => {
  beforeEach(() => {
    announce.mockClear();
    getPublicAuthorHandle.mockClear();
    getPublicAuthorHandle.mockResolvedValue("yehor");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("a journal entry", () => {
    it("announces the one address it has, under its author", async () => {
      announceJournalEntry({ ownerUserId: "user-1", publicSlug: "полив" });
      await settled();

      expect(announce).toHaveBeenCalledWith([
        "/@yehor/%D0%BF%D0%BE%D0%BB%D0%B8%D0%B2",
      ]);
    });

    it("says nothing for an entry that is not public", async () => {
      announceJournalEntry({ ownerUserId: "user-1", publicSlug: null });
      await settled();

      expect(announce).not.toHaveBeenCalled();
    });

    // An entry whose author has no current handle has no canonical address, and
    // the legacy one is a 308 — announcing a redirect asks a crawler to fetch a
    // page that is not there.
    it("says nothing when the author has no handle to hang the address from", async () => {
      getPublicAuthorHandle.mockResolvedValue(null);

      announceJournalEntry({ ownerUserId: "user-1", publicSlug: "полив" });
      await settled();

      expect(announce).not.toHaveBeenCalled();
    });
  });

  describe("an organism card", () => {
    /**
     * The acceptance criterion with teeth: ADR-0026 D9 keeps a card built only
     * from sources `noindex`, and announcing one asks two search engines to
     * fetch a page that tells them not to index it.
     */
    it("says nothing for a card that is still noindex", async () => {
      announceCatalogCard(
        "card-1",
        cardExecutor({
          publicSlug: "bactrocera-dorsalis",
          firstHandContentAt: null,
          indexableOverride: null,
          catalogKind: "species",
          speciesSlug: null,
        }),
      );
      await settled();

      expect(announce).not.toHaveBeenCalled();
    });

    it("announces a card a gardener has written about", async () => {
      announceCatalogCard(
        "card-1",
        cardExecutor({
          publicSlug: "solanum-lycopersicum",
          firstHandContentAt: new Date("2026-07-01"),
          indexableOverride: null,
          catalogKind: "species",
          speciesSlug: null,
        }),
      );
      await settled();

      expect(announce).toHaveBeenCalledWith(["/species/solanum-lycopersicum"]);
    });

    it("announces a card the owner marked indexable", async () => {
      announceCatalogCard(
        "card-1",
        cardExecutor({
          publicSlug: "advance",
          firstHandContentAt: null,
          indexableOverride: true,
          catalogKind: "plant_variety",
          speciesSlug: "solanum-lycopersicum",
        }),
      );
      await settled();

      expect(announce).toHaveBeenCalledWith([
        "/species/solanum-lycopersicum/advance",
      ]);
    });

    it("says nothing for a card with no address, and never throws", async () => {
      announceCatalogCard("card-1", cardExecutor(undefined));
      await settled();

      expect(announce).not.toHaveBeenCalled();
    });
  });

  describe("a community", () => {
    it("announces the community's own address", () => {
      announceCommunity("observation-and-care");

      expect(announce).toHaveBeenCalledWith([
        "/communities/observation-and-care",
      ]);
    });

    it("says nothing without a slug", () => {
      announceCommunity("");

      expect(announce).not.toHaveBeenCalled();
    });
  });
});
