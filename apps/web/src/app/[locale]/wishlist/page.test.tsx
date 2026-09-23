import { postgresRejection } from "@test/postgres-rejection";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getInterfaceCopy } from "@/lib/interface-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";
import type { WishlistShelfItem } from "@/server/wishlist-repository";
import { describeWorkspaceFailure } from "@/server/workspace-failure";

const mocks = vi.hoisted(() => ({
  resolveWorkspaceViewer: vi.fn(),
  listWishlistShelfItems: vi.fn(),
  findWishlistCatalogName: vi.fn(),
  removeWishlistItemAction: vi.fn(),
  restoreWishlistItemAction: vi.fn(),
  addCatalogPublicSlugToWishlistAction: vi.fn(),
}));

vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceViewer: mocks.resolveWorkspaceViewer,
}));

vi.mock("@/server/wishlist-repository", () => ({
  listWishlistShelfItems: mocks.listWishlistShelfItems,
  findWishlistCatalogName: mocks.findWishlistCatalogName,
}));

vi.mock("@/app/(default)/auth/sign-in-prompt", () => ({
  SignInPrompt: (props: {
    next?: string;
    locale?: string;
    description?: string;
  }) => (
    <section
      data-sign-in-prompt="true"
      data-next={props.next ?? ""}
      data-locale={props.locale ?? ""}
    >
      Sign in prompt
      {props.description ?? ""}
    </section>
  ),
}));

vi.mock("@/app/(default)/wishlist/actions", () => ({
  removeWishlistItemAction: mocks.removeWishlistItemAction,
  restoreWishlistItemAction: mocks.restoreWishlistItemAction,
  addCatalogPublicSlugToWishlistAction:
    mocks.addCatalogPublicSlugToWishlistAction,
}));

const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};
const TOMATO_ID = "c0ffee00-0000-4000-8000-000000000101";
const BASIL_ID = "c0ffee00-0000-4000-8000-000000000102";
const HEN_ID = "c0ffee00-0000-4000-8000-000000000103";
const RETIRED_ID = "c0ffee00-0000-4000-8000-000000000104";
const uk = getSocialSurfaceCopy("uk");

const TOMATO: WishlistShelfItem = {
  key: "wishlist:1111111111111111",
  catalogItemId: TOMATO_ID,
  available: true,
  catalog: {
    canonicalName: "Pomidor Cheri",
    publicSlug: "pomidor-cheri-0000000101",
    catalogKind: "plant_variety",
    locale: "uk",
    source: "seed",
  },
  sourceSurface: "public_variety",
  addedAt: "2026-07-04T08:00:00.000Z",
  updatedAt: "2026-07-04T09:00:00.000Z",
  publicPath: "/variety/pomidor-cheri-0000000101",
  activationPath:
    "/garden?catalog=pomidor-cheri-0000000101&source=public-variety",
};
const BASIL: WishlistShelfItem = {
  ...TOMATO,
  key: "wishlist:2222222222222222",
  catalogItemId: BASIL_ID,
  catalog: {
    ...TOMATO.catalog,
    canonicalName: "Ocimum basilicum",
    publicSlug: "ocimum-basilicum",
    catalogKind: "species",
  },
  publicPath: "/species/ocimum-basilicum",
  activationPath: "/garden?catalog=ocimum-basilicum&source=public-variety",
};
const HEN: WishlistShelfItem = {
  ...TOMATO,
  key: "wishlist:3333333333333333",
  catalogItemId: HEN_ID,
  catalog: {
    ...TOMATO.catalog,
    canonicalName: "Orpington",
    publicSlug: "orpington",
    catalogKind: "breed",
  },
  publicPath: "/breeds/orpington",
  activationPath: "/garden?catalog=orpington&source=public-variety",
};
/** An item the catalogue has since retired: still on the list, unoffered. */
const RETIRED: WishlistShelfItem = {
  ...TOMATO,
  key: "wishlist:4444444444444444",
  catalogItemId: RETIRED_ID,
  available: false,
  catalog: {
    ...TOMATO.catalog,
    canonicalName: "Old Heirloom",
    publicSlug: null,
  },
  publicPath: null,
  activationPath: null,
};

