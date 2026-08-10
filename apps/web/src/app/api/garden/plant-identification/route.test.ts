import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  PilotWriteAccessError: class PilotWriteAccessError extends Error {},
  requireWriteEligibleRequestScope: vi.fn(),
  authIntentRequiredResponse: vi.fn(),
  getPlantObjectPage: vi.fn(),
  findMediaAssetForOwner: vi.fn(),
  getPublicDerivativeObjectBuffer: vi.fn(),
  reencodePlantNetImage: vi.fn(),
  buildPlantNetFingerprint: vi.fn(),
  identifyPlantSpecies: vi.fn(),
  isPlantNetSpeciesIdentificationEnabled: vi.fn(),
  findExactSelectableSpeciesByScientificName: vi.fn(),
  createOrReadPlantIdentificationRequest: vi.fn(),
  claimPlantIdentificationSubmission: vi.fn(),
  readPlantIdentificationReceipt: vi.fn(),
  settlePlantIdentificationCandidates: vi.fn(),
  settlePlantIdentificationFailure: vi.fn(),
  admitDocumentMutation: vi.fn(),
  documentMutationAdmissionResponse: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  AuthenticationRequiredError: mocks.AuthenticationRequiredError,
}));
vi.mock("@/server/auth-intent-http", () => ({
  authIntentRequiredResponse: mocks.authIntentRequiredResponse,
}));
vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: mocks.admitDocumentMutation,
  documentMutationAdmissionResponse: mocks.documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest: vi.fn(() => null),
}));
vi.mock("@/server/pilot-write-access", () => ({
  PilotWriteAccessError: mocks.PilotWriteAccessError,
  requireWriteEligibleRequestScope: mocks.requireWriteEligibleRequestScope,
}));
vi.mock("@/server/journal-repository", () => ({
  getPlantObjectPage: mocks.getPlantObjectPage,
}));
vi.mock("@/server/media/media-repository", () => ({
  findMediaAssetForOwner: mocks.findMediaAssetForOwner,
}));
vi.mock("@/lib/storage", () => ({
  getPublicDerivativeObjectBuffer: mocks.getPublicDerivativeObjectBuffer,
}));
vi.mock("@/server/plantnet-species-adapter", () => ({
  PLANTNET_MAX_IMAGES: 5,
  PLANTNET_ORGANS: ["auto", "leaf", "flower", "fruit", "bark"],
  PLANTNET_POLICY_VERSION: "ove269.plantnet-species.v1",
  PlantNetAdapterError: class PlantNetAdapterError extends Error {},
  buildPlantNetFingerprint: mocks.buildPlantNetFingerprint,
  identifyPlantSpecies: mocks.identifyPlantSpecies,
  isPlantNetSpeciesIdentificationEnabled:
    mocks.isPlantNetSpeciesIdentificationEnabled,
  reencodePlantNetImage: mocks.reencodePlantNetImage,
}));
vi.mock("@/server/catalog-repository", () => ({
  findExactSelectableSpeciesByScientificName:
    mocks.findExactSelectableSpeciesByScientificName,
}));
vi.mock("@/server/plant-identification-repository", () => ({
  claimPlantIdentificationSubmission: mocks.claimPlantIdentificationSubmission,
  createOrReadPlantIdentificationRequest:
    mocks.createOrReadPlantIdentificationRequest,
  readPlantIdentificationReceipt: mocks.readPlantIdentificationReceipt,
  settlePlantIdentificationCandidates:
    mocks.settlePlantIdentificationCandidates,
  settlePlantIdentificationFailure: mocks.settlePlantIdentificationFailure,
}));

const ownerId = "00000000-0000-4000-8000-000000000001";
const objectId = "00000000-0000-4000-8000-000000000101";
const mediaId = "00000000-0000-4000-8000-000000000201";
const requestId = "00000000-0000-4000-8000-000000000301";

