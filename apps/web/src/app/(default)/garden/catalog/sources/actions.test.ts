import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  resolveMutationScope: vi.fn(),
  ownerUserIdFromFormData: vi.fn(() => "owner-1"),
  assertAdminCapabilityForScope: vi.fn(),
  execute: vi.fn(),
  buildEnqueueCatalogSourceRefreshJobQuery: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: mocks.ownerUserIdFromFormData,
}));
vi.mock("@/server/admin-access", () => ({
  assertAdminCapabilityForScope: mocks.assertAdminCapabilityForScope,
}));
vi.mock("@/server/catalog-curation-repository", () => ({
  buildEnqueueCatalogSourceRefreshJobQuery:
    mocks.buildEnqueueCatalogSourceRefreshJobQuery,
}));

import { refreshCatalogSourceAction } from "./actions";

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("catalog source refresh action (ADR-0026 D10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: { userId: "owner-1" },
    });
    mocks.buildEnqueueCatalogSourceRefreshJobQuery.mockReturnValue({
      execute: mocks.execute,
    });
  });

  it("enqueues exactly one refresh for the named source", async () => {
    await refreshCatalogSourceAction(undefined, form({ sourceSlug: "eppo" }));

    expect(mocks.buildEnqueueCatalogSourceRefreshJobQuery).toHaveBeenCalledWith(
      {},
      "eppo",
    );
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden/catalog/sources");
  });

  it("refuses a slug that is not a source slug, before touching the queue", async () => {
    for (const sourceSlug of ["", "EPPO Global", "../etc", "eppo;drop"]) {
      await expect(
        refreshCatalogSourceAction(undefined, form({ sourceSlug })),
      ).resolves.toEqual({ error: "unknown_source" });
    }
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("refuses a rejected scope and a visitor who is not the owner", async () => {
    mocks.resolveMutationScope.mockResolvedValue({
      status: "rejected",
      code: "owner_mismatch",
    });
    await expect(
      refreshCatalogSourceAction(undefined, form({ sourceSlug: "eppo" })),
    ).resolves.toEqual({ mutationScope: "owner_mismatch" });

    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: { userId: "owner-1" },
    });
    mocks.assertAdminCapabilityForScope.mockRejectedValue(
      new Error("admin access denied"),
    );
    await expect(
      refreshCatalogSourceAction(undefined, form({ sourceSlug: "eppo" })),
    ).rejects.toThrow(/denied/u);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