async function renderList(
  query: Record<string, string> = {},
  locale: string = "uk",
) {
  const { default: LocalizedWishlistRoute } = await import("./page");
  return renderToStaticMarkup(
    await LocalizedWishlistRoute({
      params: Promise.resolve({ locale }),
      searchParams: Promise.resolve(query),
    }),
  );
}

/** One row of the list, from its `<li>` to its end. */
function row(html: string, catalogItemId: string) {
  const at = html.indexOf(`id="saved-${catalogItemId}"`);
  if (at === -1) return "";
  return html.slice(
    html.lastIndexOf("<li", at),
    html.indexOf("</li>", at) + "</li>".length,
  );
}

/** Everything from the toast on: the notice renders after the list. */
function notice(html: string) {
  const at = html.indexOf('data-shelf-notice="true"');
  return at === -1 ? "" : html.slice(at);
}

function count(html: string, fragment: string) {
  return html.split(fragment).length - 1;
}

describe("/{locale}/wishlist", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "signed-in",
      userId: SCOPE.userId,
      scope: SCOPE,
    });
    mocks.listWishlistShelfItems.mockResolvedValue([TOMATO]);
    mocks.findWishlistCatalogName.mockResolvedValue(null);
  });

  it("keeps wishlist metadata private and localized", async () => {
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "uk" }),
      }),
    ).resolves.toMatchObject({
      title: "Список бажань | OverGarden",
      description: uk.wishlist.description,
      alternates: {
        canonical: "/wishlist",
      },
      robots: {
        index: false,
        follow: false,
      },
    });
  });

  it.each([
    ["uk", "Список бажань"],
    ["bg", "Списък с желания"],
    ["ru", "Список желаний"],
  ] as const)(
    "calls it by one name in %s: the menu, the tab, the title and the page",
    async (locale, name) => {
      const copy = getSocialSurfaceCopy(locale);
      const { generateMetadata } = await import("./page");

      expect(getInterfaceCopy(locale).navigation.wishlist).toBe(name);
      expect(copy.tabs.wishlist).toBe(name);
      expect(copy.wishlist.title).toBe(name);
      await expect(
        generateMetadata({ params: Promise.resolve({ locale }) }),
      ).resolves.toMatchObject({ title: `${name} | OverGarden` });
      expect(await renderList({}, locale)).toContain(
        `<h1 id="page-title" class="text-h1 break-words text-text-heading">${name}</h1>`,
      );
    },
  );

  it.each([
    [
      "uk",
      { kind: "species", page: "2", outcome: "removed", target: TOMATO_ID },
      "/wishlist?kind=species&amp;page=2",
    ],
    ["ru", { kind: "breed" }, "/ru/wishlist?kind=breed"],
    // A filter or a page the list does not have is not carried.
    ["bg", { kind: "journal_entry", page: "0" }, "/bg/wishlist"],
  ] as const)(
    "asks a guest to sign in and brings them back to the same view in %s",
    async (locale, query, next) => {
      mocks.resolveWorkspaceViewer.mockResolvedValue({
        status: "sign-in-required",
      });

      const html = await renderList(query, locale);

      expect(html).toContain(`data-next="${next}"`);
      expect(html).toContain(getSocialSurfaceCopy(locale).wishlist.signIn);
      expect(html).not.toContain("data-saved-shelf");
      expect(mocks.listWishlistShelfItems).not.toHaveBeenCalled();
    },
  );

  it("says the session could not be read, with a retry of the same view, instead of asking to sign in", async () => {
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "unavailable",
      failure: describeWorkspaceFailure(postgresRejection("08006")),
    });

    const html = await renderList({ kind: "breed" });

    expect(html).toContain('data-section-failure="connection_unavailable"');
    expect(html).toContain(
      'href="/wishlist?kind=breed" data-workspace-retry="section"',
    );
    expect(html).not.toContain("data-sign-in-prompt");
    expect(html).not.toContain("data-saved-shelf");
    expect(html).not.toContain(uk.wishlist.emptyTitle);
    expect(mocks.listWishlistShelfItems).not.toHaveBeenCalled();
  });

  it.each([
    ["the list", mocks.listWishlistShelfItems],
    ["the removed item's name", mocks.findWishlistCatalogName],
  ])(
    "renders a failed read of %s as a failure with a retry of the same view, never as an empty list",
    async (_read, read) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      read.mockRejectedValue(postgresRejection("57014"));

      const html = await renderList({
        kind: "plant_variety",
        page: "2",
        outcome: "removed",
        action: "remove",
        target: TOMATO_ID,
      });

      expect(html).toContain('data-section-failure="query_timeout"');
      expect(html).toContain(
        'href="/wishlist?kind=plant_variety&amp;page=2" data-workspace-retry="section"',
      );
      expect(html).not.toContain("data-saved-shelf");
      expect(html).not.toContain("data-shelf-notice");
      expect(html).not.toContain(uk.wishlist.emptyTitle);
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
        event: "workspace_section_degraded",
        surface: "wishlist",
        section: "shelf",
        failureClass: "query_timeout",
      });
      log.mockRestore();
    },
  );

  it("renders owner-scoped shelf items with public paths and activation prefill", async () => {
    const html = await renderList();

    expect(mocks.listWishlistShelfItems).toHaveBeenCalledWith(SCOPE);
    expect(html).toContain("Список бажань");
    expect(html).toContain("Pomidor Cheri");
    expect(html).toContain("/variety/pomidor-cheri-0000000101");
    expect(html).toContain(
      "/garden?catalog=pomidor-cheri-0000000101&amp;source=public-variety",
    );
    expect(html).toContain("Почати вести журнал");
    // `OVE-456` AC4: the same row and the same removal affordance as the
    // bookmark shelf, and the affordance names what it removes.
    expect(html).toContain('data-shelf-row="true"');
    expect(html).toContain('data-shelf-remove="true"');
    expect(html).toContain(
      'aria-label="Прибрати зі списку бажань: Pomidor Cheri"',
    );
    // The removal names the catalogue item, which is all it needs.
    expect(html).toContain(`name="catalogItemId" value="${TOMATO_ID}"`);
    expect(html).not.toMatch(
      /00000000-0000|session-1|private journal|journal body|plant_objects|quarantine|derivative|media key|ip_address|user_agent|email|phone|coordinates|invite|token/i,
    );
  });

  it("says what kind of organism each row is", async () => {
    mocks.listWishlistShelfItems.mockResolvedValue([TOMATO, BASIL, HEN]);

    const html = await renderList();

    for (const [item, kind, label] of [
      [TOMATO, "plant_variety", uk.wishlist.kinds.plant_variety],
      [BASIL, "species", uk.wishlist.kinds.species],
      [HEN, "breed", uk.wishlist.kinds.breed],
    ] as const) {
      const shown = row(html, item.catalogItemId);
      expect(shown).toContain(`data-saved-item="${kind}"`);
      expect(shown).toContain(`>${label}</span>`);
    }
    expect(getSocialSurfaceCopy("bg").wishlist.kinds).toEqual({
      plant_variety: "Растителен сорт",
      species: "Вид",
      breed: "Порода",
    });
  });

  it("keeps an item the catalogue no longer offers, says so, and can still take it off", async () => {
    mocks.listWishlistShelfItems.mockResolvedValue([TOMATO, RETIRED]);

    const html = await renderList();
    const retired = row(html, RETIRED_ID);

    expect(retired).toContain('data-saved-available="false"');
    expect(retired).toContain("Old Heirloom");
    expect(retired).toContain(uk.wishlist.unavailable);
    // Nothing to open or start a journal from, and still a way to remove it.
    expect(retired).not.toContain("<a ");
    expect(retired).toContain('data-shelf-remove="true"');
    expect(retired).toContain(`name="catalogItemId" value="${RETIRED_ID}"`);
    expect(row(html, TOMATO_ID)).toContain('data-saved-available="true"');
    expect(row(html, TOMATO_ID)).not.toContain(uk.wishlist.unavailable);
  });

  it("carries the view each row is on into its removal", async () => {
    mocks.listWishlistShelfItems.mockResolvedValue([TOMATO, BASIL, HEN]);

    const html = await renderList({ kind: "species" }, "bg");

    expect(count(html, 'data-shelf-row="true"')).toBe(1);
    expect(row(html, BASIL_ID)).toContain(
      'name="returnTo" value="/bg/wishlist?kind=species"',
    );
    expect(row(html, BASIL_ID)).toContain('name="locale" value="bg"');
  });

  it("names what a removal removed, with an Undo that needs no bundle", async () => {
    mocks.listWishlistShelfItems.mockResolvedValue([BASIL]);
    mocks.findWishlistCatalogName.mockResolvedValue({
      name: "Pomidor Cheri",
      available: true,
    });

    const html = await renderList({
      kind: "plant_variety",
      outcome: "removed",
      action: "remove",
      target: TOMATO_ID,
    });
    const toast = notice(html);

    expect(mocks.findWishlistCatalogName).toHaveBeenCalledWith(TOMATO_ID);
    expect(toast).toContain("«Pomidor Cheri» прибрано зі списку бажань");
    expect(toast).toContain(uk.common.undo);
    expect(toast).toContain(`name="catalogItemId" value="${TOMATO_ID}"`);
    expect(toast).toContain(
      'name="returnTo" value="/wishlist?kind=plant_variety"',
    );
  });

  it.each([
    [
      "the catalogue retired it",
      { name: "Old Heirloom", available: false },
      "«Old Heirloom» прибрано зі списку бажань",
    ],
    ["the catalogue has no such item", null, uk.wishlist.removedNoticeUnnamed],
  ])("offers no Undo when %s", async (_case, named, title) => {
    mocks.findWishlistCatalogName.mockResolvedValue(named);

    const html = await renderList({
      outcome: "removed",
      action: "remove",
      target: RETIRED_ID,
    });
    const toast = notice(html);

    expect(toast).toContain(title);
    expect(toast).not.toContain(uk.common.undo);
    expect(toast).not.toContain("<form");
  });

  it("names a restore, with nothing to undo", async () => {
    mocks.findWishlistCatalogName.mockResolvedValue({
      name: "Pomidor Cheri",
      available: true,
    });

    const html = await renderList({
      outcome: "restored",
      action: "restore",
      target: TOMATO_ID,
    });
    const toast = notice(html);

    expect(toast).toContain("«Pomidor Cheri» повернуто до списку бажань");
    expect(toast).not.toContain(uk.common.undo);
    expect(html).toContain(`id="saved-${TOMATO_ID}"`);
  });

  it.each([
    [{ outcome: "removed", action: "remove", target: "../../etc/passwd" }],
    [{ outcome: "removed", action: "undo", target: TOMATO_ID }],
    // The address the list used before `OVE-502` says nothing any more.
    [{ undoSlug: "pomidor-cheri-0000000101" }],
  ])("ignores an outcome it cannot re-check: %j", async (query) => {
    const html = await renderList(query);

    expect(html).not.toContain("data-shelf-notice");
    expect(html).not.toContain("data-shelf-outcome");
    expect(html).not.toContain("passwd");
    expect(mocks.findWishlistCatalogName).not.toHaveBeenCalled();
  });

  it("says a failed removal on its row, which is still there", async () => {
    mocks.listWishlistShelfItems.mockResolvedValue([TOMATO, RETIRED]);

    const html = await renderList({
      outcome: "failed",
      action: "remove",
      target: RETIRED_ID,
    });

    expect(row(html, RETIRED_ID)).toContain('data-shelf-outcome="failed"');
    expect(row(html, RETIRED_ID)).toContain(uk.wishlist.failed.remove);
    expect(count(html, 'data-shelf-outcome="failed"')).toBe(1);
    expect(html).not.toContain('id="shelf-outcome"');
    expect(html).not.toContain("data-shelf-notice");
  });

  it("says a failed removal above the list when its row is on another page of the view", async () => {
    const items = Array.from({ length: 13 }, (_, index) => ({
      ...TOMATO,
      key: `wishlist:${String(index).padStart(16, "0")}`,
      catalogItemId: `c0ffee00-0000-4000-8000-0000000002${String(index).padStart(2, "0")}`,
      catalog: { ...TOMATO.catalog, canonicalName: `Sort ${index}` },
    }));
    mocks.listWishlistShelfItems.mockResolvedValue(items);
    const lastId = items[12]!.catalogItemId;
    const outcome = { outcome: "failed", action: "remove", target: lastId };

    // The thirteenth row is on page two; the reader is on page one.
    const firstPage = await renderList(outcome);
    const callout = firstPage.slice(firstPage.indexOf('id="shelf-outcome"'));

    expect(firstPage).not.toContain(`id="saved-${lastId}"`);
    expect(firstPage).toContain('id="shelf-outcome"');
    expect(callout).toContain('data-shelf-outcome="failed"');
    expect(callout).toContain(uk.wishlist.failed.remove);
    expect(callout).not.toContain(uk.common.retry);
    expect(count(firstPage, 'data-shelf-outcome="failed"')).toBe(1);

    // On its own page, the same outcome is said beside the row.
    const secondPage = await renderList({ ...outcome, page: "2" });
    expect(row(secondPage, lastId)).toContain('data-shelf-outcome="failed"');
    expect(secondPage).not.toContain('id="shelf-outcome"');
  });

  it.each([
    ["still offers it", { name: "Pomidor Cheri", available: true }, true],
    ["has retired it", { name: "Pomidor Cheri", available: false }, false],
  ])(
    "says a failed Undo above the list, and offers it again only while the catalogue %s",
    async (_case, named, retry) => {
      mocks.listWishlistShelfItems.mockResolvedValue([BASIL]);
      mocks.findWishlistCatalogName.mockResolvedValue(named);

      const html = await renderList({
        outcome: "failed",
        action: "restore",
        target: TOMATO_ID,
      });
      const callout = html.slice(html.indexOf('id="shelf-outcome"'));

      expect(html).toContain('id="shelf-outcome"');
      expect(callout).toContain('data-shelf-outcome="failed"');
      expect(callout).toContain(uk.wishlist.failed.restore);
      expect(callout.includes(uk.common.retry)).toBe(retry);
      expect(callout.includes(`value="${TOMATO_ID}"`)).toBe(retry);
      expect(html).not.toContain("data-shelf-notice");
    },
  );

  it.each([
    ["uk", "/catalog"],
    ["ru", "/ru/catalog"],
  ] as const)(
    "names the empty list, draws no filter chips, and leads one way out in %s",
    async (locale, catalog) => {
      mocks.listWishlistShelfItems.mockResolvedValue([]);

      const html = await renderList({}, locale);

      expect(html).toContain('data-screen-state="empty-first-run"');
      expect(html).toContain(getSocialSurfaceCopy(locale).wishlist.emptyTitle);
      expect(html).not.toContain("data-wishlist-filters");
      expect(html).not.toContain("aria-pressed");
      expect(count(html, "<a ")).toBe(1);
      expect(html).toContain(`href="${catalog}"`);
    },
  );

  it("keeps the chips on a list whose filter matches nothing, with the way to clear it", async () => {
    const html = await renderList({ kind: "breed" });

    expect(html).toContain('data-screen-state="empty-no-results"');
    expect(html).toContain('data-wishlist-filters="true"');
    expect(html).toContain('href="/wishlist"');
    expect(html).not.toContain(uk.wishlist.emptyTitle);
  });
});
