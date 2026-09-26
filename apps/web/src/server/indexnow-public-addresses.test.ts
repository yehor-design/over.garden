import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const announce = vi.fn();
const getPublicAuthorHandle = vi.fn(
  async (): Promise<string | null> => "yehor",
);

vi.mock("@/server/indexnow-announcer", () => ({
  announcePublicUrlsToIndexNow: (urls: readonly string[]) => announce(urls),
  // The real one schedules with `after`, which throws outside a request; the
  // work then runs directly, and that is what this stands in for.
  afterResponse: (work: () => Promise<unknown>) => {
    void work().catch(() => undefined);
  },
}));
vi.mock("@/server/author-handle-repository", () => ({
  getPublicAuthorHandle: () => getPublicAuthorHandle(),
}));
vi.mock("@/db", () => ({ db: {} }));
const published = new Set<string>();
vi.mock("@/server/catalog-publication", () => ({
  isCatalogItemPublished: async (id: string) => published.has(id),
}));

const {
  announceCatalogCard,
  announceCommunity,
  announceJournalEntry,
  announceSpeciesPagesOfObject,
} = await import("@/server/indexnow-public-addresses");

/**
 * A Kysely-shaped stub: the object's catalogue links from `plant_objects`,
 * and one organism's address row by id from `catalog_items`.
 */
function cardExecutor(
  rows: Record<string, Record<string, unknown>> | Record<string, unknown> | undefined,
  links: readonly { itemId: string | null; speciesId: string | null }[] = [],
) {
  return {
    selectFrom: (table: string) => {
      let id: string | null = null;
      const chain = {
        leftJoin: () => chain,
        select: () => chain,
        where: (column: string, _op: string, value: unknown) => {
          if (column === "catalog_items.id") id = String(value);
          return chain;
        },
        execute: async () => (table === "plant_objects" ? links : []),
        executeTakeFirst: async () => {
          if (!rows) return undefined;
          return "publicSlug" in rows ? rows : (rows[id ?? ""] as never);
        },
      };
      return chain;
    },
  } as never;
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
      announceJournalEntry({ ownerUserId: "user-1", entryNumber: 12 });
      await settled();

      expect(announce).toHaveBeenCalledWith([
        "/@yehor/post/12",
      ]);
    });

    it("says nothing for an entry that is not public", async () => {
      announceJournalEntry({ ownerUserId: "user-1", entryNumber: null });
      await settled();

      expect(announce).not.toHaveBeenCalled();
    });

    // An entry whose author has no current handle has no canonical address, and
    // the legacy one is a 308 — announcing a redirect asks a crawler to fetch a
    // page that is not there.
    it("says nothing when the author has no handle to hang the address from", async () => {
      getPublicAuthorHandle.mockResolvedValue(null);

      announceJournalEntry({ ownerUserId: "user-1", entryNumber: 12 });
      await settled();

      expect(announce).not.toHaveBeenCalled();
    });
  });

  describe("a species page (OVE-519)", () => {
    beforeEach(() => published.clear());

    /**
     * The acceptance criterion with teeth: an unpublished page is `noindex`,
     * and announcing one asks two search engines to fetch a page that tells
     * them not to index it.
     */
    it("says nothing for a page that is not published", async () => {
      announceCatalogCard(
        "card-1",
        cardExecutor({
          publicSlug: "bactrocera-dorsalis",
          catalogKind: "species",
          speciesSlug: null,
        }),
      );
      await settled();

      expect(announce).not.toHaveBeenCalled();
    });

    it("announces a published species page", async () => {
      published.add("card-1");
      announceCatalogCard(
        "card-1",
        cardExecutor({
          publicSlug: "solanum-lycopersicum",
          catalogKind: "species",
          speciesSlug: null,
        }),
      );
      await settled();

      expect(announce).toHaveBeenCalledWith(["/species/solanum-lycopersicum"]);
    });

    it("announces a published cultivar page under its species", async () => {
      published.add("card-1");
      announceCatalogCard(
        "card-1",
        cardExecutor({
          publicSlug: "advance",
          catalogKind: "plant_variety",
          speciesSlug: "solanum-lycopersicum",
        }),
      );
      await settled();

      expect(announce).toHaveBeenCalledWith([
        "/species/solanum-lycopersicum/advance",
      ]);
    });

    it("says nothing for a page with no address, and never throws", async () => {
      published.add("card-1");
      announceCatalogCard("card-1", cardExecutor(undefined));
      await settled();

      expect(announce).not.toHaveBeenCalled();
    });

    it("announces both pages a cultivar's entry publishes: the cultivar's and its species'", async () => {
      published.add("cherokee").add("tomato");
      announceSpeciesPagesOfObject(
        "object-1",
        cardExecutor(
          {
            cherokee: {
              publicSlug: "cherokee",
              catalogKind: "plant_variety",
              speciesSlug: "solanum-lycopersicum",
            },
            tomato: {
              publicSlug: "solanum-lycopersicum",
              catalogKind: "species",
              speciesSlug: null,
            },
          },
          [{ itemId: "cherokee", speciesId: "tomato" }],
        ),
      );
      await settled();

      expect(announce).toHaveBeenCalledWith([
        "/species/solanum-lycopersicum/cherokee",
        "/species/solanum-lycopersicum",
      ]);
    });

    it("says nothing for an object with no species, or pages that are not published", async () => {
      announceSpeciesPagesOfObject(null);
      announceSpeciesPagesOfObject(
        "object-1",
        cardExecutor(
          {
            tomato: {
              publicSlug: "solanum-lycopersicum",
              catalogKind: "species",
              speciesSlug: null,
            },
          },
          [{ itemId: "tomato", speciesId: null }],
        ),
      );
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
