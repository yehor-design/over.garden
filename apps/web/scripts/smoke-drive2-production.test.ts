import { describe, expect, it, vi } from "vitest";

import {
  runDrive2ProductionSmoke,
  type Drive2ProductionSmokeOptions,
} from "./smoke-drive2-production";

const COMMIT = "1".repeat(40);
const OBJECT_ID = "11111111-1111-4111-8111-111111111111";
const OBJECT_PATH = `/lineage/objects/${OBJECT_ID}`;
const JOURNAL_PATH = "/journal/closeout-public-journal";
const LOCALIZED_JOURNAL_PATH = `/bg/journal/${encodeURIComponent("избрана-корица")}`;
const PROFILE_PATH = "/bg/@closeout_profile";
const OPAQUE_SKELETON_BODY = "skeleton-response-body-must-not-be-recorded";

type FetchOverrides = {
  exposedSkeletonRequest?:
    | "GET /skeleton"
    | "GET /api/skeleton/journal"
    | "POST /api/skeleton/journal";
  fixtureExposed?: boolean;
  journalPath?: string;
  onSkeletonResponse?: (response: Response) => void;
};

function response(
  body: BodyInit | null,
  init: ResponseInit,
  url: string,
): Response {
  const value = new Response(body, init);
  Object.defineProperty(value, "url", { value: url });
  return value;
}

function html(marker = "") {
  return `<!doctype html><html lang="bg"><body><main><h1>Closeout</h1>${marker}</main></body></html>`;
}

function createFetch(overrides: FetchOverrides = {}) {
  const journalPath = overrides.journalPath ?? JOURNAL_PATH;
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
      "https://over.garden",
    );
    const method =
      init?.method ?? (input instanceof Request ? input.method : "GET");
    const requestKey = `${method} ${url.pathname}`;

    if (
      url.pathname === "/skeleton" ||
      url.pathname === "/api/skeleton/journal"
    ) {
      const skeletonResponse = response(
        OPAQUE_SKELETON_BODY,
        {
          status: requestKey === overrides.exposedSkeletonRequest ? 200 : 404,
        },
        url.toString(),
      );
      overrides.onSkeletonResponse?.(skeletonResponse);
      return skeletonResponse;
    }

    if (method === "POST" && url.pathname.startsWith("/api/engagement/")) {
      return response(
        null,
        {
          status: 303,
          headers: { location: "/auth/intent?intent=opaque-redacted" },
        },
        url.toString(),
      );
    }
    if (method === "POST" && url.pathname === "/api/garden/entries") {
      return response(
        JSON.stringify({
          authIntentUrl: "/auth/intent?intent=opaque-redacted",
        }),
        { status: 401, headers: { "content-type": "application/json" } },
        url.toString(),
      );
    }
    if (url.pathname === "/sitemap.xml") {
      return response(
        "<urlset><loc>https://over.garden/bg/knowledge</loc></urlset>",
        {
          status: 200,
          headers: { "content-type": "application/xml" },
        },
        url.toString(),
      );
    }
    if (
      url.pathname.startsWith("/__visual-fixtures") ||
      url.pathname.startsWith("/api/__visual-fixtures")
    ) {
      return response(
        "Not found",
        { status: overrides.fixtureExposed ? 200 : 404 },
        url.toString(),
      );
    }

    const headers = {
      "cache-control": "private, no-store, max-age=0",
      "content-language": "bg",
      "content-type": "text/html; charset=utf-8",
    };
    if (url.pathname === "/bg") {
      return response(
        html(
          `<a href="${OBJECT_PATH}">Object</a><a href="${journalPath}">Journal</a>`,
        ),
        { status: 200, headers },
        url.toString(),
      );
    }
    if (url.pathname === OBJECT_PATH) {
      return response(
        html('<section data-living-object-passport="overview"></section>'),
        { status: 200, headers },
        url.toString(),
      );
    }
    if (url.pathname === journalPath) {
      return response(
        html('<article data-public-journal-entry="true"></article>'),
        { status: 200, headers },
        url.toString(),
      );
    }
    if (url.pathname === PROFILE_PATH) {
      return response(
        html('<section data-public-profile="v2"></section>'),
        { status: 200, headers },
        url.toString(),
      );
    }
    return response(html(), { status: 200, headers }, url.toString());
  });
}

