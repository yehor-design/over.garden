import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  PilotWriteAccessError: class PilotWriteAccessError extends Error {},
  revalidatePath: vi.fn(),
  requireWriteEligibleRequestScope: vi.fn(),
  authIntentRequiredResponse: vi.fn(),
  resolvePlantObjectCatalog: vi.fn(),
  readPlantIdentificationReceipt: vi.fn(),
  readPlantIdentificationTarget: vi.fn(),
  recordPlantIdentificationDecision: vi.fn(),
  recordPlantIdentificationDecisionInTransaction: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth-session", () => ({
  AuthenticationRequiredError: mocks.AuthenticationRequiredError,
}));
vi.mock("@/server/auth-intent-http", () => ({
  authIntentRequiredResponse: mocks.authIntentRequiredResponse,
}));
vi.mock("@/server/pilot-write-access", () => ({
  PilotWriteAccessError: mocks.PilotWriteAccessError,
  requireWriteEligibleRequestScope: mocks.requireWriteEligibleRequestScope,
}));
vi.mock("@/server/journal-repository", () => ({
  resolvePlantObjectCatalog: mocks.resolvePlantObjectCatalog,
}));
vi.mock("@/server/plant-identification-repository", () => ({
  readPlantIdentificationReceipt: mocks.readPlantIdentificationReceipt,
  readPlantIdentificationTarget: mocks.readPlantIdentificationTarget,
  recordPlantIdentificationDecision: mocks.recordPlantIdentificationDecision,
  recordPlantIdentificationDecisionInTransaction:
    mocks.recordPlantIdentificationDecisionInTransaction,
}));

const ownerId = "00000000-0000-4000-8000-000000000001";
const objectId = "00000000-0000-4000-8000-000000000101";
const requestId = "00000000-0000-4000-8000-000000000301";
const catalogItemId = "00000000-0000-4000-8000-000000000501";

describe("POST /api/garden/plant-identification/decision", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireWriteEligibleRequestScope.mockResolvedValue({
      userId: ownerId,
      sessionId: "session-1",
    });
    mocks.readPlantIdentificationTarget.mockResolvedValue(objectId);
    mocks.readPlantIdentificationReceipt.mockResolvedValue({
      id: requestId,
      canConfirm: true,
      candidates: [
        {
          rank: 1,
          catalogItemId,
          scientificName: "Malus domestica",
        },
      ],
    });
  });

  it("resolves only the receipt's exact mapped candidate and records the decision in its transaction", async () => {
    const transaction = { marker: "transaction" };
    mocks.resolvePlantObjectCatalog.mockImplementation(
      async (_scope, _input, options) => {
        await options.afterResolve({
          transaction,
          plantObjectId: objectId,
          catalogItemId,
        });
      },
    );
    const { POST } = await import("./route");
    const response = await POST(
      decisionRequest({
        requestId,
        decision: "confirmed",
        rank: 1,
        catalogItemId,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.resolvePlantObjectCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ownerId }),
      { plantObjectId: objectId, catalogItemId },
      expect.objectContaining({ afterResolve: expect.any(Function) }),
    );
    expect(
      mocks.recordPlantIdentificationDecisionInTransaction,
    ).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ userId: ownerId }),
      {
        requestId,
        decision: "confirmed",
        selectedCandidateRank: 1,
        selectedCatalogItemId: catalogItemId,
      },
    );
  });

  it("does not resolve an unverified candidate", async () => {
    mocks.readPlantIdentificationReceipt.mockResolvedValue({
      id: requestId,
      canConfirm: true,
      candidates: [],
    });
    const { POST } = await import("./route");
    const response = await POST(
      decisionRequest({
        requestId,
        decision: "confirmed",
        rank: 1,
        catalogItemId,
      }),
    );

    expect(response.status).toBe(422);
    expect(mocks.resolvePlantObjectCatalog).not.toHaveBeenCalled();
    expect(
      mocks.recordPlantIdentificationDecisionInTransaction,
    ).not.toHaveBeenCalled();
  });

  it("keeps the manual fallback independent of a catalog mutation", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      decisionRequest({
        requestId,
        decision: "manual",
        rank: null,
        catalogItemId: null,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.resolvePlantObjectCatalog).not.toHaveBeenCalled();
    expect(mocks.recordPlantIdentificationDecision).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ownerId }),
      { requestId, decision: "manual", selectedCandidateRank: null, selectedCatalogItemId: null },
    );
  });
});

function decisionRequest(body: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/garden/plant-identification/decision",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
