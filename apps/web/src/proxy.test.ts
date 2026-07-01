import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { APP_ROUTE_CACHE_CONTROL, config, proxy } from "./proxy";

function responseFor(path: string) {
  return proxy(new NextRequest(new URL(path, "https://over.garden")));
}

describe("app route cache guardrail", () => {
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
  ])("sends explicit no-store cache control for %s", (path) => {
    expect(responseFor(path).headers.get("Cache-Control")).toBe(
      APP_ROUTE_CACHE_CONTROL,
    );
  });

  it("keeps static assets, service worker, manifest, and image files out of the proxy matcher", () => {
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
});
