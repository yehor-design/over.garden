import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  INTERFACE_LOCALE_COOKIE_NAME,
  INTERFACE_LOCALE_REQUEST_HEADER,
} from "@/lib/interface-localization";
import {
  INTERFACE_MARKET_COOKIE_NAME,
  INTERFACE_MARKET_REQUEST_HEADER,
  type InterfaceMarket,
} from "@/lib/interface-market";
import {
  APP_ROUTE_CACHE_CONTROL,
  classifyInternalNamespacePath,
  config,
  proxy,
} from "./proxy";

import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";

const mocks = vi.hoisted(() => ({
  getPublicObjectPassportLookup: vi.fn().mockResolvedValue({
    status: "not_found",
  }),
  getPublicObjectPassportAddress: vi.fn().mockResolvedValue(null),
  getPublicObjectPassportLifecycleBySlug: vi.fn().mockResolvedValue({
    status: "active",
    plantObjectId: "00000000-0000-4000-8000-000000000777",
  }),
  resolvePlantObjectAddress: vi.fn().mockResolvedValue(null),
  hasCatalogRegisterHub: vi.fn().mockResolvedValue(true),
  // Answers for the key it was asked about: an entry asked for by its number
  // is that number, and an entry asked for by a name it used to have is
  // yehor's twelfth (ADR-0029 D9, amendment of 2026-09-18).
  getPublicJournalEntryLifecycleLookup: vi
    .fn()
    .mockImplementation(
      async (key: {
        kind: "number" | "name";
        entryNumber?: number;
        publicSlug?: string;
      }) => ({
        status: "active",
        publicSlug: key.kind === "name" ? key.publicSlug : "field-note",
        entryNumber: key.kind === "number" ? key.entryNumber : 12,
        addressHandle: "yehor",
      }),
    ),
  getPublicProfileLifecycleLookup: vi.fn().mockResolvedValue({
    status: "active",
  }),
  getPublicCommunityLifecycleLookup: vi.fn().mockResolvedValue({
    status: "found",
  }),
  getPublicTopicLifecycleLookup: vi.fn().mockResolvedValue({
    status: "found",
    slug: "care-checks",
  }),
  resolvePublicTopicAddress: vi.fn().mockResolvedValue(null),
  isListingPageBeyondTheEnd: vi.fn().mockResolvedValue(false),
  resolveJournalEntryAddress: vi.fn().mockResolvedValue(null),
  resolvePublicCatalogAddress: vi.fn().mockResolvedValue({
    status: "canonical",
    catalogItemId: "11111111-1111-4111-8111-111111111111",
    canonicalPath: "/species/solanum-lycopersicum",
  }),
  getSession: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("@/server/public-object-passport-repository", () => ({
  getPublicObjectPassportLookup: mocks.getPublicObjectPassportLookup,
  getPublicObjectPassportAddress: mocks.getPublicObjectPassportAddress,
  getPublicObjectPassportLifecycleBySlug:
    mocks.getPublicObjectPassportLifecycleBySlug,
  resolvePlantObjectAddress: mocks.resolvePlantObjectAddress,
}));

vi.mock("@/server/public-catalog-register-repository", () => ({
  hasCatalogRegisterHub: mocks.hasCatalogRegisterHub,
}));

vi.mock("@/server/journal-repository", () => ({
  getPublicJournalEntryLifecycleLookup:
    mocks.getPublicJournalEntryLifecycleLookup,
}));

vi.mock("@/server/public-profile-repository", () => ({
  getPublicProfileLifecycleLookup: mocks.getPublicProfileLifecycleLookup,
}));

vi.mock("@/server/community-repository", () => ({
  getPublicCommunityLifecycleLookup: mocks.getPublicCommunityLifecycleLookup,
}));

vi.mock("@/server/public-catalog-address-repository", () => ({
  resolvePublicCatalogAddress: mocks.resolvePublicCatalogAddress,
}));

vi.mock("@/server/public-topic-repository", () => ({
  getPublicTopicLifecycleLookup: mocks.getPublicTopicLifecycleLookup,
  resolvePublicTopicAddress: mocks.resolvePublicTopicAddress,
}));

vi.mock("@/server/public-listing-bounds", () => ({
  isListingPageBeyondTheEnd: mocks.isListingPageBeyondTheEnd,
}));

vi.mock("@/server/journal-slug-repository", () => ({
  resolveJournalEntryAddress: mocks.resolveJournalEntryAddress,
}));

async function responseFor(
  path: string,
  headers?: HeadersInit,
  init?: Pick<RequestInit, "method">,
) {
  return proxy(
    new NextRequest(new URL(path, "https://over.garden"), {
      headers,
      method: init?.method,
    }),
  );
}

async function responseForHost(
  url: string,
  headers?: HeadersInit,
  init?: Pick<RequestInit, "method">,
) {
  return proxy(
    new NextRequest(url, {
      headers,
      method: init?.method,
    }),
  );
}

function interfaceCookies(market: InterfaceMarket, locale: "uk" | "bg" | "ru") {
  return `${INTERFACE_MARKET_COOKIE_NAME}=${market}; ${INTERFACE_LOCALE_COOKIE_NAME}=${locale}`;
}

describe("app route cache guardrail", () => {
  it("hard-404s retired control-plane routes before locale or App Router fallback handling", async () => {
    const retiredPaths = [
      "/admin",
      "/admin/",
      "/admin/retired-descendant",
      "/bg/admin",
      "/ru/admin/",
      "/bg/admin/communities",
      "/admin/communities",
      "/admin/communities/example",
      "/admin/moderation/comments",
      "/admin/users",
      "/admin/users/arbitrary",
      "/admin/moderation/comments/arbitrary",
      "/admin/communities/example/nested",
      "/%61dmin/communities",
      "/admin%2Fmoderation%2Fcomments",
      "/admin%252Fcommunities",
      "/join",
      "/join/arbitrary",
      "/garden/pilot-smoke",
      "/garden/pilot-smoke/arbitrary",
      "/garden/pilot-health",
      "/garden/pilot-health/arbitrary",
      "/garden/pilot-learning",
      "/garden/pilot-learning/interviews",
      "/garden/pilot-learning/decision",
      "/garden/catalog",
      "/garden/catalog/registry",
      "/garden/catalog/registry/editions",
      "/garden/catalog/registry/extensions/arbitrary",
      "/garden/catalog/curation",
      "/bg/garden/catalog/registry",
      "/garden/catalog%2Fregistry",
      "/health",
      "/health/",
      "/health/anything",
      "/bg/health",
      "/ru/health",
      "/bg/health/anything",
      "/%68ealth",
    ];

    for (const path of retiredPaths) {
      const response = await responseFor(path, {
        accept: "text/html",
        "sec-fetch-dest": "document",
      });

      expect(response.status, path).toBe(404);
      expect(response.headers.get("Cache-Control"), path).toBe(
        APP_ROUTE_CACHE_CONTROL,
      );
      expect(response.headers.get("X-Robots-Tag"), path).toBe(
        "noindex, nofollow",
      );
      expect(response.headers.get("set-cookie"), path).toBeNull();
    }

    // ADR-0026 D10: two owner surfaces live inside the retired namespace and
    // must reach the workspace, while every retired sibling stays a 404.
    for (const path of ["/garden/catalog/queue", "/garden/catalog/sources"]) {
      const response = await responseFor(path, {
        accept: "text/html",
        "sec-fetch-dest": "document",
      });
      expect(response.status, path).toBe(200);
    }

    // The workspace has no prefixed half and never had one. `/bg/garden/…`
    // used to reach `[locale]/[profileHandle]`, fail its `@` check and answer
    // `200` with a `noindex` body; nothing links there, because
    // `buildLocalizedInterfaceTarget` returns null for every `/garden` path.
    const prefixedWorkspace = await responseFor("/bg/garden/catalog/queue", {
      accept: "text/html",
      "sec-fetch-dest": "document",
    });
    expect(prefixedWorkspace.status).toBe(404);

    for (const preservedPath of [
      "/account/communities",
      "/account/communities/example",
      "/account/moderation/comments",
      "/garden/privacy/erasure-requests",
      "/garden/lineage/invitations/example",
      // ADR-0027 retired the `/health` page, not the liveness endpoint that
      // shares its name.
      "/api/health",
    ]) {
      expect((await responseFor(preservedPath)).status, preservedPath).toBe(
        200,
      );
    }
  });

  it("keeps canonical trailing-slash redirects after retired paths take precedence", async () => {
    const response = await responseFor("/garden/?view=journal", {
      accept: "text/html",
      "sec-fetch-dest": "document",
    });

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://over.garden/garden?view=journal",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("sends the garden page's old space journal to the space's own page (OVE-490)", async () => {
    const spaceId = "10000000-0000-4000-8000-000000000001";
    const response = await responseFor(
      `/garden?space=${spaceId}&saveProgress=space-entry`,
      { accept: "text/html", "sec-fetch-dest": "document" },
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      `https://over.garden/garden/spaces/${spaceId}?saveProgress=space-entry`,
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    // Anything else under `/garden` is the page itself, not a redirect.
    expect(
      (await responseFor("/garden?space=not-a-uuid", { accept: "text/html" }))
        .status,
    ).toBe(200);
  });

  it("redirects www document navigation to the canonical apex before auth UI can render", async () => {
    const response = await responseForHost(
      "https://www.over.garden/garden?returnTo=%2Fgarden%2Fprofile",
      { accept: "text/html", "sec-fetch-dest": "document" },
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://over.garden/garden?returnTo=%2Fgarden%2Fprofile",
    );
    expect(response.headers.get("set-cookie")).toBeNull();

    const apiResponse = await responseForHost(
      "https://www.over.garden/api/auth/sign-in/email",
      { accept: "application/json" },
      { method: "POST" },
    );
    expect(apiResponse.status).toBe(200);
  });

  it("hard-404s walking-skeleton routes outside an explicit loopback-only runtime", async () => {
    vi.stubEnv("WALKING_SKELETON_ENABLED", "false");
    const disabledPage = await responseFor("/skeleton");
    const disabledNested = await responseFor("/skeleton/internal");
    const disabledApi = await responseFor("/api/skeleton/journal", undefined, {
      method: "POST",
    });

    stubLocalWalkingSkeletonEnvironment();
    const enabledLocal = await proxy(
      new NextRequest("http://localhost:3000/skeleton", {
        headers: { host: "localhost:3000" },
      }),
    );
    const rejectedRawHost = await proxy(
      new NextRequest("http://localhost:3000/skeleton", {
        headers: { host: "developer-tunnel.example.test" },
      }),
    );
    const rejectedUrlHost = await proxy(
      new NextRequest("https://developer-tunnel.example.test/skeleton", {
        headers: { host: "localhost:3000" },
      }),
    );

    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    const preview = await proxy(
      new NextRequest("http://localhost:3000/api/skeleton/journal", {
        method: "POST",
      }),
    );

    vi.stubEnv("VERCEL_ENV", "production");
    const production = await proxy(
      new NextRequest("http://localhost:3000/skeleton"),
    );
    vi.unstubAllEnvs();

    expect(disabledPage.status).toBe(404);
    expect(disabledNested.status).toBe(404);
    expect(disabledApi.status).toBe(404);
    expect(await disabledApi.text()).toBe("");
    expect(disabledPage.headers.get("Cache-Control")).toBe(
      APP_ROUTE_CACHE_CONTROL,
    );
    expect(disabledPage.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(enabledLocal.status).toBe(200);
    expect(rejectedRawHost.status).toBe(404);
    expect(rejectedUrlHost.status).toBe(404);
    expect(preview.status).toBe(404);
    expect(production.status).toBe(404);
  });

  it("hard-404s every production internal representation before locale, auth, or lifecycle work", async () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://overgarden:test@localhost:5432/overgarden",
    );
    vi.stubEnv("PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("R2_ENDPOINT", "http://localhost:9000");
    vi.stubEnv("R2_PUBLIC_BASE_URL", "http://localhost:9000/overgarden-public");
    vi.stubEnv("VERCEL_ENV", "production");

    mocks.getPublicObjectPassportLookup.mockClear();
    mocks.getPublicJournalEntryLifecycleLookup.mockClear();
    mocks.getPublicProfileLifecycleLookup.mockClear();
    mocks.getPublicCommunityLifecycleLookup.mockClear();
    mocks.getSession.mockClear();

    const requests: Array<{
      path: string;
      headers?: HeadersInit;
      init?: Pick<RequestInit, "method">;
    }> = [
      { path: "/skeleton" },
      { path: "/skeleton/internal" },
      { path: "/api/skeleton/journal", init: { method: "POST" } },
      { path: "/%73keleton" },
      {
        path: "/api/%73keleton/journal",
        headers: { accept: "text/x-component", rsc: "1" },
      },
      {
        path: "/%73keleton",
        headers: { "next-router-prefetch": "1" },
      },
      {
        path: "/%73keleton",
        init: { method: "HEAD" },
      },
    ];

    try {
      for (const request of requests) {
        const response = await responseFor(
          request.path,
          request.headers,
          request.init,
        );
        expect(response.status).toBe(404);
        expect(response.headers.get("Cache-Control")).toBe(
          APP_ROUTE_CACHE_CONTROL,
        );
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
        expect(response.headers.get("Content-Language")).toBeNull();
        expect(response.headers.get("set-cookie")).toBeNull();
        expect(await response.text()).toBe("");
      }
    } finally {
      vi.unstubAllEnvs();
    }

    expect(mocks.getPublicObjectPassportLookup).not.toHaveBeenCalled();
    expect(mocks.getPublicJournalEntryLifecycleLookup).not.toHaveBeenCalled();
    expect(mocks.getPublicProfileLifecycleLookup).not.toHaveBeenCalled();
    expect(mocks.getPublicCommunityLifecycleLookup).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("classifies only reserved internal representations and keeps the classifier bounded", async () => {
    expect(classifyInternalNamespacePath("/skeleton")).toEqual({
      namespace: "skeleton",
      representation: "canonical",
    });
    expect(classifyInternalNamespacePath("/api/skeleton/journal")).toEqual({
      namespace: "skeleton",
      representation: "canonical",
    });
    expect(classifyInternalNamespacePath("/%73keleton")).toEqual({
      namespace: "skeleton",
      representation: "encoded",
    });
    expect(classifyInternalNamespacePath("/uk/%D1%81%D0%B0%D0%B4")).toBeNull();
    expect(classifyInternalNamespacePath("/api/garden/entries")).toBeNull();

    const start = performance.now();
    for (let index = 0; index < 100_000; index += 1) {
      classifyInternalNamespacePath(
        index % 2 === 0 ? "/%73keleton/internal" : "/uk/%D1%81%D0%B0%D0%B4",
      );
    }
    expect(performance.now() - start).toBeLessThan(250);

    const unicodeRoute = await responseFor("/uk/%D1%81%D0%B0%D0%B4", {
      accept: "text/html",
      "sec-fetch-dest": "document",
    });
    const apiRoute = await responseFor("/api/garden/entries", {
      accept: "application/json",
    });

    expect(unicodeRoute.status).toBe(308);
    expect(unicodeRoute.headers.get("Content-Language")).toBe("uk");
    expect(apiRoute.status).toBe(200);
  });

  it.each([
    "/garden",
    "/garden/privacy/erasure-requests",
    "/bg/garden",
    "/account/communities",
    "/auth/help",
    "/erasure",
    "/api/garden/entries",
    "/api/health",
    // The reader's own pages (`OVE-456` AC8). Each varies by session and none
    // is indexable, and none of them was on this list before.
    "/notifications",
    "/bookmarks",
    "/wishlist",
    "/feed",
    "/bg/bookmarks",
    "/ru/notifications",
  ])("sends explicit no-store cache control for %s", async (path) => {
    expect((await responseFor(path)).headers.get("Cache-Control")).toBe(
      APP_ROUTE_CACHE_CONTROL,
    );
  });

  it.each([
    "/",
    "/privacy",
    "/@yehor/post/7",
    "/variety/smoke-variety",
    "/bg/journals",
  ])(
    "leaves the cache headers of the public page %s to Next (ADR-0022, D4)",
    async (path) => {
      expect((await responseFor(path)).headers.get("Cache-Control")).toBeNull();
    },
  );

  it("returns a real 410 tombstone only for a previously public gone passport", async () => {
    const objectId = "00000000-0000-4000-8000-000000000101";
    mocks.getPublicObjectPassportLookup.mockResolvedValueOnce({
      status: "gone",
      plantObjectId: objectId,
    });
    const gone = await responseFor(`/lineage/objects/${objectId}`, {
      accept: "text/html",
      "sec-fetch-dest": "document",
    });

    expect(gone.status).toBe(410);
    expect(gone.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(gone.headers.get("Cache-Control")).toBe(APP_ROUTE_CACHE_CONTROL);
    expect(await gone.text()).toContain("Паспорт видалено");

    mocks.getPublicObjectPassportLookup.mockResolvedValueOnce({
      status: "active",
      page: {},
    });
    const active = await responseFor(`/lineage/objects/${objectId}`, {
      accept: "text/html",
      "sec-fetch-dest": "document",
    });
    const rsc = await responseFor(`/lineage/objects/${objectId}`, {
      accept: "text/x-component",
      rsc: "1",
    });
    const unpublished = await responseFor(`/lineage/objects/${objectId}`, {
      accept: "text/html",
      "sec-fetch-dest": "document",
    });

    expect(active.status).toBe(200);
    expect(rsc.status).toBe(200);
    expect(unpublished.status).toBe(404);
    expect(await unpublished.text()).toContain("Паспорт не знайдено");
    expect(mocks.getPublicObjectPassportLookup).toHaveBeenCalledTimes(3);
  });

  it("returns locale-prefixed passport 404/410 through the same raw lifecycle document", async () => {
    const objectId = "00000000-0000-4000-8000-000000000208";
    mocks.getPublicObjectPassportLookup.mockClear();
    mocks.getPublicObjectPassportLookup.mockResolvedValueOnce({
      status: "not_found",
      plantObjectId: objectId,
    });
    const missing = await responseFor(`/bg/lineage/objects/${objectId}`, {
      accept: "text/html",
      "sec-fetch-dest": "document",
      "x-vercel-ip-country": "BG",
    });
    const missingHtml = await missing.text();

    expect(missing.status).toBe(404);
    expect(missing.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(missing.headers.get("Cache-Control")).toBe(APP_ROUTE_CACHE_CONTROL);
    expect(missing.headers.get("Content-Language")).toBe("bg");
    expect(missingHtml).toContain("Паспортът не е намерен");
    expect(missingHtml).toContain("font-family: var(--font-overgarden-sans)");
    expect(missingHtml).toContain('name="robots" content="noindex, nofollow"');

    mocks.getPublicObjectPassportLookup.mockResolvedValueOnce({
      status: "gone",
      plantObjectId: objectId,
    });
    const gone = await responseFor(`/ru/lineage/objects/${objectId}`, {
      accept: "text/html",
      "sec-fetch-dest": "document",
      "x-vercel-ip-country": "BG",
    });
    const goneHtml = await gone.text();

    expect(gone.status).toBe(410);
    expect(gone.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(gone.headers.get("Content-Language")).toBe("ru");
    expect(goneHtml).toContain("Паспорт удален");
    expect(goneHtml).toContain("font-family: var(--font-overgarden-sans)");
    expect(mocks.getPublicObjectPassportLookup).toHaveBeenCalledTimes(2);
  });

  it("keeps unprefixed Bulgaria passport tombstones in locale-only POST mode without copying route identity", async () => {
    const objectId = "00000000-0000-4000-8000-000000000199";
    mocks.getPublicObjectPassportLookup.mockResolvedValueOnce({
      status: "gone",
      plantObjectId: objectId,
    });

    const response = await responseFor(
      `/lineage/objects/${objectId}?engagement=liked&token=opaque-passport-token`,
      {
        accept: "text/html",
        "sec-fetch-dest": "document",
        "x-vercel-ip-country": "BG",
      },
    );
    const html = await response.text();

    expect(response.status).toBe(410);
    expect(response.headers.get("Content-Language")).toBe("bg");
    expect(html).toContain('data-interface-language-control="true"');
    // A tombstone carries no client bundle, so its language control is a plain
    // form post rather than the inline fetch protocol it used to inline
    // (OVE-379).
    expect(html).toContain('action="/api/interface/locale"');
    expect(html).toContain('name="locale"');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain(objectId);
    expect(html).not.toContain("opaque-passport-token");
    expect(html).not.toContain("engagement=liked");
    expect(html).not.toContain("/bg/lineage/objects/");
    expect(html).not.toContain("/ru/lineage/objects/");
  });

  it("classifies generic HTTP document clients without intercepting RSC", async () => {
    const objectId = "00000000-0000-4000-8000-000000000102";
    mocks.getPublicObjectPassportLookup.mockResolvedValueOnce({
      status: "gone",
      plantObjectId: objectId,
    });

    const genericDocument = await responseFor(`/lineage/objects/${objectId}`, {
      accept: "*/*",
    });
    mocks.getPublicObjectPassportLookup.mockResolvedValueOnce({
      status: "gone",
      plantObjectId: objectId,
    });
    const headDocument = await responseFor(
      `/lineage/objects/${objectId}`,
      { accept: "*/*" },
      { method: "HEAD" },
    );
    const rsc = await responseFor(`/lineage/objects/${objectId}`, {
      accept: "*/*",
      rsc: "1",
    });
    const malformed = await responseFor("/lineage/objects/not-a-real-object", {
      accept: "text/html",
    });

    expect(genericDocument.status).toBe(410);
    expect(headDocument.status).toBe(410);
    expect(rsc.status).toBe(200);
    expect(malformed.status).toBe(404);
  });

  it("hard-classifies root and localized public journal documents without intercepting RSC", async () => {
    mocks.getPublicJournalEntryLifecycleLookup.mockResolvedValueOnce({
      status: "gone",
    });
    const gone = await responseFor("/journal/removed-entry", {
      accept: "text/html",
      "sec-fetch-dest": "document",
    });

    mocks.getPublicJournalEntryLifecycleLookup.mockResolvedValueOnce({
      status: "not_found",
    });
    const privateEntry = await responseFor(
      "/bg/journal/private-entry?engagement=interaction-unavailable&token=opaque-journal-token",
      {
        accept: "text/html",
        "sec-fetch-dest": "document",
      },
    );

    mocks.getPublicJournalEntryLifecycleLookup.mockResolvedValueOnce({
      status: "active",
      publicSlug: "active-entry",
      entryNumber: 12,
      addressHandle: "yehor",
    });
    const active = await responseFor("/ru/journal/active-entry", {
      accept: "text/html",
      "sec-fetch-dest": "document",
    });
    const rsc = await responseFor("/bg/journal/rsc-entry", {
      accept: "text/x-component",
      rsc: "1",
    });

    expect(gone.status).toBe(410);
    expect(gone.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(await gone.text()).toContain("Запис видалено");
    expect(privateEntry.status).toBe(404);
    expect(privateEntry.headers.get("Content-Language")).toBe("bg");
    const privateEntryHtml = await privateEntry.text();
    expect(privateEntryHtml).toContain("Записът не е намерен");
    expect(privateEntryHtml).toContain(
      'href="/bg/journal/private-entry?engagement=interaction-unavailable"',
    );
    expect(privateEntryHtml).toContain(
      'href="/ru/journal/private-entry?engagement=interaction-unavailable"',
    );
    expect(privateEntryHtml).not.toContain("opaque-journal-token");
    // An active entry asked for at `/ru/journal/{slug}` answers 308 to the one
    // address it has: under its author, at its number, with no locale prefix
    // (ADR-0029 D9, D10) — in one response, not by way of `/@yehor/{slug}`.
    expect(active.status).toBe(308);
    expect(active.headers.get("Location")).toBe(
      "https://over.garden/@yehor/post/12",
    );
    expect(rsc.status).toBe(200);
    // A legacy `/journal/{slug}` carries no handle; the key says so.
    expect(mocks.getPublicJournalEntryLifecycleLookup).toHaveBeenCalledWith({
      kind: "name",
      publicSlug: "private-entry",
      authorHandle: null,
    });
  });

  it("returns a generic localized 410 for retired profile handles without redirecting to the current identity", async () => {
    mocks.getPublicProfileLifecycleLookup.mockResolvedValueOnce({
      status: "gone",
    });
    const gone = await responseFor(
      "/bg/@former_garden?profileAction=reported&token=opaque-profile-token",
      {
        accept: "text/html",
        "sec-fetch-dest": "document",
      },
    );

    mocks.getPublicProfileLifecycleLookup.mockResolvedValueOnce({
      status: "gone",
    });
    const canonicalUkrainianGone = await responseFor(
      "/@former_ua_garden?profileAction=reported&token=opaque-root-token",
      {
        accept: "text/html",
        cookie: interfaceCookies("ukraine", "uk"),
        "sec-fetch-dest": "document",
      },
    );

    mocks.getPublicProfileLifecycleLookup.mockResolvedValueOnce({
      status: "not_found",
    });
    const unavailable = await responseFor("/bg/@private_garden", {
      accept: "text/html",
      "sec-fetch-dest": "document",
    });

    mocks.getPublicProfileLifecycleLookup.mockResolvedValueOnce({
      status: "active",
    });
    const active = await responseFor("/ru/@active_garden", {
      accept: "text/html",
      "sec-fetch-dest": "document",
    });
    const rsc = await responseFor("/@rsc_garden", {
      accept: "text/x-component",
      rsc: "1",
    });

    expect(gone.status).toBe(410);
    expect(gone.headers.get("Location")).toBeNull();
    expect(gone.headers.get("Content-Language")).toBe("bg");
    expect(gone.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(gone.headers.get("Cache-Control")).toBe(APP_ROUTE_CACHE_CONTROL);
    const goneHtml = await gone.text();
    expect(goneHtml).toContain("Профилът вече не е достъпен");
    expect(goneHtml).toContain(
      'href="/bg/@former_garden?profileAction=reported"',
    );
    expect(goneHtml).toContain(
      'href="/ru/@former_garden?profileAction=reported"',
    );
    expect(goneHtml).not.toContain("opaque-profile-token");
    expect(goneHtml).not.toContain("current_garden");
    expect(canonicalUkrainianGone.status).toBe(410);
    expect(canonicalUkrainianGone.headers.get("Location")).toBeNull();
    expect(
      canonicalUkrainianGone.headers.get("x-middleware-rewrite"),
    ).toBeNull();
    expect(canonicalUkrainianGone.headers.get("Content-Language")).toBe("uk");
    expect(canonicalUkrainianGone.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow",
    );
    const canonicalUkrainianGoneHtml = await canonicalUkrainianGone.text();
    expect(canonicalUkrainianGoneHtml).toContain("Профіль більше недоступний");
    expect(canonicalUkrainianGoneHtml).not.toContain("opaque-root-token");
    // Even a tombstone carries the control, in every language: a reader who
    // lands on a dead address in a language they do not read has to be able to
    // leave it in one they do. Each option is the prefixed spelling, which is
    // what tells the proxy the language was chosen.
    expect(canonicalUkrainianGoneHtml).toContain(
      "data-interface-language-control",
    );
    expect(canonicalUkrainianGoneHtml).toContain(
      'href="/bg/@former_ua_garden?profileAction=reported"',
    );
    expect(canonicalUkrainianGoneHtml).toContain(
      'href="/uk/@former_ua_garden?profileAction=reported"',
    );
    expect(unavailable.status).toBe(404);
    expect(unavailable.headers.get("Content-Language")).toBe("bg");
    expect(unavailable.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(await unavailable.text()).toContain("Профилът не е намерен");
    expect(active.status).toBe(200);
    expect(rsc.status).toBe(200);
    expect(mocks.getPublicProfileLifecycleLookup).toHaveBeenCalledWith(
      "former_garden",
      null,
    );
    expect(mocks.getPublicProfileLifecycleLookup).toHaveBeenCalledWith(
      "former_ua_garden",
      null,
    );
    expect(mocks.getPublicProfileLifecycleLookup).toHaveBeenCalledWith(
      "private_garden",
      null,
    );
  });

  it("passes only a signed-in viewer id into blocked profile lifecycle classification", async () => {
    const viewerUserId = "00000000-0000-4000-8000-000000000203";
    mocks.getSession.mockResolvedValueOnce({ user: { id: viewerUserId } });
    mocks.getPublicProfileLifecycleLookup.mockResolvedValueOnce({
      status: "not_found",
    });

    const response = await responseFor("/bg/@blocked_garden", {
      accept: "text/html",
      cookie: "__Secure-overgarden.session_token=opaque-test-token",
      "sec-fetch-dest": "document",
    });

    expect(response.status).toBe(404);
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(mocks.getPublicProfileLifecycleLookup).toHaveBeenCalledWith(
      "blocked_garden",
      viewerUserId,
    );
  });

  it.each(["/@active_garden", "/bg/@active_garden", "/ru/@active_garden"])(
    "rewrites selected profile tabs after lifecycle classification: %s",
    async (address) => {
      const response = await responseFor(`${address}?tab=entries`, {
        accept: "text/html",
      });
      expect(response.status).toBe(200);
      const rewrite = response.headers.get("x-middleware-rewrite");
      expect(rewrite).toContain("/q/@active_garden?tab=entries");
      expect(mocks.getPublicProfileLifecycleLookup).toHaveBeenCalledWith(
        "active_garden",
        null,
      );
    },
  );

  it.each([
    "/@blocked_garden",
    "/bg/@blocked_garden",
    "/ru/@blocked_garden?tab=entries",
  ])(
    "refuses blocked profile RSC and prefetch reads before serving cached content: %s",
    async (address) => {
      const viewerUserId = "00000000-0000-4000-8000-000000000203";
      for (const prefetch of [false, true]) {
        mocks.getSession.mockResolvedValueOnce({ user: { id: viewerUserId } });
        mocks.getPublicProfileLifecycleLookup.mockResolvedValueOnce({
          status: "not_found",
        });
        const response = await responseFor(address, {
          accept: "text/x-component",
          rsc: "1",
          ...(prefetch ? { "next-router-prefetch": "1" } : {}),
          cookie: "__Secure-overgarden.session_token=opaque-test-token",
        });
        expect(response.status).toBe(404);
        expect(response.headers.get("x-middleware-rewrite")).toBeNull();
        expect(mocks.getPublicProfileLifecycleLookup).toHaveBeenLastCalledWith(
          "blocked_garden",
          viewerUserId,
        );
      }
    },
  );

  it("hard-classifies unavailable communities without intercepting active or RSC routes", async () => {
    mocks.getPublicCommunityLifecycleLookup.mockResolvedValueOnce({
      status: "not_found",
    });
    const unavailable = await responseFor(
      "/bg/communities/missing-community?communityAction=joined&token=opaque-community-token",
      {
        accept: "text/html",
        "sec-fetch-dest": "document",
      },
    );

    mocks.getPublicCommunityLifecycleLookup.mockResolvedValueOnce({
      status: "found",
      communityId: "00000000-0000-4000-8000-000000000501",
    });
    const active = await responseFor("/communities/observation-and-care", {
      accept: "text/html",
      "sec-fetch-dest": "document",
    });
    const rsc = await responseFor("/communities/rsc-community", {
      accept: "text/x-component",
      rsc: "1",
    });

    expect(unavailable.status).toBe(404);
    expect(unavailable.headers.get("Content-Language")).toBe("bg");
    expect(unavailable.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    const unavailableHtml = await unavailable.text();
    expect(unavailableHtml).toContain("Общността не е намерена");
    expect(unavailableHtml).toContain(
      'href="/bg/communities/missing-community?communityAction=joined"',
    );
    expect(unavailableHtml).toContain(
      'href="/ru/communities/missing-community?communityAction=joined"',
    );
    expect(unavailableHtml).not.toContain("opaque-community-token");
    expect(active.status).toBe(200);
    expect(rsc.status).toBe(200);
    expect(mocks.getPublicCommunityLifecycleLookup).toHaveBeenCalledWith(
      "missing-community",
    );
  });

  it("serves unprefixed community, profile and journal documents to every country, and reaches their lifecycle lookups", async () => {
    mocks.getPublicCommunityLifecycleLookup.mockClear();
    mocks.getPublicProfileLifecycleLookup.mockClear();
    mocks.getPublicJournalEntryLifecycleLookup.mockClear();

    const community = await responseFor("/communities/missing-community", {
      accept: "text/html",
      "sec-fetch-dest": "document",
      "x-vercel-ip-country": "BG",
    });
    const profile = await responseFor("/@missing_garden", {
      accept: "text/html",
      "sec-fetch-dest": "document",
      "x-vercel-ip-country": "BG",
    });
    const journal = await responseFor(
      "/journal/missing-entry?engagement=interaction-unavailable&token=opaque-token",
      {
        accept: "text/html",
        "sec-fetch-dest": "document",
        "x-vercel-ip-country": "BG",
      },
    );

    // A canonical address answers to everyone (ADR-0029 D10). These used to
    // 307 to /bg on the strength of the country header, which meant the proxy
    // never reached the lifecycle lookup that decides 200, 410 or 404 — the
    // country of the reader changed which of those they got.
    for (const response of [community, profile]) {
      expect(response.status).not.toBe(307);
      expect(response.headers.get("Location")).toBeNull();
    }
    // The entry's legacy address is a permanent redirect to the one it has
    // under its author (ADR-0029 D9) — a 308 that does not depend on the
    // country header, which is what this test is about.
    expect(journal.status).toBe(308);
    expect(journal.headers.get("Location")).toBe(
      "https://over.garden/@yehor/post/12",
    );
    expect(mocks.getPublicCommunityLifecycleLookup).toHaveBeenCalled();
    expect(mocks.getPublicProfileLifecycleLookup).toHaveBeenCalled();
    expect(mocks.getPublicJournalEntryLifecycleLookup).toHaveBeenCalled();
  });

  it("keeps only Next internals and the favicon out of the proxy matcher", async () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    expect(matcher.test("/")).toBe(true);
    expect(matcher.test("/privacy")).toBe(true);
    expect(matcher.test("/api/garden/entries")).toBe(true);
    expect(matcher.test("/_next/static/chunks/app.js")).toBe(false);
    expect(matcher.test("/_next/image")).toBe(false);
    expect(matcher.test("/favicon.ico")).toBe(false);
    // Dotted paths reach the proxy so an unknown root file answers a real 404
    // instead of being swallowed by the [locale] segment.
    expect(matcher.test("/sw.js")).toBe(true);
    expect(
      matcher.test(
        "/fonts/google-sans/google-sans-cyrillic-0123456789abcdef.woff2",
      ),
    ).toBe(true);
    expect(matcher.test("/photos/derivative.webp")).toBe(true);
    expect(matcher.test("/apple-icon.png")).toBe(true);
  });

  it("redirects legacy Ukrainian-prefixed public URLs to unprefixed canonicals", async () => {
    const rootResponse = await responseFor("/uk");
    const nestedResponse = await responseFor(
      "/uk/blog/first-public-garden-log",
    );
    const secretBearingLegacyResponse = await responseFor(
      "/uk/auth/reset-password?token=opaque-reset-token&callbackURL=%2Fgarden",
    );

    expect(rootResponse.status).toBe(308);
    expect(rootResponse.headers.get("Location")).toBe("https://over.garden/");
    expect(nestedResponse.status).toBe(308);
    expect(nestedResponse.headers.get("Location")).toBe(
      "https://over.garden/blog/first-public-garden-log",
    );
    expect(secretBearingLegacyResponse.status).toBe(308);
    expect(secretBearingLegacyResponse.headers.get("Location")).toBe(
      "https://over.garden/auth/reset-password?token=opaque-reset-token&callbackURL=%2Fgarden",
    );
    expect(secretBearingLegacyResponse.headers.get("set-cookie")).not.toContain(
      "opaque-reset-token",
    );
    expect(
      secretBearingLegacyResponse.headers.get(
        `x-middleware-request-${INTERFACE_LOCALE_REQUEST_HEADER}`,
      ),
    ).toBeNull();
    expect(rootResponse.headers.get("Cache-Control")).toBe(
      APP_ROUTE_CACHE_CONTROL,
    );
    expect(rootResponse.headers.get("Content-Language")).toBe("uk");
    expect(rootResponse.headers.get("set-cookie")).toContain(
      `${INTERFACE_LOCALE_COOKIE_NAME}=uk`,
    );
  });

  it("serves the root to every country and never redirects on geography", async () => {
    const bgResponse = await responseFor("/", {
      "x-vercel-ip-country": "BG",
    });
    const uaResponse = await responseFor("/", {
      "x-vercel-ip-country": "UA",
    });

    // `/` is the most-linked URL on the site. Making it a redirect wasted the
    // authority it has and made the crawl non-deterministic: which homepage a
    // crawler indexed depended on the IP its request left from. `hreflang`
    // plus `x-default` is what tells a search engine which one to show.
    expect(bgResponse.status).toBe(200);
    expect(bgResponse.headers.get("Location")).toBeNull();
    // The reader still gets a Bulgarian interface; only the address is fixed.
    expect(bgResponse.headers.get("Content-Language")).toBe("bg");
    expect(uaResponse.status).toBe(200);
    expect(uaResponse.headers.get("Content-Language")).toBe("uk");
  });

  it("persists a localized public route and forwards it into signed-in routes", async () => {
    const publicResponse = await responseFor("/bg");
    const setCookie = publicResponse.headers.get("set-cookie");

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get("Content-Language")).toBe("bg");
    // The language is the reader's choice and is written down. The market is
    // where they are, and a `/bg` address says nothing about that: with no
    // country signal this request stays in the fallback market, which now
    // offers Bulgarian anyway.
    expect(setCookie).toContain(`${INTERFACE_MARKET_COOKIE_NAME}=ukraine`);
    expect(setCookie).toContain(`${INTERFACE_LOCALE_COOKIE_NAME}=bg`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).not.toMatch(/journal|invite|email|location|token/i);

    const gardenResponse = await responseFor("/garden", {
      cookie: interfaceCookies("bulgaria", "bg"),
      "accept-language": "uk;q=1",
    });

    expect(gardenResponse.status).toBe(200);
    expect(gardenResponse.headers.get("Content-Language")).toBe("bg");
    // The workspace reads the choice from the cookie, not from a header this
    // layer pins: the address names no language, so none is forwarded — see
    // "forwards the address's language to the render, and nothing else".
    expect(
      gardenResponse.headers.get(
        `x-middleware-request-${INTERFACE_LOCALE_REQUEST_HEADER}`,
      ),
    ).toBeNull();
    expect(
      gardenResponse.headers.get(
        `x-middleware-request-${INTERFACE_MARKET_REQUEST_HEADER}`,
      ),
    ).toBe("bulgaria");

    const uaGardenResponse = await responseFor("/garden", {
      cookie: interfaceCookies("bulgaria", "bg"),
      "x-vercel-ip-country": "UA",
    });
    // Crossing into Ukraine moves the market, and the market moves nothing
    // else: a reader who chose Bulgarian keeps reading Bulgarian, in the
    // workspace as on every public page.
    expect(uaGardenResponse.headers.get("Content-Language")).toBe("bg");
    expect(uaGardenResponse.headers.get("set-cookie")).toContain(
      `${INTERFACE_MARKET_COOKIE_NAME}=ukraine`,
    );
  });

  it("lets a localized route override a previous preference", async () => {
    const response = await responseFor("/ru/feed", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=bg`,
      "accept-language": "uk;q=1",
      "x-vercel-ip-country": "UA",
    });

    expect(response.headers.get("Content-Language")).toBe("ru");
    expect(response.headers.get("set-cookie")).toContain(
      `${INTERFACE_LOCALE_COOKIE_NAME}=ru`,
    );
  });

  it("does not change the persisted preference during route prefetch", async () => {
    const nextPrefetch = await responseFor("/ru", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=bg`,
      "next-router-prefetch": "1",
    });
    const browserPrefetch = await responseFor("/ru", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=bg`,
      purpose: "prefetch",
    });

    expect(nextPrefetch.headers.get("Content-Language")).toBe("ru");
    expect(nextPrefetch.headers.get("set-cookie")).toBeNull();
    expect(browserPrefetch.headers.get("Content-Language")).toBe("ru");
    expect(browserPrefetch.headers.get("set-cookie")).toBeNull();
  });

  it("writes the saved language on a document load and never on a fetch the router makes", async () => {
    // The request a router prefetch actually is by the time it reaches the
    // proxy: Next has stripped `rsc` and `next-router-prefetch`, and what is
    // left is the browser's own `Sec-Fetch-Dest: empty`. Measured on
    // production on 2026-09-21, each of these wrote `ru` over a reader's
    // fresh choice of Ukrainian — the page's own `/ru/…` links, prefetched
    // the moment the choice re-rendered it.
    const routerFetch = await responseFor("/ru/journals", {
      cookie: interfaceCookies("bulgaria", "uk"),
      accept: "*/*",
      "sec-fetch-dest": "empty",
      "x-vercel-ip-country": "UA",
    });
    expect(routerFetch.status).toBe(200);
    expect(routerFetch.headers.get("Content-Language")).toBe("ru");
    // Neither the language nor the market: a fetch is not where a reader is.
    expect(routerFetch.headers.get("set-cookie")).toBeNull();

    const documentLoad = await responseFor("/ru/journals", {
      cookie: interfaceCookies("bulgaria", "uk"),
      accept: "text/html",
      "sec-fetch-dest": "document",
    });
    expect(documentLoad.status).toBe(200);
    expect(documentLoad.headers.get("set-cookie")).toContain(
      `${INTERFACE_LOCALE_COOKIE_NAME}=ru`,
    );
  });

  it("forwards the address's language to the render, and nothing else", async () => {
    const localeHeader = `x-middleware-request-${INTERFACE_LOCALE_REQUEST_HEADER}`;
    const overridden = (response: Response) =>
      (response.headers.get("x-middleware-override-headers") ?? "")
        .split(",")
        .map((name) => name.trim());

    // `/bg/…` names a language the render cannot read anywhere else.
    const prefixed = await responseFor("/bg/journals", {
      cookie: interfaceCookies("bulgaria", "ru"),
      accept: "text/html",
      "sec-fetch-dest": "document",
    });
    expect(prefixed.headers.get(localeHeader)).toBe("bg");

    // The choice itself. A Server Action on a workspace route writes the
    // cookie, and Next hands the render that follows it the cookies it wrote
    // but the headers the request arrived with. A language pinned here would
    // outrank the choice, and the page came back in the language just left.
    const choice = await responseFor(
      "/garden/profile",
      {
        cookie: interfaceCookies("bulgaria", "ru"),
        "next-action": "action-id",
        "x-vercel-ip-country": "BG",
      },
      { method: "POST" },
    );
    expect(choice.status).toBe(200);
    expect(choice.headers.get(localeHeader)).toBeNull();
    expect(overridden(choice)).not.toContain(INTERFACE_LOCALE_REQUEST_HEADER);
    expect(
      choice.headers.get(
        `x-middleware-request-${INTERFACE_MARKET_REQUEST_HEADER}`,
      ),
    ).toBe("bulgaria");

    // An unprefixed public address is rewritten into the reader's subtree;
    // the language travels in the path the page is rendered from.
    const rewritten = await responseFor("/@yehor", {
      cookie: interfaceCookies("bulgaria", "ru"),
      accept: "text/html",
      "sec-fetch-dest": "document",
    });
    expect(rewritten.headers.get("x-middleware-rewrite")).toBe(
      "https://over.garden/ru/@yehor",
    );
    expect(rewritten.headers.get(localeHeader)).toBeNull();
    expect(overridden(rewritten)).not.toContain(
      INTERFACE_LOCALE_REQUEST_HEADER,
    );
  });

  it("keeps mutations, APIs, RSC requests, and server actions out of locale persistence and canonical redirects", async () => {
    const mutation = await responseFor(
      "/privacy",
      {
        cookie: interfaceCookies("bulgaria", "bg"),
        accept: "text/html",
      },
      { method: "POST" },
    );
    const apiRequest = await responseFor("/api/garden/entries", {
      "x-vercel-ip-country": "BG",
    });
    const localePreferenceApi = await responseFor(
      "/api/interface/locale",
      {
        "content-type": "application/json",
        origin: "https://over.garden",
        "x-vercel-ip-country": "BG",
      },
      { method: "POST" },
    );
    const rscRequest = await responseFor("/privacy", {
      cookie: interfaceCookies("bulgaria", "bg"),
      rsc: "1",
      accept: "text/x-component",
    });
    const serverAction = await responseFor(
      "/ru/privacy",
      {
        cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=bg`,
        "next-action": "action-id",
      },
      { method: "POST" },
    );

    for (const response of [
      mutation,
      apiRequest,
      localePreferenceApi,
      rscRequest,
      serverAction,
    ]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("Location")).toBeNull();
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(rscRequest.headers.get("Content-Language")).toBe("bg");
    expect(serverAction.headers.get("Content-Language")).toBe("ru");
    expect(
      localePreferenceApi.headers.get(
        `x-middleware-request-${INTERFACE_MARKET_REQUEST_HEADER}`,
      ),
    ).toBe("bulgaria");
  });

  it("never passes on a caller-supplied internal market or locale header", async () => {
    const response = await responseFor(
      "/api/interface/locale",
      {
        "content-type": "application/json",
        origin: "https://over.garden",
        "x-vercel-ip-country": "BG",
        [INTERFACE_MARKET_REQUEST_HEADER]: "ukraine",
        [INTERFACE_LOCALE_REQUEST_HEADER]: "uk",
      },
      { method: "POST" },
    );

    expect(
      response.headers.get(
        `x-middleware-request-${INTERFACE_MARKET_REQUEST_HEADER}`,
      ),
    ).toBe("bulgaria");
    // The address names no language, so this layer forwards none — and the
    // caller's is removed rather than passed through to outrank the cookie.
    expect(
      response.headers.get(
        `x-middleware-request-${INTERFACE_LOCALE_REQUEST_HEADER}`,
      ),
    ).toBeNull();
    expect(
      (response.headers.get("x-middleware-override-headers") ?? "").split(","),
    ).not.toContain(INTERFACE_LOCALE_REQUEST_HEADER);

    const prefixed = await responseFor("/bg/privacy", {
      "x-vercel-ip-country": "UA",
      [INTERFACE_LOCALE_REQUEST_HEADER]: "ru",
    });
    expect(
      prefixed.headers.get(
        `x-middleware-request-${INTERFACE_LOCALE_REQUEST_HEADER}`,
      ),
    ).toBe("bg");
  });

  it("bounds root preferences to the resolved market and ignores Accept-Language", async () => {
    const persistedRussian = await responseFor("/", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=ru`,
      "x-vercel-ip-country": "BG",
    });
    const persistedUkrainian = await responseFor("/", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=uk`,
      "x-vercel-ip-country": "BG",
    });
    const invalidPreference = await responseFor("/", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=en`,
      "accept-language": "ru;q=1",
    });
    const persistedBulgaria = await responseFor("/", {
      cookie: interfaceCookies("bulgaria", "ru"),
    });

    // The preference still decides the interface language; it no longer
    // decides the address. Every one of these answers 200 at the URL asked for.
    for (const response of [
      persistedRussian,
      persistedUkrainian,
      invalidPreference,
      persistedBulgaria,
    ]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("Location")).toBeNull();
    }
    expect(persistedRussian.headers.get("Content-Language")).toBe("ru");
    // A reader in Bulgaria who chose Ukrainian keeps Ukrainian. The market
    // used to overrule them here, which is the whole complaint this change
    // answers.
    expect(persistedUkrainian.headers.get("Content-Language")).toBe("uk");
    expect(invalidPreference.headers.get("Content-Language")).toBe("uk");
    expect(persistedBulgaria.headers.get("Content-Language")).toBe("ru");
  });

  it("serves unprefixed public routes at the address asked for, in the persisted interface language", async () => {
    const privacyResponse = await responseFor("/privacy", {
      cookie: interfaceCookies("bulgaria", "bg"),
    });
    const blogResponse = await responseFor("/blog/field-note", {
      cookie: interfaceCookies("bulgaria", "ru"),
    });
    const ugcResponse = await responseFor("/@yehor/post/12", {
      cookie: interfaceCookies("bulgaria", "bg"),
    });
    const catalogResponse = await responseFor(
      "/catalog?kingdom=plantae&token=opaque",
      {
        cookie: interfaceCookies("bulgaria", "ru"),
      },
    );
    const topicResponse = await responseFor(
      "/topics/care-checks?authIntent=follow&token=opaque",
      { cookie: interfaceCookies("bulgaria", "bg") },
    );

    for (const [name, response, language, rendered] of [
      ["privacy", privacyResponse, "bg", "/bg/privacy"],
      ["blog", blogResponse, "ru", "/ru/blog/field-note"],
      ["journal", ugcResponse, "bg", "/bg/@yehor/post/12"],
      ["catalog", catalogResponse, "ru", "/ru/q/catalog"],
      ["topic", topicResponse, "bg", "/bg/topics/care-checks"],
    ] as const) {
      expect(response.status, name).toBe(200);
      expect(response.headers.get("Location"), name).toBeNull();
      expect(response.headers.get("Content-Language"), name).toBe(language);
      // The address the reader asked for is the address they keep; which
      // locale subtree renders it is the proxy's business. Before this, the
      // language was a header on a Ukrainian document.
      expect(response.headers.get("x-middleware-rewrite"), name).toContain(
        rendered,
      );
    }
  });

  it("renders an unprefixed address in the reader's language and leaves everything else alone", async () => {
    const ukrainianReader = await responseFor("/journals", {
      cookie: interfaceCookies("ukraine", "uk"),
    });
    const crawler = await responseFor("/journals");
    const bulgarianReader = await responseFor("/journals", {
      cookie: interfaceCookies("bulgaria", "bg"),
    });
    const workspace = await responseFor("/garden", {
      cookie: interfaceCookies("bulgaria", "bg"),
    });
    const permalink = await responseFor("/erasure", {
      cookie: interfaceCookies("bulgaria", "bg"),
    });
    const alreadyPrefixed = await responseFor("/bg/journals", {
      cookie: interfaceCookies("bulgaria", "bg"),
    });

    // The default locale is rewritten too (ADR-0032 D1). It used not to be,
    // and a Ukrainian reader — and a crawler, which carries no preference —
    // rendered from the unprefixed tree, whose root layout also serves the
    // workspace and so cannot know its language before the request: the
    // largest market was the one that could not have a static document.
    expect(ukrainianReader.headers.get("x-middleware-rewrite")).toContain(
      "/uk/journals",
    );
    expect(ukrainianReader.status).toBe(200);
    expect(ukrainianReader.headers.get("Location")).toBeNull();
    expect(crawler.headers.get("x-middleware-rewrite")).toContain(
      "/uk/journals",
    );
    expect(crawler.headers.get("Content-Language")).toBe("uk");

    expect(bulgarianReader.headers.get("x-middleware-rewrite")).toContain(
      "/bg/journals",
    );
    expect(bulgarianReader.status).toBe(200);

    // Nothing without a prefixed twin is rewritten: the workspace reads the
    // same preference at request time, and a page that exists only unprefixed
    // would 404 in a subtree that does not hold it.
    expect(workspace.headers.get("x-middleware-rewrite")).toBeNull();
    expect(workspace.headers.get("Content-Language")).toBe("bg");
    expect(permalink.headers.get("x-middleware-rewrite")).toBeNull();
    expect(alreadyPrefixed.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("renders a listing's query string from its twin, and only a query the route accepts", async () => {
    const home = await responseFor("/");
    const filtered = await responseFor("/?kind=plant");
    const tracked = await responseFor("/?utm_source=newsletter&fbclid=abc");
    const bulgarianFiltered = await responseFor("/?kind=animal", {
      cookie: interfaceCookies("bulgaria", "bg"),
    });
    const prefixedFiltered = await responseFor("/ru?kind=plant", {
      cookie: interfaceCookies("bulgaria", "ru"),
    });

    // ADR-0032 D5: the page at the canonical path never reads `searchParams`,
    // so the request that carries one the policy accepts renders from `/q`.
    expect(new URL(home.headers.get("x-middleware-rewrite")!).pathname).toBe(
      "/uk",
    );
    expect(
      new URL(filtered.headers.get("x-middleware-rewrite")!).pathname,
    ).toBe("/uk/q");
    expect(
      new URL(filtered.headers.get("x-middleware-rewrite")!).search,
    ).toContain("kind=plant");
    // What the policy drops is not a reason to leave the static document.
    expect(new URL(tracked.headers.get("x-middleware-rewrite")!).pathname).toBe(
      "/uk",
    );
    expect(
      new URL(bulgarianFiltered.headers.get("x-middleware-rewrite")!).pathname,
    ).toBe("/bg/q");
    // A prefixed spelling is left alone — unless it carries a query.
    expect(
      new URL(prefixedFiltered.headers.get("x-middleware-rewrite")!).pathname,
    ).toBe("/ru/q");
    for (const response of [home, filtered, tracked, bulgarianFiltered]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("Location")).toBeNull();
    }
  });

  it("rewrites catalog facets without losing repeated values or the public address", async () => {
    const filtered = await responseFor(
      "/bg/catalog?kingdom=&kingdom=plantae&letter=s",
    );
    const rewritten = new URL(filtered.headers.get("x-middleware-rewrite")!);
    expect(rewritten.pathname).toBe("/bg/q/catalog");
    expect(rewritten.searchParams.getAll("kingdom")).toEqual(["", "plantae"]);
    expect(rewritten.searchParams.get("letter")).toBe("s");
    expect(filtered.headers.get("Location")).toBeNull();
    const tracked = await responseFor("/catalog?utm_source=proof");
    expect(new URL(tracked.headers.get("x-middleware-rewrite")!).pathname).toBe(
      "/uk/catalog",
    );
  });

  it("lands a Server Action in the tree that drew its form", async () => {
    // Next resolves a progressive form's action out of the matched route's own
    // manifest, and the page rendered from the locale tree (ADR-0032 D1). A
    // `POST` left at the unprefixed twin would also rerender a request-time
    // document into a reader who is in a static one.
    const ukrainian = await responseFor("/communities/tomaty", undefined, {
      method: "POST",
    });
    const bulgarian = await responseFor(
      "/species/solanum-lycopersicum",
      { cookie: interfaceCookies("bulgaria", "bg") },
      { method: "POST" },
    );
    const workspace = await responseFor("/garden", undefined, {
      method: "POST",
    });
    const other = await responseFor("/journals", undefined, {
      method: "DELETE",
    });

    expect(
      new URL(ukrainian.headers.get("x-middleware-rewrite")!).pathname,
    ).toBe("/uk/communities/tomaty");
    expect(
      new URL(bulgarian.headers.get("x-middleware-rewrite")!).pathname,
    ).toBe("/bg/species/solanum-lycopersicum");
    expect(workspace.headers.get("x-middleware-rewrite")).toBeNull();
    expect(other.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("answers 404 to a request that names the twin's reserved segment", async () => {
    for (const address of ["/q", "/uk/q", "/bg/q", "/ru/q/journals", "/q/x"]) {
      const response = await responseFor(address);
      expect(response.status, address).toBe(404);
      expect(response.headers.get("x-middleware-rewrite"), address).toBeNull();
    }
  });

  it("canonicalizes a supported but non-canonical cookie value", async () => {
    const response = await responseFor("/garden", {
      cookie: `${INTERFACE_MARKET_COOKIE_NAME}=bulgaria; ${INTERFACE_LOCALE_COOKIE_NAME}=BG`,
    });

    expect(response.headers.get("Content-Language")).toBe("bg");
    expect(response.headers.get("set-cookie")).toContain(
      `${INTERFACE_LOCALE_COOKIE_NAME}=bg`,
    );
  });

  it("serves the canonical unprefixed profile whatever the interface preference", async () => {
    const ukrainianProfile = await responseFor("/@green_thumb", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=uk`,
    });
    const bulgarianProfile = await responseFor("/@green_thumb", {
      cookie: interfaceCookies("bulgaria", "bg"),
    });
    const encodedUkrainianProfile = await responseFor("/%40green_thumb", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=uk`,
    });
    const encodedBulgarianProfile = await responseFor("/%40green_thumb", {
      cookie: interfaceCookies("bulgaria", "bg"),
    });
    const ukrainianProfileHead = await responseFor(
      "/@green_thumb",
      { cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=uk` },
      { method: "HEAD" },
    );
    const spoofedInternalRewriteHeader = await responseFor("/uk/@green_thumb", {
      "x-overgarden-internal-profile-rewrite": "v1",
      "x-overgarden-internal-profile-rewrite-signature": "forged",
    });
    const nonAsciiForgedInternalRewriteHeader = await responseFor(
      "/uk/@green_thumb",
      {
        "x-overgarden-internal-profile-rewrite": "v1",
        "x-overgarden-internal-profile-rewrite-signature": "é".repeat(43),
      },
    );
    const internalRewriteMarker = ukrainianProfile.headers.get(
      "x-middleware-request-x-overgarden-internal-profile-rewrite",
    );
    const internalRewriteSignature = ukrainianProfile.headers.get(
      "x-middleware-request-x-overgarden-internal-profile-rewrite-signature",
    );
    const trustedInternalRewrite = await responseFor("/uk/@green_thumb", {
      "x-overgarden-internal-profile-rewrite": internalRewriteMarker!,
      "x-overgarden-internal-profile-rewrite-signature":
        internalRewriteSignature!,
    });
    const replayedOnDifferentPath = await responseFor("/uk/@other_thumb", {
      "x-overgarden-internal-profile-rewrite": internalRewriteMarker!,
      "x-overgarden-internal-profile-rewrite-signature":
        internalRewriteSignature!,
    });
    const replayedWithDifferentMethod = await responseFor(
      "/uk/@green_thumb",
      {
        "x-overgarden-internal-profile-rewrite": internalRewriteMarker!,
        "x-overgarden-internal-profile-rewrite-signature":
          internalRewriteSignature!,
      },
      { method: "HEAD" },
    );

    expect(ukrainianProfile.status).toBe(200);
    expect(ukrainianProfile.headers.get("x-middleware-rewrite")).toBe(
      "https://over.garden/uk/@green_thumb",
    );
    expect(ukrainianProfile.headers.get("Content-Language")).toBe("uk");
    expect(bulgarianProfile.status).toBe(200);
    expect(bulgarianProfile.headers.get("Location")).toBeNull();
    expect(bulgarianProfile.headers.get("Content-Language")).toBe("bg");
    expect(encodedUkrainianProfile.status).toBe(200);
    expect(encodedUkrainianProfile.headers.get("x-middleware-rewrite")).toBe(
      "https://over.garden/uk/@green_thumb",
    );
    expect(encodedBulgarianProfile.status).toBe(200);
    expect(encodedBulgarianProfile.headers.get("Location")).toBeNull();
    expect(ukrainianProfileHead.status).toBe(200);
    expect(ukrainianProfileHead.headers.get("x-middleware-rewrite")).toBe(
      "https://over.garden/uk/@green_thumb",
    );
    expect(internalRewriteMarker).toBe("v1");
    expect(internalRewriteSignature).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(trustedInternalRewrite.status).toBe(200);
    expect(trustedInternalRewrite.headers.get("Location")).toBeNull();
    expect(
      trustedInternalRewrite.headers.get(
        "x-middleware-request-x-overgarden-internal-profile-rewrite",
      ),
    ).toBeNull();
    expect(
      trustedInternalRewrite.headers.get(
        "x-middleware-request-x-overgarden-internal-profile-rewrite-signature",
      ),
    ).toBeNull();
    expect(spoofedInternalRewriteHeader.status).toBe(308);
    expect(spoofedInternalRewriteHeader.headers.get("Location")).toBe(
      "https://over.garden/@green_thumb",
    );
    expect(nonAsciiForgedInternalRewriteHeader.status).toBe(308);
    expect(nonAsciiForgedInternalRewriteHeader.headers.get("Location")).toBe(
      "https://over.garden/@green_thumb",
    );
    expect(replayedOnDifferentPath.status).toBe(308);
    expect(replayedOnDifferentPath.headers.get("Location")).toBe(
      "https://over.garden/@other_thumb",
    );
    expect(replayedWithDifferentMethod.status).toBe(308);
    expect(replayedWithDifferentMethod.headers.get("Location")).toBe(
      "https://over.garden/@green_thumb",
    );
  });
});

function stubLocalWalkingSkeletonEnvironment() {
  vi.stubEnv("WALKING_SKELETON_ENABLED", "true");
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://overgarden:test@localhost:5432/overgarden",
  );
  vi.stubEnv("PUBLIC_SITE_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("R2_ENDPOINT", "http://localhost:9000");
  vi.stubEnv("R2_PUBLIC_BASE_URL", "http://localhost:9000/overgarden-public");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "development");
}

describe("unknown root segments", () => {
  const documentHeaders = { accept: "text/html", "sec-fetch-dest": "document" };

  it.each([
    "/__visual-fixtures",
    "/__nonexistent-xyz",
    "/xyz/journals",
    "/BG/journals",
    "/sw.js",
    "/manifest.webmanifest",
    "/icon-192.png",
    "/fonts/google-sans/google-sans-latin.woff2",
  ])("answers a real 404 lifecycle document for %s", async (path) => {
    const response = await responseFor(path, {
      ...documentHeaders,
      "x-vercel-ip-country": "BG",
    });
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Cache-Control")).toBe(APP_ROUTE_CACHE_CONTROL);
    expect(response.headers.get("Content-Language")).toBe("bg");
    expect(html).toContain('<html lang="bg"');
    expect(html).toContain(getPublicSurfaceCopy("bg").notFound.title);
    expect(html).toContain('href="/bg"');
  });

  it("leaves known roots, locale roots, and file-like paths to the App Router", async () => {
    for (const path of [
      "/feed",
      "/bg",
      "/bg/journals",
      "/sitemap.xml",
      "/sitemaps/entries-0.xml",
      "/robots.txt",
      "/apple-icon.png",
      "/licenses/GoogleSans-OFL.txt",
      "/api/interface/context",
    ]) {
      const response = await responseFor(path, documentHeaders);
      expect(response.status, path).not.toBe(404);
    }
  });
});

describe("a page written in fewer than three languages (ADR-0029)", () => {
  const documentHeaders = { accept: "text/html", "sec-fetch-dest": "document" };

  it("gives a reader the landing in a language it has, at the unprefixed address", async () => {
    const cases: Array<[string, "uk" | "bg" | "ru", string]> = [
      ["/markets/ukraine", "uk", "/uk/markets/ukraine"],
      ["/markets/ukraine", "bg", "/uk/markets/ukraine"],
      ["/markets/ukraine", "ru", "/uk/markets/ukraine"],
      ["/markets/bulgaria", "bg", "/bg/markets/bulgaria"],
      ["/markets/bulgaria", "ru", "/ru/markets/bulgaria"],
      ["/markets/bulgaria", "uk", "/bg/markets/bulgaria"],
    ];
    for (const [path, locale, target] of cases) {
      const response = await responseFor(path, {
        ...documentHeaders,
        cookie: interfaceCookies(
          locale === "uk" ? "ukraine" : "bulgaria",
          locale,
        ),
      });
      expect(response.status, `${path} ${locale}`).toBe(200);
      expect(
        new URL(response.headers.get("x-middleware-rewrite") ?? "").pathname,
        `${path} ${locale}`,
      ).toBe(target);
    }
  });

  it("answers one 308 for a prefixed spelling of a translation that does not exist", async () => {
    for (const [path, target] of [
      ["/bg/markets/ukraine", "/markets/ukraine"],
      ["/ru/markets/ukraine", "/markets/ukraine"],
    ] as const) {
      const response = await responseFor(path, documentHeaders);
      expect(response.status, path).toBe(308);
      expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
        target,
      );
    }
    // A translation that exists keeps its own address.
    for (const path of ["/bg/markets/bulgaria", "/ru/markets/bulgaria"]) {
      const response = await responseFor(path, documentHeaders);
      expect(response.status, path).toBe(200);
    }
  });
});

describe("the dark EPPO archive (ADR-0025 D3)", () => {
  const documentHeaders = { accept: "text/html", "sec-fetch-dest": "document" };

  it("answers a real 404 at every archive address while the flag is off", async () => {
    vi.stubEnv("STABLE_REGISTRY_PUBLIC_DISCOVERY", "");
    try {
      for (const path of [
        "/sources/eppo",
        "/bg/sources/eppo",
        "/ru/sources/eppo",
        "/sources/eppo?kind=plant",
        "/sources/eppo/SOLLC",
      ]) {
        const response = await responseFor(path, documentHeaders);
        expect(response.status, path).toBe(404);
        expect(response.headers.get("X-Robots-Tag"), path).toBe(
          "noindex, nofollow",
        );
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("lets the archive through once the environment opens it", async () => {
    vi.stubEnv("STABLE_REGISTRY_PUBLIC_DISCOVERY", "true");
    try {
      for (const path of ["/sources/eppo", "/bg/sources/eppo?kind=plant"]) {
        const response = await responseFor(path, documentHeaders);
        expect(response.status, path).not.toBe(404);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("organism addresses (ADR-0026 D8)", () => {
  const document = { accept: "text/html", "sec-fetch-dest": "document" };

  it("answers 308 to the canonical path for a historical or legacy address, keeping the locale prefix", async () => {
    mocks.resolvePublicCatalogAddress.mockResolvedValueOnce({
      status: "redirect",
      catalogItemId: "22222222-2222-4222-8222-222222222222",
      canonicalPath: "/species/solanum-lycopersicum/de-barao",
    });
    const legacy = await responseFor("/variety/de-barao-0000000101", document);

    mocks.resolvePublicCatalogAddress.mockResolvedValueOnce({
      status: "redirect",
      catalogItemId: "11111111-1111-4111-8111-111111111111",
      canonicalPath: "/species/solanum-lycopersicum",
    });
    const localized = await responseFor(
      "/bg/species/lycopersicon-esculentum",
      document,
    );

    expect(legacy.status).toBe(308);
    expect(legacy.headers.get("location")).toBe(
      "https://over.garden/species/solanum-lycopersicum/de-barao",
    );
    expect(mocks.resolvePublicCatalogAddress).toHaveBeenCalledWith({
      kind: "legacy",
      catalogKind: "plant_variety",
      slug: "de-barao-0000000101",
    });
    expect(localized.status).toBe(308);
    expect(localized.headers.get("location")).toBe(
      "https://over.garden/bg/species/solanum-lycopersicum",
    );
    expect(mocks.resolvePublicCatalogAddress).toHaveBeenCalledWith({
      kind: "species",
      speciesSlug: "lycopersicon-esculentum",
      formSlug: null,
    });
  });

  it("answers a real localized 404 for an unknown organism and passes canonical, RSC and failed lookups through", async () => {
    mocks.resolvePublicCatalogAddress.mockResolvedValueOnce({
      status: "not_found",
    });
    const missing = await responseFor("/bg/species/no-such-organism", document);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(missing.headers.get("Content-Language")).toBe("bg");
    const missingHtml = await missing.text();
    expect(missingHtml).toContain(getPublicSurfaceCopy("bg").organism.notFound);
    expect(missingHtml).toContain('href="/bg/catalog"');

    const canonical = await responseFor(
      "/species/solanum-lycopersicum",
      document,
    );
    expect(canonical.status).toBe(200);

    mocks.resolvePublicCatalogAddress.mockClear();
    const rsc = await responseFor("/species/solanum-lycopersicum", {
      accept: "text/x-component",
      rsc: "1",
    });
    expect(rsc.status).toBe(200);
    expect(mocks.resolvePublicCatalogAddress).not.toHaveBeenCalled();

    mocks.resolvePublicCatalogAddress.mockRejectedValueOnce(
      new Error("database away"),
    );
    const failed = await responseFor("/species/solanum-lycopersicum", document);
    expect(failed.status).toBe(200);
  });

  /**
   * Every address resolves to 200, 308 or 404 (ADR-0029 D3). What follows is
   * the list of shapes that answered `200` with a `noindex` body until now,
   * each of them a page to a crawler.
   */
  describe("nothing answers 200 with a noindex apology", () => {
    it("308s an upper-case address to its lower-case self", async () => {
      for (const [from, to] of [
        ["/bg/topics/PLANTS", "https://over.garden/bg/topics/plants"],
        ["/bg/@YEHOR", "https://over.garden/bg/@yehor"],
        [
          "/species/Solanum/De-Barao",
          "https://over.garden/species/solanum/de-barao",
        ],
        ["/variety/De-Barao", "https://over.garden/variety/de-barao"],
      ] as const) {
        const response = await responseFor(from, document);
        expect(response.status, from).toBe(308);
        expect(response.headers.get("Location"), from).toBe(to);
      }
    });

    it("keeps the query string across the case redirect", async () => {
      const response = await responseFor("/topics/PLANTS?from=feed", document);
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toBe(
        "https://over.garden/topics/plants?from=feed",
      );
    });

    it("404s a section root with no front door", async () => {
      // `/species` is no longer on this list: OVE-431 gave the catalog a front
      // door there, and it is the only inbound link 114 669 organism pages
      // have.
      for (const path of ["/variety", "/topics", "/journal", "/ru/topics"]) {
        const response = await responseFor(path, document);
        expect(response.status, path).toBe(404);
        expect(response.headers.get("X-Robots-Tag"), path).toBe(
          "noindex, nofollow",
        );
      }
    });

    it("404s an address no page under that prefix could serve", async () => {
      for (const path of [
        "/journal/a/b",
        "/bg/communities/a/b",
        "/@yehor/objects/a/b",
        "/@yehor/a/b/c",
        "/species/a/b/c",
      ]) {
        const response = await responseFor(path, document);
        expect(response.status, path).toBe(404);
      }
    });

    it("keeps the routes that live under an address", async () => {
      const response = await responseFor(
        "/communities/observation-and-care/discussions/11111111-1111-4111-8111-111111111111",
        document,
      );
      expect(response.status).toBe(200);
    });

    it("serves translated support documents", async () => {
      for (const path of ["/bg/support", "/ru/support"]) {
        const response = await responseFor(path, document);
        expect(response.status, path).toBe(200);
      }
    });

    it("404s a prefixed path the prefixed tree cannot serve", async () => {
      for (const path of ["/bg/erasure", "/ru/erasure"]) {
        const response = await responseFor(path, document);
        expect(response.status, path).toBe(404);
      }
    });

    /**
     * The move in `pnpm address:entries:move` renamed every published entry.
     * Without the history table behind this redirect, every URL anybody had
     * ever shared would answer 404 instead of 308 (ADR-0029 D8).
     */
    it("308s an address the entry used to have", async () => {
      mocks.getPublicJournalEntryLifecycleLookup.mockResolvedValueOnce({
        status: "not_found",
      });
      mocks.resolveJournalEntryAddress.mockResolvedValueOnce({
        handle: "yehor",
        entryNumber: 3,
      });
      const moved = await responseFor(
        "/journal/полив-без-календарноі-пастки-5364380c26",
        document,
      );
      expect(moved.status).toBe(308);
      // Straight to the number. The name this slug was moved to on 2026-09-12
      // is itself a 308 now, and landing there would make two hops of one.
      expect(moved.headers.get("Location")).toBe(
        "https://over.garden/@yehor/post/3",
      );
    });

    it("404s a topic that does not exist, and passes one that does", async () => {
      mocks.getPublicTopicLifecycleLookup.mockResolvedValueOnce({
        status: "not_found",
      });
      const missing = await responseFor("/bg/topics/no-such-topic", document);
      expect(missing.status).toBe(404);
      expect(missing.headers.get("Content-Language")).toBe("bg");
      expect(await missing.text()).toContain("Темата не е намерена");

      const found = await responseFor("/topics/plants", document);
      expect(found.status).toBe(200);
    });

    /**
     * A tag kept its Cyrillic until OVE-465 romanized it (ADR-0029 D4,
     * amendment of 2026-09-18). A topic page exists in every locale, so the
     * prefix the reader asked under is the prefix they are sent to — one hop,
     * not a fold to the unprefixed name and then a move.
     */
    it.each([
      [`/topics/${encodeURIComponent("помідори")}`, "/topics/pomidory"],
      [`/bg/topics/${encodeURIComponent("помідори")}`, "/bg/topics/pomidory"],
      [`/ru/topics/${encodeURIComponent("помідори")}`, "/ru/topics/pomidory"],
    ])(
      "308s a topic's Cyrillic name at %s to its Latin one",
      async (path, target) => {
        mocks.getPublicTopicLifecycleLookup.mockResolvedValueOnce({
          status: "not_found",
        });
        mocks.resolvePublicTopicAddress.mockResolvedValueOnce("pomidory");
        const response = await responseFor(path, document);
        expect(response.status).toBe(308);
        expect(response.headers.get("Location")).toBe(
          `https://over.garden${target}`,
        );
        expect(mocks.resolvePublicTopicAddress).toHaveBeenLastCalledWith(
          "помідори",
        );
      },
    );

    it("reads no history for a topic that is there", async () => {
      mocks.resolvePublicTopicAddress.mockClear();
      const found = await responseFor("/topics/plants", document);
      expect(found.status).toBe(200);
      expect(mocks.resolvePublicTopicAddress).not.toHaveBeenCalled();
    });

    it("404s a listing page past the end, and reads nothing for page one", async () => {
      mocks.isListingPageBeyondTheEnd.mockClear();
      const first = await responseFor("/bg/journals", document);
      expect(first.status).toBe(200);
      expect(mocks.isListingPageBeyondTheEnd).not.toHaveBeenCalled();

      const malformed = await responseFor("/bg/journals?page=abc", document);
      expect(malformed.status).toBe(200);
      expect(mocks.isListingPageBeyondTheEnd).not.toHaveBeenCalled();

      mocks.isListingPageBeyondTheEnd.mockResolvedValueOnce(true);
      const beyond = await responseFor("/bg/journals?page=999", document);
      expect(beyond.status).toBe(404);

      const inside = await responseFor("/bg/journals?page=2", document);
      expect(inside.status).toBe(200);
    });

    it("keeps a paginated view out of the index and its entries reachable", async () => {
      const second = await responseFor("/journals?page=2", document);
      expect(second.status).toBe(200);
      expect(second.headers.get("X-Robots-Tag")).toBe("noindex, follow");

      const first = await responseFor("/journals", document);
      expect(first.headers.get("X-Robots-Tag")).toBeNull();

      const notAListing = await responseFor("/feed?page=2", document);
      expect(notAListing.headers.get("X-Robots-Tag")).toBeNull();
    });

    it("lets a listing through when the bound cannot be read", async () => {
      mocks.isListingPageBeyondTheEnd.mockRejectedValueOnce(
        new Error("database away"),
      );
      const response = await responseFor("/journals?page=2", document);
      expect(response.status).toBe(200);
    });
  });
});

/**
 * The rewrite of an unprefixed `/@` address used to return before the
 * lifecycle blocks, so every entry and passport under `/@` was rewritten past
 * its own 404 and answered 200 with the not-found page inside — found on
 * production by asking for an entry that does not exist. The rewrite is the
 * last thing the proxy does now, and these pin what each block answers.
 */
describe("author-scoped addresses reach their lifecycle blocks", () => {
  const document = { accept: "text/html", "sec-fetch-dest": "document" };

  it("still rewrites an entry that exists into the [locale] tree", async () => {
    mocks.resolveJournalEntryAddress.mockClear();
    const response = await responseFor("/@yehor/post/12", document);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://over.garden/uk/@yehor/post/12",
    );
    // By the author and the number: that pair is the address (ADR-0029 D9),
    // and the number reaches the lookup as a number.
    expect(mocks.getPublicJournalEntryLifecycleLookup).toHaveBeenCalledWith({
      kind: "number",
      authorHandle: "yehor",
      entryNumber: 12,
    });
    expect(mocks.resolveJournalEntryAddress).not.toHaveBeenCalled();
  });

  it("404s a number its author has not reached", async () => {
    mocks.getPublicJournalEntryLifecycleLookup.mockResolvedValueOnce({
      status: "not_found",
    });
    const response = await responseFor("/@yehor/post/999", document);
    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(await response.text()).toContain("Запис не знайдено");
  });

  // A deleted entry keeps its number for ever — it is never handed to the
  // next publish — so for the retention window the address says "gone", and
  // after the purge it says "not found". It never opens somebody else's entry.
  it("410s an entry that was deleted, at the number it keeps", async () => {
    mocks.getPublicJournalEntryLifecycleLookup.mockResolvedValueOnce({
      status: "gone",
    });
    const response = await responseFor("/@yehor/post/5", document);
    expect(response.status).toBe(410);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(await response.text()).toContain("Запис видалено");
  });

  /**
   * Not second spellings of an address — nothing ever issued them — so they
   * are nothing, rather than a redirect to `/post/12`. Folding `012` into `12`
   * would give one entry two addresses.
   */
  it.each([
    "/@yehor/post/0",
    "/@yehor/post/012",
    "/@yehor/post/-1",
    "/@yehor/post/1a",
    "/@yehor/post/1.0",
    "/@yehor/post/9999999999",
    "/@yehor/post/%31",
    "/@yehor/post/12/x",
    "/@yehor/post",
  ])("answers a real 404 for %s without asking the database", async (path) => {
    mocks.getPublicJournalEntryLifecycleLookup.mockClear();
    mocks.resolveJournalEntryAddress.mockClear();
    const response = await responseFor(path, document);
    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(mocks.getPublicJournalEntryLifecycleLookup).not.toHaveBeenCalled();
    expect(mocks.resolveJournalEntryAddress).not.toHaveBeenCalled();
  });

  // Wrong case is a spelling of a real address, so it is a 308 (ADR-0029 D3).
  it("308s an upper-case spelling to the lower-case address", async () => {
    const response = await responseFor("/@YEHOR/POST/12", document);
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      "https://over.garden/@yehor/post/12",
    );
  });

  it("308s a locale-prefixed number to the one address the entry has", async () => {
    const response = await responseFor("/bg/@yehor/post/12", document);
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      "https://over.garden/@yehor/post/12",
    );
  });

  /**
   * The address an entry had between 2026-09-12 and 2026-09-18: its name,
   * under its author, in the gardener's own alphabet. A browser hands the
   * clipboard the percent-encoded form of it — this one is 181 characters —
   * which is why it is no longer the address.
   */
  it("308s an entry's name under its author to its number", async () => {
    const name = "кратък-и-отговорен-запис-след";
    const response = await responseFor(
      `/@yehor/${encodeURIComponent(name)}`,
      document,
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      "https://over.garden/@yehor/post/12",
    );
    // By the pair, not the slug alone: the name is per author since `0073`.
    expect(mocks.getPublicJournalEntryLifecycleLookup).toHaveBeenCalledWith({
      kind: "name",
      publicSlug: name,
      authorHandle: "yehor",
    });
  });

  /**
   * The chain the first draft would have shipped. The block that strips a
   * locale prefix from an author-scoped path ran first and returned, so
   * `/bg/@yehor/{slug}` answered 308 to `/@yehor/{slug}`, which answered 308
   * again. Each response was right; two of them for one address was not.
   */
  it.each([
    `/bg/@yehor/${encodeURIComponent("полив")}`,
    `/ru/@yehor/${encodeURIComponent("полив")}`,
    `/uk/@yehor/${encodeURIComponent("полив")}`,
    `/bg/journal/${encodeURIComponent("полив")}`,
    `/journal/${encodeURIComponent("полив")}`,
  ])("reaches the number from %s in one response", async (path) => {
    const response = await responseFor(path, document);
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      "https://over.garden/@yehor/post/12",
    );
  });

  it("308s a name the entry no longer has, from the history", async () => {
    mocks.getPublicJournalEntryLifecycleLookup.mockResolvedValueOnce({
      status: "not_found",
    });
    mocks.resolveJournalEntryAddress.mockResolvedValueOnce({
      handle: "yehor",
      entryNumber: 4,
    });
    const response = await responseFor("/@yehor/an-older-name", document);
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      "https://over.garden/@yehor/post/4",
    );
    expect(mocks.resolveJournalEntryAddress).toHaveBeenCalledWith(
      "an-older-name",
      undefined,
      "yehor",
    );
  });

  it("404s a name no entry of this author ever held", async () => {
    mocks.getPublicJournalEntryLifecycleLookup.mockResolvedValueOnce({
      status: "not_found",
    });
    const response = await responseFor(
      "/@yehor/definitely-not-an-entry",
      document,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(await response.text()).toContain("Запис не знайдено");
  });

  // The name is per author, so the same name under another gardener's handle
  // names a different entry or none. It used to be answered with a 308 to the
  // real author, which handed one gardener's entry a second address under
  // another's name for as long as the redirect was cached.
  it("404s a name asked for under a handle that is not its author's", async () => {
    mocks.getPublicJournalEntryLifecycleLookup.mockResolvedValueOnce({
      status: "active",
      publicSlug: "field-note",
      entryNumber: 12,
      addressHandle: "yehor",
    });
    const response = await responseFor("/@someone_else/field-note", document);
    expect(response.status).toBe(404);
    expect(mocks.resolveJournalEntryAddress).toHaveBeenCalledWith(
      "field-note",
      undefined,
      "someone_else",
    );
  });

  it("410s a deleted entry at the name it was shared under", async () => {
    mocks.getPublicJournalEntryLifecycleLookup.mockResolvedValueOnce({
      status: "gone",
    });
    mocks.resolveJournalEntryAddress.mockClear();
    const response = await responseFor("/@yehor/removed-entry", document);
    expect(response.status).toBe(410);
    expect(mocks.resolveJournalEntryAddress).not.toHaveBeenCalled();
  });

  it("still rewrites a passport that exists, after one bounded lookup", async () => {
    mocks.getPublicObjectPassportLifecycleBySlug.mockClear();
    mocks.resolvePlantObjectAddress.mockClear();
    const response = await responseFor(
      `/@yehor/objects/${encodeURIComponent("томат")}`,
      document,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      `https://over.garden/uk/@yehor/objects/${encodeURIComponent("томат")}`,
    );
    expect(mocks.getPublicObjectPassportLifecycleBySlug).toHaveBeenCalledWith(
      "yehor",
      "томат",
    );
    expect(mocks.resolvePlantObjectAddress).not.toHaveBeenCalled();
  });

  it("404s a passport that does not exist, reading the history first", async () => {
    mocks.getPublicObjectPassportLifecycleBySlug.mockResolvedValueOnce({
      status: "not_found",
    });
    mocks.resolvePlantObjectAddress.mockClear();
    const response = await responseFor(
      "/@yehor/objects/no-such-object",
      document,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(await response.text()).toContain("Паспорт не знайдено");
    expect(mocks.resolvePlantObjectAddress).toHaveBeenCalledWith(
      "yehor",
      "no-such-object",
    );
  });

  it("308s a passport address the object used to have", async () => {
    mocks.getPublicObjectPassportLifecycleBySlug.mockResolvedValueOnce({
      status: "not_found",
    });
    mocks.resolvePlantObjectAddress.mockResolvedValueOnce({
      handle: "yehor",
      slug: "tomat-na-balkoni",
    });
    const response = await responseFor(
      "/@yehor/objects/old-tomato?token=opaque&engagement=liked",
      document,
    );
    expect(response.status).toBe(308);
    // The query goes through the same route policy the rewrite applies, so
    // a token never rides a redirect and the destination sees only what its
    // own page would have accepted.
    expect(response.headers.get("Location")).toBe(
      "https://over.garden/@yehor/objects/tomat-na-balkoni",
    );
  });

  /**
   * A passport was named in the gardener's own alphabet until OVE-465. The
   * block that strips a locale prefix from an author-scoped path used to run
   * first and return, so `/bg/@yehor/objects/{name}` answered 308 to
   * `/@yehor/objects/{name}`, which answered 308 again to the Latin name. The
   * passport block resolves the prefix and the name together now.
   */
  it.each([
    `/@yehor/objects/${encodeURIComponent("чорний-принц")}`,
    `/bg/@yehor/objects/${encodeURIComponent("чорний-принц")}`,
    `/uk/@yehor/objects/${encodeURIComponent("чорний-принц")}`,
  ])(
    "reaches a passport's Latin name from %s in one response",
    async (path) => {
      mocks.getPublicObjectPassportLifecycleBySlug.mockResolvedValueOnce({
        status: "not_found",
      });
      mocks.resolvePlantObjectAddress.mockResolvedValueOnce({
        handle: "yehor",
        slug: "chornyi-prynts",
      });
      const response = await responseFor(path, document);
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toBe(
        "https://over.garden/@yehor/objects/chornyi-prynts",
      );
    },
  );

  it("308s a locale-prefixed passport that is there to its one address", async () => {
    const response = await responseFor("/bg/@yehor/objects/tomat", document);
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      "https://over.garden/@yehor/objects/tomat",
    );
  });

  it("410s a passport whose public entries are all gone", async () => {
    mocks.getPublicObjectPassportLifecycleBySlug.mockResolvedValueOnce({
      status: "gone",
      plantObjectId: "00000000-0000-4000-8000-000000000778",
    });
    const response = await responseFor("/@yehor/objects/removed", document);
    expect(response.status).toBe(410);
    expect(await response.text()).toContain("Паспорт видалено");
  });

  it("lets a passport through when the lookup itself fails", async () => {
    mocks.getPublicObjectPassportLifecycleBySlug.mockRejectedValueOnce(
      new Error("database away"),
    );
    const response = await responseFor("/@yehor/objects/anything", document);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).not.toBeNull();
  });

  it("does not look a profile up twice, and does not touch the entry lookups for it", async () => {
    mocks.getPublicProfileLifecycleLookup.mockClear();
    mocks.getPublicJournalEntryLifecycleLookup.mockClear();
    mocks.getPublicObjectPassportLifecycleBySlug.mockClear();
    const response = await responseFor("/@yehor", document);
    expect(response.status).toBe(200);
    expect(mocks.getPublicProfileLifecycleLookup).toHaveBeenCalledTimes(1);
    expect(mocks.getPublicJournalEntryLifecycleLookup).not.toHaveBeenCalled();
    expect(mocks.getPublicObjectPassportLifecycleBySlug).not.toHaveBeenCalled();
  });

  it("reads nothing for a client-side navigation to an entry", async () => {
    mocks.getPublicJournalEntryLifecycleLookup.mockClear();
    const rsc = await responseFor("/@yehor/field-note", {
      accept: "text/x-component",
      rsc: "1",
    });
    expect(rsc.status).toBe(200);
    expect(rsc.headers.get("x-middleware-rewrite")).not.toBeNull();
    expect(mocks.getPublicJournalEntryLifecycleLookup).not.toHaveBeenCalled();
  });
});

describe("register hubs (OVE-433)", () => {
  const document = { accept: "text/html", "sec-fetch-dest": "document" };

  it("passes a hub that exists through, in every route family", async () => {
    mocks.hasCatalogRegisterHub.mockClear();
    for (const path of [
      "/species/solanum-lycopersicum/register",
      "/bg/species/solanum-lycopersicum/register",
    ]) {
      const response = await responseFor(path, document);
      expect(response.status, path).toBe(200);
    }
    expect(mocks.hasCatalogRegisterHub).toHaveBeenCalledTimes(2);
    expect(mocks.hasCatalogRegisterHub).toHaveBeenCalledWith(
      "solanum-lycopersicum",
    );
  });

  it("404s a hub for a species with no registered forms, and for no species at all", async () => {
    mocks.hasCatalogRegisterHub.mockResolvedValueOnce(false);
    const bare = await responseFor(
      "/species/apis-mellifera/register",
      document,
    );
    expect(bare.status).toBe(404);
    expect(bare.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(await bare.text()).toContain("Організм не знайдено");

    mocks.hasCatalogRegisterHub.mockResolvedValueOnce(false);
    mocks.resolvePublicCatalogAddress.mockResolvedValueOnce({
      status: "not_found",
    });
    const missing = await responseFor(
      "/ru/species/no-such-species/register",
      document,
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Content-Language")).toBe("ru");
    expect(await missing.text()).toContain("Организм не найден");
  });

  it("308s a hub under a slug the species used to have, keeping the prefix", async () => {
    mocks.hasCatalogRegisterHub.mockResolvedValueOnce(false);
    mocks.resolvePublicCatalogAddress.mockResolvedValueOnce({
      status: "redirect",
      catalogItemId: "11111111-1111-4111-8111-111111111111",
      canonicalPath: "/species/solanum-lycopersicum",
    });
    mocks.hasCatalogRegisterHub.mockResolvedValueOnce(true);
    const response = await responseFor(
      "/bg/species/lycopersicon-esculentum/register",
      document,
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      "https://over.garden/bg/species/solanum-lycopersicum/register",
    );
  });

  it("404s rather than 308s when the species the slug moved to has no hub either", async () => {
    mocks.hasCatalogRegisterHub.mockResolvedValueOnce(false);
    mocks.resolvePublicCatalogAddress.mockResolvedValueOnce({
      status: "redirect",
      catalogItemId: "11111111-1111-4111-8111-111111111111",
      canonicalPath: "/species/solanum-lycopersicum",
    });
    mocks.hasCatalogRegisterHub.mockResolvedValueOnce(false);
    const response = await responseFor(
      "/species/lycopersicon-esculentum/register",
      document,
    );
    expect(response.status).toBe(404);
  });

  it("lets a hub through when the existence read fails", async () => {
    mocks.hasCatalogRegisterHub.mockRejectedValueOnce(
      new Error("database away"),
    );
    const response = await responseFor(
      "/species/solanum-lycopersicum/register",
      document,
    );
    expect(response.status).toBe(200);
  });
});
