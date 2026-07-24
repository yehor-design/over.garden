import { describe, expect, it } from "vitest";

import {
  hasInterfaceMutationReferer,
  isSameOriginInterfaceRequest,
} from "./interface-request-guard";

describe("isSameOriginInterfaceRequest", () => {
  it("accepts exact same-origin localhost requests", () => {
    expect(
      isSameOriginInterfaceRequest(
        new Request("http://localhost:3000/api/interface/locale", {
          headers: {
            origin: "http://localhost:3000",
            "sec-fetch-site": "same-origin",
          },
        }),
      ),
    ).toBe(true);
  });

  it("equates loopback host aliases on local HTTP", () => {
    expect(
      isSameOriginInterfaceRequest(
        new Request("http://localhost:3000/api/interface/locale", {
          headers: {
            origin: "http://127.0.0.1:3000",
            "sec-fetch-site": "same-origin",
          },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginInterfaceRequest(
        new Request("http://127.0.0.1:3000/api/interface/locale", {
          headers: {
            origin: "http://localhost:3000",
            "sec-fetch-site": "same-origin",
          },
        }),
      ),
    ).toBe(true);
  });

  it("rejects cross-origin and missing-origin requests", () => {
    expect(
      isSameOriginInterfaceRequest(
        new Request("https://over.garden/api/interface/locale", {
          headers: {
            origin: "https://evil.example",
            "sec-fetch-site": "cross-site",
          },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginInterfaceRequest(
        new Request("https://over.garden/api/interface/locale", {
          headers: { "sec-fetch-site": "same-origin" },
        }),
      ),
    ).toBe(false);
  });
});

describe("hasInterfaceMutationReferer", () => {
  it("treats missing and blank referers as absent", () => {
    expect(hasInterfaceMutationReferer(new Headers())).toBe(false);
    expect(hasInterfaceMutationReferer(new Headers({ referer: "" }))).toBe(
      false,
    );
    expect(hasInterfaceMutationReferer(new Headers({ referer: "  " }))).toBe(
      false,
    );
  });

  it("detects a non-empty referer", () => {
    expect(
      hasInterfaceMutationReferer(
        new Headers({ referer: "https://over.garden/garden" }),
      ),
    ).toBe(true);
  });
});
