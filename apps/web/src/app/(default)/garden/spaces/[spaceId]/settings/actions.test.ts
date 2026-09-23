import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
  updateOwnedSpace: vi.fn(),
  deleteEmptySpace: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublicCacheTags: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: vi.fn(() => null),
}));
vi.mock("@/server/space-page-repository", () => ({
  updateOwnedSpace: mocks.updateOwnedSpace,
  deleteEmptySpace: mocks.deleteEmptySpace,
}));
vi.mock("@/server/public-cache-revalidation", () => ({
  revalidatePublicCacheTags: mocks.revalidatePublicCacheTags,
}));

import { deleteSpaceAction, updateSpaceSettingsAction } from "./actions";

const SPACE_ID = "10000000-0000-4000-8000-000000000001";
const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "s",
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("space settings actions (OVE-490)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: SCOPE,
    });
  });

  it("renames a space, and expires the public pages that show its name", async () => {
    mocks.updateOwnedSpace.mockResolvedValue({
      status: "updated",
      space: { id: SPACE_ID, displayName: "Теплиця на півдні" },
      publicObjectIds: ["o-1"],
      publicEntryIds: ["e-1", "e-2"],
    });
    const result = await updateSpaceSettingsAction(
      undefined,
      form({
        spaceId: SPACE_ID,
        displayName: "  Теплиця   на півдні ",
        locationVisibility: "region",
        coarseRegionCode: "ua-32",
      }),
    );

    expect(mocks.updateOwnedSpace).toHaveBeenCalledWith(SCOPE, {
      spaceId: SPACE_ID,
      displayName: "Теплиця на півдні",
      locationVisibility: "region",
      coarseRegionCode: "UA-32",
    });
    expect(result).toMatchObject({
      status: "saved",
      displayName: "Теплиця на півдні",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/garden/spaces/${SPACE_ID}`,
    );
    expect(mocks.revalidatePublicCacheTags).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining("o-1")]),
      "expire",
    );
    expect(mocks.revalidatePublicCacheTags.mock.calls[0]?.[0]).toHaveLength(3);
  });

  it("refuses an empty name or a missing region before touching the database", async () => {
    const empty = await updateSpaceSettingsAction(
      undefined,
      form({
        spaceId: SPACE_ID,
        displayName: "   ",
        locationVisibility: "hidden",
      }),
    );
    expect(empty).toEqual({
      status: "invalid",
      errors: { name: "name_required" },
    });
    const region = await updateSpaceSettingsAction(
      undefined,
      form({
        spaceId: SPACE_ID,
        displayName: "Балкон",
        locationVisibility: "region",
        coarseRegionCode: "",
      }),
    );
    expect(region).toEqual({
      status: "invalid",
      errors: { region: "region_required" },
    });
    expect(mocks.updateOwnedSpace).not.toHaveBeenCalled();
  });

  it("says missing for a space that is not the reader's, and changes nothing", async () => {
    mocks.updateOwnedSpace.mockResolvedValue({ status: "missing" });
    expect(
      await updateSpaceSettingsAction(
        undefined,
        form({
          spaceId: SPACE_ID,
          displayName: "Чужий",
          locationVisibility: "hidden",
        }),
      ),
    ).toEqual({ status: "missing" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(
      await updateSpaceSettingsAction(
        undefined,
        form({ spaceId: "not-a-uuid", displayName: "x" }),
      ),
    ).toEqual({ status: "missing" });
  });

  it("returns a refused session to the form instead of acting", async () => {
    mocks.resolveMutationScope.mockResolvedValue({
      status: "rejected",
      code: "session_required",
    });
    expect(
      await updateSpaceSettingsAction(undefined, form({ spaceId: SPACE_ID })),
    ).toEqual({ mutationScope: "session_required" });
    expect(
      await deleteSpaceAction(undefined, form({ spaceId: SPACE_ID })),
    ).toEqual({ mutationScope: "session_required" });
    expect(mocks.deleteEmptySpace).not.toHaveBeenCalled();
  });

  it("deletes only what the repository agrees is empty, and says why not otherwise", async () => {
    mocks.deleteEmptySpace.mockResolvedValueOnce({
      status: "not_empty",
      blockers: { objectCount: 2, entryCount: 5 },
    });
    expect(
      await deleteSpaceAction(undefined, form({ spaceId: SPACE_ID })),
    ).toEqual({
      status: "not_empty",
      blockers: { objectCount: 2, entryCount: 5 },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();

    mocks.deleteEmptySpace.mockResolvedValueOnce({ status: "deleted" });
    expect(
      await deleteSpaceAction(undefined, form({ spaceId: SPACE_ID })),
    ).toEqual({ status: "deleted" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden");
  });
});
