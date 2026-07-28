import { beforeEach, describe, expect, it, vi } from "vitest";

const deletePublicDerivativeObject = vi.fn();
const deleteQuarantineObject = vi.fn();
const quarantineObjectExists = vi.fn(async () => false);
const getPublicDerivativeUrl = vi.fn(
  (key: string) => `https://media.over.garden/${key}`,
);

vi.mock("@/lib/storage", () => ({
  deletePublicDerivativeObject,
  deleteQuarantineObject,
  getPublicDerivativeUrl,
  quarantineObjectExists,
}));

vi.mock("@/lib/env", () => ({
  optionalServerEnv: () => undefined,
}));

describe("lifecycle revoke", () => {
  beforeEach(() => {
    vi.resetModules();
    deletePublicDerivativeObject.mockReset();
    deleteQuarantineObject.mockReset();
    getPublicDerivativeUrl.mockClear();
    quarantineObjectExists.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 404, json: async () => ({}) })),
    );
  });

  it("deletes quarantine objects and proves actual-byte absence", async () => {
    const { revokeMediaObjectBytes } = await import("./lifecycle-revoke");
    const result = await revokeMediaObjectBytes({
      bucket: "quarantine",
      objectKey: "quarantine/a.jpg",
    });
    expect(deleteQuarantineObject).toHaveBeenCalledWith("quarantine/a.jpg");
    expect(quarantineObjectExists).toHaveBeenCalledWith("quarantine/a.jpg");
    expect(deletePublicDerivativeObject).not.toHaveBeenCalled();
    expect(result.provedUnreachable).toBe(true);
  });

  it("fails closed when quarantine bytes remain after delete", async () => {
    quarantineObjectExists.mockResolvedValueOnce(true);
    const { revokeMediaObjectBytes } = await import("./lifecycle-revoke");
    await expect(
      revokeMediaObjectBytes({
        bucket: "quarantine",
        objectKey: "quarantine/stale.jpg",
      }),
    ).rejects.toThrow("remained present");
  });

  it("deletes public derivatives and proves canonical non-2xx", async () => {
    const { revokeMediaObjectBytes } = await import("./lifecycle-revoke");
    const result = await revokeMediaObjectBytes({
      bucket: "public_derivative",
      objectKey: "derivatives/a.webp",
    });
    expect(deletePublicDerivativeObject).toHaveBeenCalledWith(
      "derivatives/a.webp",
    );
    expect(result.provedUnreachable).toBe(true);
    expect(result.canonicalStatus).toBe(404);
  });
});
