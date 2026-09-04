import { describe, expect, it } from "vitest";

import { INTERFACE_LOCALE_COOKIE_NAME } from "@/lib/interface-localization";
import { INTERFACE_MARKET_REQUEST_HEADER } from "@/lib/interface-market";
import { GET, POST } from "./route";

/**
 * The one surface that still needs this endpoint is the raw lifecycle document
 * — the 404 and the seven-day 410 tombstone — which is hand-written HTML with
 * no React and no client bundle. It therefore speaks the only language that
 * surface has: a form post answered with a redirect.
 *
 * The previous contract was JSON with a `204` and no body, shaped that way
 * because a 110-line inline script drove it through a two-phase commit. That
 * script is gone (OVE-379); the guards are not.
 */
function request(
  fields: Record<string, string> | string = { locale: "ru" },
  headers: HeadersInit = {},
  url = "https://over.garden/api/interface/locale",
) {
  return new Request(url, {
    method: "POST",
    headers: {
      origin: "https://over.garden",
      "sec-fetch-site": "same-origin",
      [INTERFACE_MARKET_REQUEST_HEADER]: "bulgaria",
      ...headers,
    },
    body:
      typeof fields === "string"
        ? fields
        : new URLSearchParams(fields).toString(),
    ...(typeof fields === "string"
      ? {}
      : {
          headers: {
            origin: "https://over.garden",
            "sec-fetch-site": "same-origin",
            "content-type": "application/x-www-form-urlencoded",
            [INTERFACE_MARKET_REQUEST_HEADER]: "bulgaria",
            ...headers,
          },
        }),
  });
}

describe("interface locale preference endpoint", () => {
  it.each(["bg", "ru"] as const)(
    "sets only the production-secure HttpOnly locale cookie for %s",
    async (locale) => {
      const response = await POST(request({ locale }));
      const cookie = response.headers.get("set-cookie");

      expect(response.status).toBe(303);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(cookie).toContain(`${INTERFACE_LOCALE_COOKIE_NAME}=${locale}`);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/SameSite=lax/i);
      expect(cookie).not.toContain("overgarden_interface_market");
    },
  );

  it("returns the reader to the home page rather than an echoed path", async () => {
    // A tombstone must not copy the identity of the thing that is gone, so it
    // sends no return path and the endpoint must not invent one.
    const response = await POST(request({ locale: "bg" }));
    expect(new URL(response.headers.get("Location")!).pathname).toBe("/");
  });

  it("keeps an off-origin return path off the redirect", async () => {
    for (const hostile of [
      "https://attacker.example/steal",
      "//attacker.example/steal",
      "/\\attacker.example/steal",
    ]) {
      const response = await POST(
        request({ locale: "bg", returnTo: hostile }),
      );
      const location = new URL(response.headers.get("Location")!);
      expect(location.origin).toBe("https://over.garden");
      expect(location.href).not.toContain("attacker");
    }
  });

  it("allows the bounded cookie to persist on the local HTTP development origin", async () => {
    const response = await POST(
      request(
        { locale: "bg" },
        { origin: "http://localhost:3000" },
        "http://localhost:3000/api/interface/locale",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).not.toMatch(/Secure/i);
  });

  it("requires a proxy-confirmed Bulgaria market", async () => {
    const response = await POST(
      request({ locale: "bg" }, { [INTERFACE_MARKET_REQUEST_HEADER]: "ukraine" }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects every query-bearing mutation without setting a locale cookie", async () => {
    const response = await POST(
      request(
        { locale: "bg" },
        {},
        "https://over.garden/api/interface/locale?next=/garden",
      ),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a foreign origin, a referred mutation, and an unknown locale", async () => {
    const foreign = await POST(
      request(
        { locale: "bg" },
        { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
      ),
    );
    expect(foreign.status).toBe(403);

    const referred = await POST(
      request({ locale: "bg" }, { referer: "https://over.garden/garden" }),
    );
    expect(referred.status).toBe(403);

    const unknown = await POST(request({ locale: "de" }));
    expect(unknown.status).toBe(400);

    for (const response of [foreign, referred, unknown]) {
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("keeps GET non-mutating and explicitly unsupported", () => {
    const response = GET();

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
