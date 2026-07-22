import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocalization: vi.fn(),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocalization: mocks.getRequestInterfaceLocalization,
}));

import { GET } from "./route";

describe("interface context endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocalization.mockResolvedValue({
      market: "bulgaria",
      locale: "ru",
      marketSource: "explicit",
      localeSource: "explicit",
    });
  });

  it("returns only bounded resolved market and locale context", async () => {
    const response = await GET(
      new Request("https://over.garden/api/interface/context"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toEqual({ market: "bulgaria", locale: "ru" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects query state and framework subrequests", async () => {
    const withQuery = await GET(
      new Request("https://over.garden/api/interface/context?token=opaque"),
    );
    const prefetch = await GET(
      new Request("https://over.garden/api/interface/context", {
        headers: { purpose: "prefetch" },
      }),
    );
    const rsc = await GET(
      new Request("https://over.garden/api/interface/context", {
        headers: { rsc: "1" },
      }),
    );

    expect(withQuery.status).toBe(400);
    expect(prefetch.status).toBe(400);
    expect(rsc.status).toBe(400);
    expect(mocks.getRequestInterfaceLocalization).not.toHaveBeenCalled();
  });
});
