import { describe, expect, it } from "vitest";

import { INTERFACE_LOCALE_COOKIE_NAME } from "@/lib/interface-localization";
import { INTERFACE_MARKET_REQUEST_HEADER } from "@/lib/interface-market";
import { GET, POST } from "./route";

function request(
  body: unknown = { locale: "ru" },
  headers: HeadersInit = {},
  url = "https://over.garden/api/interface/locale",
) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://over.garden",
      "sec-fetch-site": "same-origin",
      [INTERFACE_MARKET_REQUEST_HEADER]: "bulgaria",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("interface locale preference endpoint", () => {
  it.each(["bg", "ru"] as const)(
    "sets only the production-secure HttpOnly locale cookie for %s",
    async (locale) => {
      const response = await POST(request({ locale }));
      const cookie = response.headers.get("set-cookie");

      expect(response.status).toBe(204);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(response.headers.get("Location")).toBeNull();
      expect(cookie).toContain(`${INTERFACE_LOCALE_COOKIE_NAME}=${locale}`);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/SameSite=lax/i);
      expect(cookie).not.toContain("overgarden_interface_market");
    },
  );

  it("allows the bounded cookie to persist on the local HTTP development origin", async () => {
    const response = await POST(
      request(
        { locale: "bg" },
        { origin: "http://localhost:3000" },
        "http://localhost:3000/api/interface/locale",
      ),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).not.toMatch(/; Secure/i);
  });

  it.each([
    [{ locale: "uk" }],
    [{ locale: "en" }],
    [{ locale: "bg", token: "opaque" }],
    [null],
    [[]],
  ])("rejects an invalid or over-broad payload", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
  });

  it("cancels a chunked body as soon as it crosses the byte limit", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"locale":"ru","padding":"'));
        controller.enqueue(encoder.encode("x".repeat(80)));
        controller.close();
      },
    });
    const oversized = new Request("https://over.garden/api/interface/locale", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://over.garden",
        "sec-fetch-site": "same-origin",
        [INTERFACE_MARKET_REQUEST_HEADER]: "bulgaria",
      },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    expect((await POST(oversized)).status).toBe(413);
  });

  it("requires a proxy-confirmed Bulgaria market", async () => {
    const ua = await POST(
      request(
        { locale: "bg" },
        { [INTERFACE_MARKET_REQUEST_HEADER]: "ukraine" },
      ),
    );
    const missing = await POST(
      request({ locale: "bg" }, { [INTERFACE_MARKET_REQUEST_HEADER]: "" }),
    );

    expect(ua.status).toBe(403);
    expect(missing.status).toBe(403);
  });

  it("rejects every query-bearing mutation without setting a locale cookie", async () => {
    const response = await POST(
      request(
        { locale: "ru" },
        {},
        "https://over.garden/api/interface/locale?returnTo=%2Fadmin&token=opaque",
      ),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("rejects foreign, missing-origin, referred, and non-JSON requests", async () => {
    expect(
      (await POST(request(undefined, { origin: "https://evil.example" })))
        .status,
    ).toBe(403);
    expect((await POST(request(undefined, { origin: "" }))).status).toBe(403);
    expect(
      (
        await POST(
          request(undefined, { referer: "https://over.garden/settings" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await POST(request(undefined, { "content-type": "text/plain" }))).status,
    ).toBe(415);
  });

  it.each([
    ["rsc", "1"],
    ["next-router-state-tree", "opaque"],
    ["next-action", "action-id"],
    ["next-router-prefetch", "1"],
    ["purpose", "prefetch"],
  ])("rejects %s subrequests", async (header, value) => {
    expect((await POST(request(undefined, { [header]: value }))).status).toBe(
      400,
    );
  });

  it("keeps GET non-mutating and explicitly unsupported", () => {
    const response = GET();

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
});
