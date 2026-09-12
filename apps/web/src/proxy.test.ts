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
  getPublicJournalEntryLifecycleLookup: vi.fn().mockResolvedValue({
    status: "active",
    publicSlug: "smoke-slug",
    addressHandle: "yehor",
  }),
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
  ])("sends explicit no-store cache control for %s", async (path) => {
    expect((await responseFor(path)).headers.get("Cache-Control")).toBe(
      APP_ROUTE_CACHE_CONTROL,
    );
  });

  it.each([
    "/",
    "/privacy",
    "/@yehor/smoke-slug",
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
      publicSlug: "removed-entry",
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
    // address it has, under its author and with no locale prefix (ADR-0029
    // D9, D10).
    expect(active.status).toBe(308);
    expect(active.headers.get("Location")).toBe(
      "https://over.garden/@yehor/active-entry",
    );
    expect(rsc.status).toBe(200);
    expect(mocks.getPublicJournalEntryLifecycleLookup).toHaveBeenCalledWith(
      "private-entry",
    );
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
    expect(canonicalUkrainianGoneHtml).not.toContain(
      "data-interface-language-control",
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
      "https://over.garden/@yehor/smoke-slug",
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
    expect(setCookie).toContain(`${INTERFACE_MARKET_COOKIE_NAME}=bulgaria`);
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
    expect(
      gardenResponse.headers.get(
        `x-middleware-request-${INTERFACE_LOCALE_REQUEST_HEADER}`,
      ),
    ).toBe("bg");
    expect(
      gardenResponse.headers.get(
        `x-middleware-request-${INTERFACE_MARKET_REQUEST_HEADER}`,
      ),
    ).toBe("bulgaria");

    const uaGardenResponse = await responseFor("/garden", {
      cookie: interfaceCookies("bulgaria", "bg"),
      "x-vercel-ip-country": "UA",
    });
    expect(uaGardenResponse.headers.get("Content-Language")).toBe("uk");
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

  it("overwrites caller-supplied internal market and locale headers", async () => {
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
    expect(
      response.headers.get(
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
    expect(persistedUkrainian.headers.get("Content-Language")).toBe("bg");
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
    const ugcResponse = await responseFor("/@yehor/field-note", {
      cookie: interfaceCookies("bulgaria", "bg"),
    });
    const catalogResponse = await responseFor(
      "/objects?kind=plant&token=opaque",
      {
        cookie: interfaceCookies("bulgaria", "ru"),
      },
    );
    const topicResponse = await responseFor(
      "/topics/care-checks?authIntent=follow&token=opaque",
      { cookie: interfaceCookies("bulgaria", "bg") },
    );

    for (const [name, response, language] of [
      ["privacy", privacyResponse, "bg"],
      ["blog", blogResponse, "ru"],
      ["journal", ugcResponse, "bg"],
      ["objects", catalogResponse, "ru"],
      ["topic", topicResponse, "bg"],
    ] as const) {
      expect(response.status, name).toBe(200);
      expect(response.headers.get("Location"), name).toBeNull();
      expect(response.headers.get("Content-Language"), name).toBe(language);
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
    const localized = await responseFor("/bg/species/lycopersicon-esculentum", document);

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
    mocks.resolvePublicCatalogAddress.mockResolvedValueOnce({ status: "not_found" });
    const missing = await responseFor("/bg/species/no-such-organism", document);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(missing.headers.get("Content-Language")).toBe("bg");
    const missingHtml = await missing.text();
    expect(missingHtml).toContain(getPublicSurfaceCopy("bg").organism.notFound);
    expect(missingHtml).toContain('href="/bg/objects"');

    const canonical = await responseFor("/species/solanum-lycopersicum", document);
    expect(canonical.status).toBe(200);

    mocks.resolvePublicCatalogAddress.mockClear();
    const rsc = await responseFor("/species/solanum-lycopersicum", {
      accept: "text/x-component",
      rsc: "1",
    });
    expect(rsc.status).toBe(200);
    expect(mocks.resolvePublicCatalogAddress).not.toHaveBeenCalled();

    mocks.resolvePublicCatalogAddress.mockRejectedValueOnce(new Error("database away"));
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
        ["/species/Solanum/De-Barao", "https://over.garden/species/solanum/de-barao"],
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

    it("404s a prefixed path the prefixed tree cannot serve", async () => {
      for (const path of ["/bg/support", "/ru/erasure"]) {
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
        slug: "полив-без-календарної-пастки",
      });
      const moved = await responseFor(
        "/journal/полив-без-календарноі-пастки-5364380c26",
        document,
      );
      expect(moved.status).toBe(308);
      expect(moved.headers.get("Location")).toBe(
        `https://over.garden/@yehor/${encodeURIComponent("полив-без-календарної-пастки")}`,
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
