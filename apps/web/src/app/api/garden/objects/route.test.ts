import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OBJECT_ID = "00000000-0000-4000-8000-000000000002";
const SESSION_ID = "00000000-0000-4000-8000-000000000003";
const MEDIA_ID = "00000000-0000-4000-8000-000000000004";
const SPACE_ID = "00000000-0000-4000-8000-000000000005";
const SPECIES_ID = "00000000-0000-4000-8000-000000000006";
const RECEIPT = "r".repeat(64);

const mocks = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
  claimOwnedPhoto: vi.fn(),
  finalizeOwnedPhoto: vi.fn(),
  createOwnedObject: vi.fn(),
  readOwnedObjectForReplay: vi.fn(),
  findOwnedObjectByName: vi.fn(),
  isObjectIdentitySelectable: vi.fn(),
  getRequestInterfaceLocale: vi.fn(async () => "bg"),
}));

vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromRequest: () => OWNER_ID,
  mutationScopeResponse: () =>
    Response.json({ code: "session_required" }, { status: 401 }),
}));
vi.mock("@/server/media/owned-photo-handoff", () => ({
  claimOwnedPhoto: mocks.claimOwnedPhoto,
  finalizeOwnedPhoto: mocks.finalizeOwnedPhoto,
}));
vi.mock("@/server/object-setup-repository", () => ({
  createOwnedObject: mocks.createOwnedObject,
  readOwnedObjectForReplay: mocks.readOwnedObjectForReplay,
  findOwnedObjectByName: mocks.findOwnedObjectByName,
  isObjectIdentitySelectable: mocks.isObjectIdentitySelectable,
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

const OBJECT = {
  id: OBJECT_ID,
  displayName: "Рябка",
  objectKind: "animal",
  space: { id: SPACE_ID, displayName: "Двір" },
  catalog: null,
};
const CLAIMED = {
  media: { mediaAssetId: MEDIA_ID, generation: 1 },
  stagingSessionId: SESSION_ID,
  receiptSetDigest: "d".repeat(43),
};
const PHOTO = {
  stagingSessionId: SESSION_ID,
  mediaAssetId: MEDIA_ID,
  receipts: [RECEIPT],
  placeholder: null,
};

function request(body: Record<string, unknown>) {
  return new Request("https://over.garden/api/garden/objects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestId: OBJECT_ID,
      objectKind: "animal",
      displayName: "Рябка",
      spaceId: SPACE_ID,
      species: { kind: "catalog", catalogItemId: SPECIES_ID },
      cultivar: { kind: "new", name: "Брама" },
      ...body,
    }),
  });
}

describe("POST /api/garden/objects (OVE-524)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: { userId: OWNER_ID },
    });
    mocks.readOwnedObjectForReplay.mockResolvedValue(null);
    mocks.findOwnedObjectByName.mockResolvedValue(null);
    mocks.isObjectIdentitySelectable.mockResolvedValue(true);
    mocks.claimOwnedPhoto.mockResolvedValue(CLAIMED);
    mocks.finalizeOwnedPhoto.mockResolvedValue(true);
    mocks.createOwnedObject.mockResolvedValue({
      status: "created",
      object: OBJECT,
      replayed: false,
    });
  });

  it("claims the photo under the object's id, writes both together with the choices, then finalizes", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ photo: PHOTO }));

    expect(response.status).toBe(201);
    expect(mocks.claimOwnedPhoto).toHaveBeenCalledWith({
      ownerUserId: OWNER_ID,
      publishId: OBJECT_ID,
      photo: PHOTO,
    });
    expect(mocks.createOwnedObject).toHaveBeenCalledWith(
      { userId: OWNER_ID },
      expect.objectContaining({
        requestId: OBJECT_ID,
        species: { kind: "catalog", catalogItemId: SPECIES_ID },
        cultivar: { kind: "new", name: "Брама" },
      }),
      undefined,
      // A new breed entry is named in the gardener's language.
      { photo: CLAIMED, locale: "bg" },
    );
    expect(mocks.finalizeOwnedPhoto).toHaveBeenCalledWith({
      ownerUserId: OWNER_ID,
      publishId: OBJECT_ID,
      stagingSessionId: SESSION_ID,
      receiptSetDigest: CLAIMED.receiptSetDigest,
    });
  });

  it("asks the same-name question and checks the choices before it claims anything", async () => {
    mocks.findOwnedObjectByName.mockResolvedValueOnce(OBJECT);
    const { POST } = await import("./route");
    const duplicate = await POST(request({ photo: PHOTO }));
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ status: "duplicate_name" });

    mocks.isObjectIdentitySelectable.mockResolvedValueOnce(false);
    const stale = await POST(request({ photo: PHOTO }));
    expect(stale.status).toBe(422);
    expect(await stale.json()).toEqual({ status: "identity_unavailable" });

    expect(mocks.claimOwnedPhoto).not.toHaveBeenCalled();
    expect(mocks.createOwnedObject).not.toHaveBeenCalled();
  });

  it("reads a retried intent back without claiming the photo a second time", async () => {
    mocks.readOwnedObjectForReplay.mockResolvedValueOnce(OBJECT);
    const { POST } = await import("./route");
    const response = await POST(request({ photo: PHOTO }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "created",
      replayed: true,
    });
    expect(mocks.claimOwnedPhoto).not.toHaveBeenCalled();
    expect(mocks.createOwnedObject).not.toHaveBeenCalled();
  });

  it("says so when the staged photo can no longer be claimed, and creates nothing", async () => {
    mocks.claimOwnedPhoto.mockRejectedValueOnce(
      new Error("staging_session_expired"),
    );
    const { POST } = await import("./route");
    const response = await POST(request({ photo: PHOTO }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ status: "photo_unavailable" });
    expect(mocks.createOwnedObject).not.toHaveBeenCalled();
  });

  it("creates an object without a photo, knowing nothing, with no staging at all", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      request({ species: undefined, cultivar: undefined }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createOwnedObject).toHaveBeenCalledWith(
      { userId: OWNER_ID },
      expect.objectContaining({
        species: { kind: "unknown" },
        cultivar: { kind: "unknown" },
        photo: null,
      }),
      undefined,
      { photo: null, locale: "bg" },
    );
    expect(mocks.claimOwnedPhoto).not.toHaveBeenCalled();
    expect(mocks.finalizeOwnedPhoto).not.toHaveBeenCalled();
  });

  it("refuses a cultivar without a species, and a malformed photo, before touching staging", async () => {
    const { POST } = await import("./route");
    const noSpecies = await POST(request({ species: { kind: "unknown" } }));
    expect(noSpecies.status).toBe(400);
    const badPhoto = await POST(request({ photo: { ...PHOTO, receipts: [] } }));
    expect(badPhoto.status).toBe(400);
    expect(mocks.claimOwnedPhoto).not.toHaveBeenCalled();
    expect(mocks.createOwnedObject).not.toHaveBeenCalled();
  });

  it("answers a stale pick the write found as identity_unavailable", async () => {
    mocks.createOwnedObject.mockResolvedValueOnce({
      status: "identity_unavailable",
    });
    const { POST } = await import("./route");
    const response = await POST(request({}));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ status: "identity_unavailable" });
  });
});
