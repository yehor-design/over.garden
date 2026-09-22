import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), scope: vi.fn() }));
vi.mock("@/server/owned-destination-repository", async (original) => ({
  ...(await original<typeof import("@/server/owned-destination-repository")>()),
  listOwnedDestinations: mocks.list,
}));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.scope,
  ownerUserIdFromRequest: () => null,
  mutationScopeResponse: () => new Response(null, { status: 401 }),
}));
import { GET } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope.mockResolvedValue({
    status: "accepted",
    scope: { userId: "owner" },
  });
});
it("returns a bounded no-store service failure without leaking database errors", async () => {
  mocks.list.mockRejectedValue(new Error("secret database host"));
  const response = await GET(
    new Request("https://over.garden/api/garden/destinations?q=rose"),
  );
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.text()).not.toContain("secret database host");
});
it("rejects guest requests before reading any destination", async () => {
  mocks.scope.mockResolvedValue({ status: "rejected" });
  expect(
    (await GET(new Request("https://over.garden/api/garden/destinations")))
      .status,
  ).toBe(401);
  expect(mocks.list).not.toHaveBeenCalled();
});
it("refuses malformed cursors before querying and passes authenticated ownership", async () => {
  expect(
    (
      await GET(
        new Request("https://over.garden/api/garden/destinations?cursor=bad"),
      )
    ).status,
  ).toBe(400);
  expect(mocks.list).not.toHaveBeenCalled();
  mocks.list.mockResolvedValue({ items: [], recent: [], nextCursor: null });
  expect(
    (
      await GET(
        new Request("https://over.garden/api/garden/destinations?q=rose"),
      )
    ).status,
  ).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith(
    { userId: "owner" },
    { q: "rose", filter: "all", space: null, cursor: null },
  );
});
