import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const SPACE_ID = "00000000-0000-4000-8000-000000000002";
const SESSION_ID = "00000000-0000-4000-8000-000000000003";
const MEDIA_ID = "00000000-0000-4000-8000-000000000004";
const RECEIPT = "r".repeat(64);

const mocks = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
  claimOwnedPhoto: vi.fn(),
  finalizeOwnedPhoto: vi.fn(),
  createOwnedSpace: vi.fn(),
  readOwnedSpaceForReplay: vi.fn(),
  findOwnedSpaceByName: vi.fn(),
}));

vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromRequest: () => OWNER_ID,
  mutationScopeResponse: () => Response.json({ code: "session_required" }, { status: 401 }),
}));
vi.mock("@/server/media/owned-photo-handoff", () => ({
  claimOwnedPhoto: mocks.claimOwnedPhoto,
  finalizeOwnedPhoto: mocks.finalizeOwnedPhoto,
}));
vi.mock("@/server/space-repository", () => ({
  createOwnedSpace: mocks.createOwnedSpace,
  readOwnedSpaceForReplay: mocks.readOwnedSpaceForReplay,
  findOwnedSpaceByName: mocks.findOwnedSpaceByName,
}));

const SPACE = {
  id: SPACE_ID,
  displayName: "Балкон",
  locationVisibility: "hidden",
  coarseRegionCode: null,
};
const CLAIMED = {
  media: { mediaAssetId: MEDIA_ID, generation: 1 },
  stagingSessionId: SESSION_ID,
  receiptSetDigest: "d".repeat(43),
};

function request(body: Record<string, unknown>) {
  return new Request("https://over.garden/api/garden/spaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestId: SPACE_ID,
      displayName: "Балкон",
      locationVisibility: "hidden",
      coarseRegionCode: null,
      ...body,
    }),
  });
}

const PHOTO = {
  stagingSessionId: SESSION_ID,
  mediaAssetId: MEDIA_ID,
  receipts: [RECEIPT],
  placeholder: null,
};

describe("POST /api/garden/spaces with a photo (ADR-0036 D1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: { userId: OWNER_ID },
    });
    mocks.readOwnedSpaceForReplay.mockResolvedValue(null);
    mocks.findOwnedSpaceByName.mockResolvedValue(null);
    mocks.claimOwnedPhoto.mockResolvedValue(CLAIMED);
    mocks.finalizeOwnedPhoto.mockResolvedValue(true);
    mocks.createOwnedSpace.mockResolvedValue({ status: "created", space: SPACE, replayed: false });
  });

  it("claims the photo under the space's id, writes both together, then finalizes", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ photo: PHOTO }));

    expect(response.status).toBe(201);
    expect(mocks.claimOwnedPhoto).toHaveBeenCalledWith({
      ownerUserId: OWNER_ID,
      publishId: SPACE_ID,
      photo: PHOTO,
    });
    expect(mocks.createOwnedSpace).toHaveBeenCalledWith(
      { userId: OWNER_ID },
      expect.objectContaining({ requestId: SPACE_ID, locationVisibility: "hidden", photo: PHOTO }),
      undefined,
      { photo: CLAIMED },
    );
    expect(mocks.finalizeOwnedPhoto).toHaveBeenCalledWith({
      ownerUserId: OWNER_ID,
      publishId: SPACE_ID,
      stagingSessionId: SESSION_ID,
      receiptSetDigest: CLAIMED.receiptSetDigest,
    });
  });

  it("asks the same-name question before it claims anything", async () => {
    mocks.findOwnedSpaceByName.mockResolvedValueOnce({ ...SPACE, id: OWNER_ID });
    const { POST } = await import("./route");
    const response = await POST(request({ photo: PHOTO }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ status: "duplicate_name" });
    expect(mocks.claimOwnedPhoto).not.toHaveBeenCalled();
  });

  it("reads a retried intent back without claiming the photo a second time", async () => {
    mocks.readOwnedSpaceForReplay.mockResolvedValueOnce(SPACE);
    const { POST } = await import("./route");
    const response = await POST(request({ photo: PHOTO }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "created", replayed: true });
    expect(mocks.claimOwnedPhoto).not.toHaveBeenCalled();
    expect(mocks.createOwnedSpace).not.toHaveBeenCalled();
  });

  it("says so when the staged photo can no longer be claimed, and creates nothing", async () => {
    mocks.claimOwnedPhoto.mockRejectedValueOnce(new Error("staging_session_expired"));
    const { POST } = await import("./route");
    const response = await POST(request({ photo: PHOTO }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ status: "photo_unavailable" });
    expect(mocks.createOwnedSpace).not.toHaveBeenCalled();
  });

  it("creates a space without a photo exactly as before", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({}));

    expect(response.status).toBe(201);
    expect(mocks.claimOwnedPhoto).not.toHaveBeenCalled();
    expect(mocks.finalizeOwnedPhoto).not.toHaveBeenCalled();
  });

  it("refuses a malformed photo before touching staging", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ photo: { ...PHOTO, receipts: [] } }));

    expect(response.status).toBe(400);
    expect(mocks.claimOwnedPhoto).not.toHaveBeenCalled();
  });
});