function options(
  fetchImpl: Drive2ProductionSmokeOptions["fetchImpl"],
): Drive2ProductionSmokeOptions {
  return {
    baseUrl: "https://over.garden",
    expectedCommitSha: COMMIT,
    deployedCommitSha: COMMIT,
    profilePath: PROFILE_PATH,
    fetchImpl,
  };
}

describe("OVE-186 canonical production smoke", () => {
  it("proves guest reads, mutation auth, and fixture isolation without logging paths", async () => {
    const skeletonResponses: Response[] = [];
    const fetchImpl = createFetch({
      onSkeletonResponse: (response) => skeletonResponses.push(response),
    });
    const report = await runDrive2ProductionSmoke(options(fetchImpl));

    expect(report).toEqual({
      issue: "OVE-186",
      evidenceClass: "canonical-production-smoke",
      commitMatch: true,
      guestRead: {
        directoryRoutes: 7,
        objectPassport: true,
        journalEntry: true,
        gardenerProfile: true,
        authRedirects: 0,
      },
      mutationAuth: {
        comment: "auth-intent",
        follow: "auth-intent",
        bookmark: "auth-intent",
        create: "auth-intent",
      },
      fixtureIsolation: {
        blockedRoutes: 3,
        sitemapClean: true,
        publicHtmlClean: true,
      },
      productionSkeletonBoundary: {
        issue: "OVE-191",
        pageGet: 404,
        apiGet: 404,
        apiPost: 404,
        responseBodiesRecorded: false,
      },
      indexingAndPrivacy: {
        privateNoStoreHtml: true,
        selectedLocaleFoundation: true,
        privateMarkersAbsent: true,
      },
    });
    expect(JSON.stringify(report)).not.toContain(OBJECT_ID);
    expect(JSON.stringify(report)).not.toContain("closeout_profile");
    expect(JSON.stringify(report)).not.toContain(OPAQUE_SKELETON_BODY);
    expect(
      fetchImpl.mock.calls
        .map(([input, init]) => {
          const url = new URL(
            input instanceof Request ? input.url : input.toString(),
            "https://over.garden",
          );
          const method =
            init?.method ?? (input instanceof Request ? input.method : "GET");
          return `${method} ${url.pathname}`;
        })
        .filter((requestKey) => requestKey.includes("skeleton")),
    ).toEqual([
      "GET /skeleton",
      "GET /api/skeleton/journal",
      "POST /api/skeleton/journal",
    ]);
    expect(skeletonResponses).toHaveLength(3);
    expect(skeletonResponses.every((response) => !response.bodyUsed)).toBe(
      true,
    );
  });

  it("fails when the deployed commit does not equal tested main", async () => {
    await expect(
      runDrive2ProductionSmoke({
        ...options(createFetch()),
        deployedCommitSha: "2".repeat(40),
      }),
    ).rejects.toThrow(/deployed commit does not match tested main/);
  });

  it("follows a percent-encoded localized public journal continuation", async () => {
    const report = await runDrive2ProductionSmoke(
      options(createFetch({ journalPath: LOCALIZED_JOURNAL_PATH })),
    );

    expect(report.guestRead.journalEntry).toBe(true);
  });

  it("fails closed when an encoded separator attempts to escape the journal slug", async () => {
    await expect(
      runDrive2ProductionSmoke(
        options(
          createFetch({
            journalPath: "/bg/journal/safe%2Fsegment",
          }),
        ),
      ),
    ).rejects.toThrow(/Production feed has no journal entry continuation/);
  });

  it("fails when Production exposes the fixture namespace", async () => {
    await expect(
      runDrive2ProductionSmoke(options(createFetch({ fixtureExposed: true }))),
    ).rejects.toThrow();
  });

  it.each([
    "GET /skeleton",
    "GET /api/skeleton/journal",
    "POST /api/skeleton/journal",
  ] as const)(
    "fails when Production exposes the OVE-191 boundary for %s",
    async (exposedSkeletonRequest) => {
      await expect(
        runDrive2ProductionSmoke(
          options(createFetch({ exposedSkeletonRequest })),
        ),
      ).rejects.toThrow(/OVE-191 production skeleton .* exact 404/);
    },
  );
});