describe("POST /api/garden/plant-identification", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireWriteEligibleRequestScope.mockResolvedValue({
      userId: ownerId,
      sessionId: "session-1",
    });
    mocks.admitDocumentMutation.mockResolvedValue({
      status: "admitted",
      scope: { userId: ownerId, sessionId: "session-1" },
    });
    mocks.documentMutationAdmissionResponse.mockImplementation((admission) =>
      Response.json(
        { code: admission.transportResult },
        { status: admission.statusCode },
      ),
    );
    mocks.authIntentRequiredResponse.mockReturnValue(
      Response.json({ error: "opaque-identification-intent" }, { status: 401 }),
    );
    mocks.isPlantNetSpeciesIdentificationEnabled.mockReturnValue(true);
    mocks.getPlantObjectPage.mockResolvedValue({
      plantObject: { object_kind: "plant", variety_state: "unknown" },
      gallery_media: [{ id: mediaId }],
    });
    mocks.findMediaAssetForOwner.mockResolvedValue({
      id: mediaId,
      status: "processed",
      media_readiness_state: "public_ready",
      original_deleted_at: new Date(),
      derivative_key: "derivatives/opaque.webp",
      revoked_at: null,
    });
    mocks.getPublicDerivativeObjectBuffer.mockResolvedValue(
      Buffer.from("safe"),
    );
    mocks.reencodePlantNetImage.mockResolvedValue({
      bytes: Buffer.from("normalized"),
      sha256: "a".repeat(64),
    });
    mocks.buildPlantNetFingerprint.mockReturnValue("b".repeat(64));
    mocks.createOrReadPlantIdentificationRequest.mockResolvedValue({
      id: requestId,
      state: "ready_to_submit",
      isNew: true,
    });
    mocks.claimPlantIdentificationSubmission.mockResolvedValue({
      claimToken: "00000000-0000-4000-8000-000000000401",
    });
    mocks.identifyPlantSpecies.mockResolvedValue({
      candidates: [
        {
          rank: 1,
          score: 0.9,
          scientificName: "Malus domestica",
          genus: "Malus",
          family: "Rosaceae",
        },
      ],
      durationMs: 12,
      quotaRemaining: 7,
      modelVersion: "model-v1",
    });
    mocks.findExactSelectableSpeciesByScientificName.mockResolvedValue({
      status: "mapped",
      item: { id: "00000000-0000-4000-8000-000000000501" },
    });
    mocks.readPlantIdentificationReceipt.mockResolvedValue({
      id: requestId,
      state: "shortlist_ready",
      canConfirm: true,
      candidates: [],
    });
  });

  it("returns an opaque authentication intent before reading a private photo selection", async () => {
    mocks.admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      transportResult: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
    });
    const { POST } = await import("./route");
    const response = await POST(
      identificationRequest({
        plantObjectId: objectId,
        mediaAssetIds: [mediaId],
        organs: ["leaf"],
        privateNote: "42.0,23.0",
      }),
    );

    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toMatch(/42\.0|23\.0/);
    expect(mocks.getPlantObjectPage).not.toHaveBeenCalled();
    expect(mocks.getPublicDerivativeObjectBuffer).not.toHaveBeenCalled();
  });

  it("rejects media outside the object gallery before reading storage or calling Pl@ntNet", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      identificationRequest({
        plantObjectId: objectId,
        mediaAssetIds: ["00000000-0000-4000-8000-000000000299"],
        organs: ["auto"],
      }),
    );

    expect(response.status).toBe(422);
    expect(mocks.findMediaAssetForOwner).not.toHaveBeenCalled();
    expect(mocks.getPublicDerivativeObjectBuffer).not.toHaveBeenCalled();
    expect(mocks.identifyPlantSpecies).not.toHaveBeenCalled();
  });

  it("uses only the object's processed derivative and stores a mapped shortlist receipt", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      identificationRequest({
        plantObjectId: objectId,
        mediaAssetIds: [mediaId],
        organs: ["leaf"],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.getPublicDerivativeObjectBuffer).toHaveBeenCalledWith(
      "derivatives/opaque.webp",
      12 * 1024 * 1024,
    );
    expect(mocks.identifyPlantSpecies).toHaveBeenCalledWith([
      { bytes: Buffer.from("normalized"), organ: "leaf" },
    ]);
    expect(mocks.settlePlantIdentificationCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ownerId }),
      expect.objectContaining({
        requestId,
        candidates: [
          expect.objectContaining({
            mappingStatus: "mapped",
            catalogItemId: "00000000-0000-4000-8000-000000000501",
          }),
        ],
      }),
    );
  });

  it("allows a previously blocked ready receipt to claim only after the owner gate clears", async () => {
    mocks.createOrReadPlantIdentificationRequest.mockResolvedValue({
      id: requestId,
      state: "ready_to_submit",
      isNew: false,
    });
    const { POST } = await import("./route");

    await POST(
      identificationRequest({
        plantObjectId: objectId,
        mediaAssetIds: [mediaId],
        organs: ["auto"],
      }),
    );

    expect(mocks.claimPlantIdentificationSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ownerId }),
      requestId,
    );
  });
});

function identificationRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/garden/plant-identification", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
