import { describe, expect, it } from "vitest";

import {
  DELETE,
  GET,
  HEAD,
  OPTIONS,
  PATCH,
  POST,
  PUT,
} from "./route";

const UNKNOWN_API_HANDLERS = [
  ["POST", POST],
  ["PUT", PUT],
  ["PATCH", PATCH],
  ["DELETE", DELETE],
  ["OPTIONS", OPTIONS],
] as const;

describe("unknown API route", () => {
  it("returns a non-cacheable JSON 404 for unknown API reads", async () => {
    const response = await GET(
      new Request("https://over.garden/api/unknown/read"),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });

  it.each(UNKNOWN_API_HANDLERS)(
    "returns a non-cacheable 404 for an unknown %s request",
    async (method, handler) => {
      const response = await handler(
        new Request("https://over.garden/api/unknown/mutation", {
          method,
        }),
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({ error: "not_found" });
    },
  );

  it("returns a bodyless, non-cacheable 404 for unknown API HEAD requests", async () => {
    const response = await HEAD(
      new Request("https://over.garden/api/unknown/head", { method: "HEAD" }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("");
  });
});
