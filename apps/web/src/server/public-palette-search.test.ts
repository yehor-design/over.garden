import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchCatalogSuggestionsForTypeaheadResult: vi.fn(),
  listPublicCommunities: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/catalog-repository", () => ({
  searchCatalogSuggestionsForTypeaheadResult:
    mocks.searchCatalogSuggestionsForTypeaheadResult,
}));
vi.mock("@/server/community-repository", () => ({
  listPublicCommunities: mocks.listPublicCommunities,
}));

import {
  normalizePaletteQuery,
  PALETTE_GROUP_LIMIT,
  searchPublicPalette,
} from "./public-palette-search";

/** A Kysely-shaped stub: every builder method returns itself. */
function executorReturning(rowsByTable: Record<string, unknown[]>) {
  const executed: string[] = [];
  const executor = {
    selectFrom(table: string) {
      const chain: Record<string, unknown> = {};
      for (const method of [
        "select",
        "where",
        "orderBy",
        "limit",
        "innerJoin",
        "leftJoin",
      ]) {
        chain[method] = () => chain;
      }
      chain.execute = async () => {
        executed.push(table);
        return rowsByTable[table] ?? [];
      };
      return chain;
    },
  };
  return { executor: executor as never, executed };
}

describe("the palette's read", () => {
  it("asks nothing of the database for a query too short to mean anything", async () => {
    const { executor, executed } = executorReturning({});
    mocks.listPublicCommunities.mockResolvedValue([]);
    await expect(
      searchPublicPalette("т", { locale: "uk", executor }),
    ).resolves.toEqual({ query: "т", groups: [] });
    expect(executed).toEqual([]);
    expect(
      mocks.searchCatalogSuggestionsForTypeaheadResult,
    ).not.toHaveBeenCalled();
  });

  it("returns the groups that answered, in the order DESIGN.md §5.2 names", async () => {
    const { executor } = executorReturning({
      journal_entries: [
        {
          id: "e1",
          title: "Полив без календарної пастки",
          publicSlug: "полив",
          entryNumber: 12,
          sourceLanguage: "uk",
          addressHandle: "yehor",
        },
      ],
      user_public_profiles: [
        { userId: "u1", handle: "yehor", displayName: "Єгор" },
      ],
    });
    mocks.searchCatalogSuggestionsForTypeaheadResult.mockResolvedValue({
      suggestions: [
        {
          id: "c1",
          displayName: "Помідор",
          matchedName: "томат",
          kind: "species",
          parentDisplayName: null,
          publicPath: "/species/solanum-lycopersicum",
        },
      ],
      state: "ready",
      databaseMs: 1,
    });
    mocks.listPublicCommunities.mockResolvedValue([
      {
        id: "k1",
        slug: "tomatoes",
        contentKey: "tomatoes",
        navigationReady: true,
      },
    ]);

    const result = await searchPublicPalette("томат", {
      locale: "uk",
      executor,
    });

    expect(result.groups.map((group) => group.key)).toEqual([
      "journals",
      "organisms",
      "gardeners",
    ]);
    expect(result.groups[0]?.results[0]).toMatchObject({
      key: "journals",
      label: "Полив без календарної пастки",
      detail: "@yehor",
      href: "/@yehor/post/12",
      language: null,
    });
    expect(result.groups[2]?.results[0]).toMatchObject({
      key: "gardeners",
      label: "Єгор",
      detail: "@yehor",
      href: "/@yehor",
    });
  });

  it("marks a result whose words are not the reader's language", async () => {
    const { executor } = executorReturning({
      journal_entries: [
        {
          id: "e1",
          title: "Домати след смяна на режима",
          publicSlug: "domati",
          entryNumber: 3,
          sourceLanguage: "bg",
          addressHandle: "ivan",
        },
      ],
    });
    mocks.searchCatalogSuggestionsForTypeaheadResult.mockResolvedValue({
      suggestions: [],
      state: "empty",
      databaseMs: 0,
    });
    mocks.listPublicCommunities.mockResolvedValue([]);

    const uk = await searchPublicPalette("домат", { locale: "uk", executor });
    expect(uk.groups[0]?.results[0]?.language).toBe("bg");

    const bg = await searchPublicPalette("домат", { locale: "bg", executor });
    expect(bg.groups[0]?.results[0]?.language).toBeNull();
  });

  it("drops an entry whose author holds no handle", async () => {
    // Without a handle an entry has no public address at all (ADR-0029 D9), so
    // it is not a row a palette can offer — a link to nothing is worse than an
    // absence.
    const { executor } = executorReturning({
      journal_entries: [
        {
          id: "e1",
          title: "Запис без адреси",
          publicSlug: "no-address",
          entryNumber: 4,
          sourceLanguage: "uk",
          addressHandle: null,
        },
        {
          id: "e2",
          title: "Запис без слага",
          publicSlug: null,
          sourceLanguage: "uk",
          addressHandle: "yehor",
        },
      ],
    });
    mocks.searchCatalogSuggestionsForTypeaheadResult.mockResolvedValue({
      suggestions: [],
      state: "empty",
      databaseMs: 0,
    });
    mocks.listPublicCommunities.mockResolvedValue([]);

    const result = await searchPublicPalette("запис", {
      locale: "uk",
      executor,
    });
    expect(result.groups).toEqual([]);
  });

  it("keeps a failing group from taking the others with it", async () => {
    const { executor } = executorReturning({
      journal_entries: [
        {
          id: "e1",
          title: "Полив",
          publicSlug: "полив",
          entryNumber: 5,
          sourceLanguage: "uk",
          addressHandle: "yehor",
        },
      ],
    });
    mocks.searchCatalogSuggestionsForTypeaheadResult.mockRejectedValue(
      new Error("catalog deadline"),
    );
    mocks.listPublicCommunities.mockRejectedValue(new Error("no communities"));

    const result = await searchPublicPalette("полив", {
      locale: "uk",
      executor,
    });
    expect(result.groups.map((group) => group.key)).toEqual(["journals"]);
  });

  it("interleaves plants and animals rather than showing one kind only", async () => {
    // The picker's statement is kind-scoped (ADR-0026 D7), so the palette runs
    // it once per kind. A reader searching a word that means both should see
    // both, and five plants ahead of one bee is the same as hiding the bee.
    const { executor } = executorReturning({});
    mocks.searchCatalogSuggestionsForTypeaheadResult.mockImplementation(
      async (_query: string, options: { objectKind: string }) => ({
        suggestions: Array.from({ length: 5 }, (_value, index) => ({
          id: `${options.objectKind}-${index}`,
          displayName: `${options.objectKind} ${index}`,
          matchedName: null,
          kind: "species",
          parentDisplayName: null,
          publicPath: `/species/${options.objectKind}-${index}`,
        })),
        state: "ready",
        databaseMs: 1,
      }),
    );
    mocks.listPublicCommunities.mockResolvedValue([]);

    const result = await searchPublicPalette("щось", {
      locale: "uk",
      executor,
    });
    const organisms = result.groups.find((group) => group.key === "organisms");
    expect(organisms?.results).toHaveLength(PALETTE_GROUP_LIMIT);
    expect(
      organisms?.results.map((entry) => entry.label.split(" ")[0]),
    ).toEqual(["plant", "animal", "plant", "animal", "plant"]);
  });

  it("bounds and squeezes the query before anything reads it", async () => {
    expect(normalizePaletteQuery("  томат   черрі  ")).toBe("томат черрі");
    expect(normalizePaletteQuery("т".repeat(500))).toHaveLength(80);
    expect(normalizePaletteQuery(null)).toBe("");
    expect(normalizePaletteQuery(undefined)).toBe("");
  });
});
