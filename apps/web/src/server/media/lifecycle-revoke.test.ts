import { beforeEach, describe, expect, it, vi } from "vitest";

const deletePublicDerivativeObject = vi.fn();
const deleteQuarantineObject = vi.fn();
const getPublicDerivativeUrl = vi.fn(
  (key: string) => `https://media.over.garden/${key}`,
);

vi.mock("@/lib/storage", () => ({
  deletePublicDerivativeObject,
  deleteQuarantineObject,
  getPublicDerivativeUrl,
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 404, json: async () => ({}) })),
    );
  });

  it("deletes quarantine objects without canonical prove", async () => {
    const { revokeMediaObjectBytes } = await import("./lifecycle-revoke");
    const result = await revokeMediaObjectBytes({
      bucket: "quarantine",
      objectKey: "quarantine/a.jpg",
    });
    expect(deleteQuarantineObject).toHaveBeenCalledWith("quarantine/a.jpg");
    expect(deletePublicDerivativeObject).not.toHaveBeenCalled();
    expect(result.provedUnreachable).toBe(true);
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
