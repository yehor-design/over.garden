import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const SPECIES_ID = "00000000-0000-4000-8000-000000000006";

const mocks = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
  listSpeciesForms: vi.fn(),
}));

vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromRequest: () => OWNER_ID,
  mutationScopeResponse: () =>
    Response.json({ code: "session_required" }, { status: 401 }),
}));
vi.mock("@/server/species-forms-repository", () => ({
  listSpeciesForms: mocks.listSpeciesForms,
}));

function request(query: string) {
  return new Request(`https://over.garden/api/garden/catalog/forms?${query}`);
}

describe("GET /api/garden/catalog/forms (OVE-524)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: { userId: OWNER_ID },
    });
    mocks.listSpeciesForms.mockResolvedValue([
      { id: "00000000-0000-4000-8000-000000000011", name: "Брама" },
    ]);
  });

  it("answers the species' list for the object's kind, never cached", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      request(`species=${SPECIES_ID.toUpperCase()}&kind=animal`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(await response.json()).toEqual({
      forms: [{ id: "00000000-0000-4000-8000-000000000011", name: "Брама" }],
    });
    expect(mocks.listSpeciesForms).toHaveBeenCalledWith({
      speciesId: SPECIES_ID,
      objectKind: "animal",
    });
  });

  it("refuses a malformed query and a signed-out reader without reading", async () => {
    const { GET } = await import("./route");
    expect((await GET(request("species=nope&kind=animal"))).status).toBe(400);
    expect((await GET(request(`species=${SPECIES_ID}&kind=rock`))).status).toBe(
      400,
    );
    mocks.resolveMutationScope.mockResolvedValueOnce({
      status: "rejected",
      code: "session_required",
    });
    expect(
      (await GET(request(`species=${SPECIES_ID}&kind=animal`))).status,
    ).toBe(401);
    expect(mocks.listSpeciesForms).not.toHaveBeenCalled();
  });
});
