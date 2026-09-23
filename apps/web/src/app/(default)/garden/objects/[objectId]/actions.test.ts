import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
  createProvenanceEdge: vi.fn(),
  resolvePlantObjectCatalog: vi.fn(),
  updatePlantObjectLocation: vi.fn(),
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
vi.mock("@/server/journal-repository", () => ({
  deleteJournalEntry: vi.fn(),
  resolvePlantObjectCatalog: mocks.resolvePlantObjectCatalog,
  updatePlantObjectLocation: mocks.updatePlantObjectLocation,
}));
vi.mock("@/server/lineage-repository", async () => {
  // The real error class, so the action's `instanceof` is the one it meets.
  const { ProvenanceRelationError } = await vi.importActual<
    typeof import("@/server/lineage-repository")
  >("@/server/lineage-repository");
  return {
    ProvenanceRelationError,
    createProvenanceEdge: mocks.createProvenanceEdge,
    createLineageInvitation: vi.fn(),
  };
});
vi.mock("@/server/public-cache-revalidation", () => ({
  revalidatePublicCacheTags: mocks.revalidatePublicCacheTags,
}));

import { ProvenanceRelationError } from "@/server/lineage-repository";

import {
  createProvenanceEdgeAction,
  resolvePlantObjectCatalogAction,
  updatePlantObjectLocationAction,
} from "./actions";

const TOMATO = "10000000-0000-4000-8000-000000000001";
const OTHER_TOMATO = "10000000-0000-4000-8000-000000000002";
const BEES = "10000000-0000-4000-8000-000000000003";
const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "s",
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("owned object actions (OVE-491)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: SCOPE,
    });
  });

  it("records a source of the same kind and refreshes both objects' pages", async () => {
    mocks.createProvenanceEdge.mockResolvedValue({
      subjectObject: { id: TOMATO },
      sourceObject: { id: OTHER_TOMATO },
    });

    const result = await createProvenanceEdgeAction(
      undefined,
      form({
        objectId: TOMATO,
        sourceKind: "own_object",
        sourcePlantObjectId: OTHER_TOMATO,
        clientMutationId: "20000000-0000-4000-8000-000000000001",
      }),
    );

    expect(result).toEqual({ status: "recorded" });
    expect(mocks.createProvenanceEdge).toHaveBeenCalledWith(
      SCOPE,
      expect.objectContaining({
        subjectPlantObjectId: TOMATO,
        sourceKind: "own_object",
        sourcePlantObjectId: OTHER_TOMATO,
      }),
    );
    // The history, settings and provenance pages all read the object.
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/garden/objects/${TOMATO}`,
      "layout",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/garden/objects/${OTHER_TOMATO}`,
      "layout",
    );
  });

  it("answers a cross-kind source with a reason, and refreshes nothing", async () => {
    mocks.createProvenanceEdge.mockRejectedValue(
      new ProvenanceRelationError("cross_kind"),
    );

    const result = await createProvenanceEdgeAction(
      undefined,
      form({
        objectId: TOMATO,
        sourceKind: "own_object",
        sourcePlantObjectId: BEES,
        clientMutationId: "20000000-0000-4000-8000-000000000002",
      }),
    );

    expect(result).toEqual({ status: "refused", reason: "cross_kind" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("lets any other failure reach the error boundary", async () => {
    mocks.createProvenanceEdge.mockRejectedValue(new Error("database down"));

    await expect(
      createProvenanceEdgeAction(
        undefined,
        form({ objectId: TOMATO, sourceKind: "own_object" }),
      ),
    ).rejects.toThrow("database down");
  });

  it("changes nothing for a refused session", async () => {
    mocks.resolveMutationScope.mockResolvedValue({
      status: "rejected",
      code: "session_changed",
    });

    const result = await createProvenanceEdgeAction(
      undefined,
      form({ objectId: TOMATO, sourceKind: "own_object" }),
    );

    expect(result).toEqual({ mutationScope: "session_changed" });
    expect(mocks.createProvenanceEdge).not.toHaveBeenCalled();
  });

  it("refreshes every page of the object after a settings change", async () => {
    const saved = {
      plantObject: { id: TOMATO },
      publicEntryPaths: [],
      publicEntryIds: ["e-1"],
    };
    mocks.updatePlantObjectLocation.mockResolvedValue(saved);
    mocks.resolvePlantObjectCatalog.mockResolvedValue(saved);

    await updatePlantObjectLocationAction(
      undefined,
      form({ objectId: TOMATO, locationVisibility: "hidden" }),
    );
    await resolvePlantObjectCatalogAction(
      undefined,
      form({ objectId: TOMATO, catalogLabel: "Черрі" }),
    );

    expect(
      mocks.revalidatePath.mock.calls.filter(
        ([path, type]) =>
          path === `/garden/objects/${TOMATO}` && type === "layout",
      ),
    ).toHaveLength(2);
    expect(mocks.revalidatePublicCacheTags).toHaveBeenCalledTimes(2);
  });
});
