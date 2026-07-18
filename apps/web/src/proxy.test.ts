import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  INTERFACE_LOCALE_COOKIE_NAME,
  INTERFACE_LOCALE_REQUEST_HEADER,
} from "@/lib/interface-localization";
import { APP_ROUTE_CACHE_CONTROL, config, proxy } from "./proxy";

const mocks = vi.hoisted(() => ({
  getPublicObjectPassportLookup: vi.fn().mockResolvedValue({
    status: "not_found",
  }),
  getPublicJournalEntryLifecycleLookup: vi.fn().mockResolvedValue({
    status: "active",
  }),
  getPublicProfileLifecycleLookup: vi.fn().mockResolvedValue({
    status: "active",
  }),
  getPublicCommunityLifecycleLookup: vi.fn().mockResolvedValue({
    status: "found",
  }),
  getSession: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("@/server/public-object-passport-repository", () => ({
  getPublicObjectPassportLookup: mocks.getPublicObjectPassportLookup,
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

describe("app route cache guardrail", () => {
  it("hard-404s the visual fixture route before App Router unless the full environment gate passes", async () => {
    vi.stubEnv("VISUAL_FIXTURES_ENABLED", "false");
    const disabled = await responseFor("/__visual-fixtures");
    const disabledNested = await responseFor(
      "/__visual-fixtures/intent/ove174-i001",
    );
    const disabledApi = await responseFor(
      "/api/__visual-fixtures/journal-creation",
      undefined,
      { method: "POST" },
    );

    vi.stubEnv("VISUAL_FIXTURES_ENABLED", "true");
    vi.stubEnv("VISUAL_FIXTURES_TARGET", "local");
    vi.stubEnv("VISUAL_FIXTURES_DATABASE", "overgarden");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://overgarden:test@localhost:5432/overgarden",
    );
    vi.stubEnv("PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("R2_ENDPOINT", "http://localhost:9000");
    vi.stubEnv("R2_PUBLIC_BASE_URL", "http://localhost:9000/overgarden-public");
    vi.stubEnv("VERCEL_ENV", "development");
    const enabledLocal = await responseFor("/__visual-fixtures");

    vi.stubEnv("VERCEL_ENV", "production");
    const production = await responseFor("/__visual-fixtures");
    vi.unstubAllEnvs();

    expect(disabled.status).toBe(404);
    expect(disabledNested.status).toBe(404);
    expect(disabledApi.status).toBe(404);
    expect(disabled.headers.get("Cache-Control")).toBe(APP_ROUTE_CACHE_CONTROL);
    expect(enabledLocal.status).toBe(200);
    expect(production.status).toBe(404);
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

  it.each([
    "/",
    "/garden",
    "/garden/catalog/curation",
    "/garden/pilot-health",
    "/join",
    "/privacy",
    "/health",
    "/journal/smoke-slug",
    "/variety/smoke-variety",
    "/api/garden/entries",
  ])("sends explicit no-store cache control for %s", async (path) => {
    expect((await responseFor(path)).headers.get("Cache-Control")).toBe(
      APP_ROUTE_CACHE_CONTROL,
    );
  });

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
    const privateEntry = await responseFor("/bg/journal/private-entry", {
      accept: "text/html",
      "sec-fetch-dest": "document",
    });

    mocks.getPublicJournalEntryLifecycleLookup.mockResolvedValueOnce({
      status: "active",
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
    expect(await privateEntry.text()).toContain("Записът не е намерен");
    expect(active.status).toBe(200);
    expect(rsc.status).toBe(200);
    expect(mocks.getPublicJournalEntryLifecycleLookup).toHaveBeenCalledWith(
      "private-entry",
    );
  });

  it("returns a generic localized 410 for retired profile handles without redirecting to the current identity", async () => {
    mocks.getPublicProfileLifecycleLookup.mockResolvedValueOnce({
      status: "gone",
    });
    const gone = await responseFor("/@former_garden", {
      accept: "text/html",
      "accept-language": "bg-BG,bg;q=0.9",
      "sec-fetch-dest": "document",
    });

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
    expect(goneHtml).not.toContain("former_garden");
    expect(goneHtml).not.toContain("current_garden");
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

    const response = await responseFor("/@blocked_garden", {
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
    const unavailable = await responseFor("/bg/communities/missing-community", {
      accept: "text/html",
      "sec-fetch-dest": "document",
    });

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
    expect(await unavailable.text()).toContain("Общността не е намерена");
    expect(active.status).toBe(200);
    expect(rsc.status).toBe(200);
    expect(mocks.getPublicCommunityLifecycleLookup).toHaveBeenCalledWith(
      "missing-community",
    );
  });

  it("keeps static assets, service worker, manifest, and image files out of the proxy matcher", async () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    expect(matcher.test("/")).toBe(true);
    expect(matcher.test("/privacy")).toBe(true);
    expect(matcher.test("/api/garden/entries")).toBe(true);
    expect(matcher.test("/_next/static/chunks/app.js")).toBe(false);
    expect(matcher.test("/_next/image")).toBe(false);
    expect(matcher.test("/favicon.ico")).toBe(false);
    expect(matcher.test("/sw.js")).toBe(false);
    expect(matcher.test("/manifest.webmanifest")).toBe(false);
    expect(matcher.test("/photos/derivative.webp")).toBe(false);
  });

  it("redirects legacy Ukrainian-prefixed public URLs to unprefixed canonicals", async () => {
    const rootResponse = await responseFor("/uk");
    const nestedResponse = await responseFor(
      "/uk/blog/first-public-garden-log",
    );

    expect(rootResponse.status).toBe(308);
    expect(rootResponse.headers.get("Location")).toBe("https://over.garden/");
    expect(nestedResponse.status).toBe(308);
    expect(nestedResponse.headers.get("Location")).toBe(
      "https://over.garden/blog/first-public-garden-log",
    );
    expect(rootResponse.headers.get("Cache-Control")).toBe(
      APP_ROUTE_CACHE_CONTROL,
    );
    expect(rootResponse.headers.get("Content-Language")).toBe("uk");
    expect(rootResponse.headers.get("set-cookie")).toContain(
      `${INTERFACE_LOCALE_COOKIE_NAME}=uk`,
    );
  });

  it("redirects Bulgarian country traffic from the root to /bg", async () => {
    const bgResponse = await responseFor("/", {
      "x-vercel-ip-country": "BG",
    });
    const uaResponse = await responseFor("/", {
      "x-vercel-ip-country": "UA",
    });

    expect(bgResponse.status).toBe(307);
    expect(bgResponse.headers.get("Location")).toBe("https://over.garden/bg");
    expect(bgResponse.headers.get("Cache-Control")).toBe(
      APP_ROUTE_CACHE_CONTROL,
    );
    expect(uaResponse.status).toBe(200);
  });

  it("persists a localized public route and forwards it into signed-in routes", async () => {
    const publicResponse = await responseFor("/bg");
    const setCookie = publicResponse.headers.get("set-cookie");

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get("Content-Language")).toBe("bg");
    expect(setCookie).toContain(`${INTERFACE_LOCALE_COOKIE_NAME}=bg`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).not.toMatch(/journal|invite|email|location|token/i);

    const gardenResponse = await responseFor("/garden", {
      cookie: String(setCookie).split(";", 1)[0],
      "accept-language": "uk;q=1",
      "x-vercel-ip-country": "UA",
    });

    expect(gardenResponse.status).toBe(200);
    expect(gardenResponse.headers.get("Content-Language")).toBe("bg");
    expect(
      gardenResponse.headers.get(
        `x-middleware-request-${INTERFACE_LOCALE_REQUEST_HEADER}`,
      ),
    ).toBe("bg");
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
        cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=bg`,
        accept: "text/html",
      },
      { method: "POST" },
    );
    const apiRequest = await responseFor("/api/garden/entries", {
      "x-vercel-ip-country": "BG",
    });
    const rscRequest = await responseFor("/privacy", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=bg`,
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

    for (const response of [mutation, apiRequest, rscRequest, serverAction]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("Location")).toBeNull();
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(rscRequest.headers.get("Content-Language")).toBe("bg");
    expect(serverAction.headers.get("Content-Language")).toBe("ru");
  });

  it("honors a valid preference at the root and ignores invalid cookie values", async () => {
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

    expect(persistedRussian.status).toBe(307);
    expect(persistedRussian.headers.get("Location")).toBe(
      "https://over.garden/ru",
    );
    expect(persistedUkrainian.status).toBe(200);
    expect(persistedUkrainian.headers.get("Content-Language")).toBe("uk");
    expect(invalidPreference.status).toBe(307);
    expect(invalidPreference.headers.get("Location")).toBe(
      "https://over.garden/ru",
    );
  });

  it("keeps already-localized unprefixed public routes in the persisted locale", async () => {
    const privacyResponse = await responseFor("/privacy", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=bg`,
    });
    const blogResponse = await responseFor("/blog/field-note", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=ru`,
    });
    const ugcResponse = await responseFor("/journal/field-note", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=bg`,
    });
    const catalogResponse = await responseFor("/objects", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=ru`,
    });

    expect(privacyResponse.status).toBe(307);
    expect(privacyResponse.headers.get("Location")).toBe(
      "https://over.garden/bg/privacy",
    );
    expect(blogResponse.status).toBe(307);
    expect(blogResponse.headers.get("Location")).toBe(
      "https://over.garden/ru/blog/field-note",
    );
    expect(ugcResponse.status).toBe(307);
    expect(ugcResponse.headers.get("Location")).toBe(
      "https://over.garden/bg/journal/field-note",
    );
    expect(catalogResponse.status).toBe(307);
    expect(catalogResponse.headers.get("Location")).toBe(
      "https://over.garden/ru/objects",
    );
  });

  it("canonicalizes a supported but non-canonical cookie value", async () => {
    const response = await responseFor("/garden", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=BG`,
    });

    expect(response.headers.get("Content-Language")).toBe("bg");
    expect(response.headers.get("set-cookie")).toContain(
      `${INTERFACE_LOCALE_COOKIE_NAME}=bg`,
    );
  });

  it("serves canonical unprefixed Ukrainian profiles and redirects other preferences", async () => {
    const ukrainianProfile = await responseFor("/@green_thumb", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=uk`,
    });
    const bulgarianProfile = await responseFor("/@green_thumb", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=bg`,
    });
    const encodedUkrainianProfile = await responseFor("/%40green_thumb", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=uk`,
    });
    const encodedBulgarianProfile = await responseFor("/%40green_thumb", {
      cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=bg`,
    });
    const ukrainianProfileHead = await responseFor(
      "/@green_thumb",
      { cookie: `${INTERFACE_LOCALE_COOKIE_NAME}=uk` },
      { method: "HEAD" },
    );
    const internalUkrainianRewrite = await responseFor("/uk/@green_thumb", {
      "x-overgarden-internal-profile-rewrite": "1",
    });

    expect(ukrainianProfile.status).toBe(200);
    expect(ukrainianProfile.headers.get("x-middleware-rewrite")).toBe(
      "https://over.garden/uk/@green_thumb",
    );
    expect(ukrainianProfile.headers.get("Content-Language")).toBe("uk");
    expect(bulgarianProfile.status).toBe(307);
    expect(bulgarianProfile.headers.get("Location")).toBe(
      "https://over.garden/bg/@green_thumb",
    );
    expect(encodedUkrainianProfile.status).toBe(200);
    expect(encodedUkrainianProfile.headers.get("x-middleware-rewrite")).toBe(
      "https://over.garden/uk/@green_thumb",
    );
    expect(encodedBulgarianProfile.status).toBe(307);
    expect(encodedBulgarianProfile.headers.get("Location")).toBe(
      "https://over.garden/bg/@green_thumb",
    );
    expect(ukrainianProfileHead.status).toBe(200);
    expect(ukrainianProfileHead.headers.get("x-middleware-rewrite")).toBe(
      "https://over.garden/uk/@green_thumb",
    );
    expect(internalUkrainianRewrite.status).toBe(200);
    expect(internalUkrainianRewrite.headers.get("Location")).toBeNull();
  });
});

function stubLocalWalkingSkeletonEnvironment() {
  vi.stubEnv("WALKING_SKELETON_ENABLED", "true");
  vi.stubEnv("VISUAL_FIXTURES_ENABLED", "true");
  vi.stubEnv("VISUAL_FIXTURES_TARGET", "local");
  vi.stubEnv("VISUAL_FIXTURES_DATABASE", "overgarden");
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
