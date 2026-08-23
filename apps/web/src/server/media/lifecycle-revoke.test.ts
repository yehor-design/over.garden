import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MediaProviderObjectState } from "@/lib/storage";

const deletePublicDerivativeObject = vi.fn();
const deleteQuarantineObject = vi.fn();
const probeQuarantineObjectState = vi.fn<
  () => Promise<MediaProviderObjectState>
>(async () => "not_found");
const probePublicDerivativeObjectState = vi.fn<
  () => Promise<MediaProviderObjectState>
>(async () => "not_found");
const getPublicDerivativeUrl = vi.fn(
  (key: string) => `https://media.over.garden/${key}`,
);

vi.mock("@/lib/storage", () => ({
  deletePublicDerivativeObject,
  deleteQuarantineObject,
  getPublicDerivativeUrl,
  probeQuarantineObjectState,
  probePublicDerivativeObjectState,
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
    probeQuarantineObjectState.mockReset();
    probeQuarantineObjectState.mockResolvedValue("not_found");
    probePublicDerivativeObjectState.mockReset();
    probePublicDerivativeObjectState.mockResolvedValue("not_found");
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
    expect(deleteQuarantineObject).toHaveBeenCalledWith(
      "quarantine/a.jpg",
      expect.any(AbortSignal),
    );
    expect(probeQuarantineObjectState).toHaveBeenCalledWith(
      "quarantine/a.jpg",
      expect.any(AbortSignal),
    );
    expect(deletePublicDerivativeObject).not.toHaveBeenCalled();
    expect(result.outcome).toBe("confirmed_gone");
  });

  it("fails closed when quarantine bytes remain after delete", async () => {
    probeQuarantineObjectState.mockResolvedValueOnce("present");
    const { revokeMediaObjectBytes } = await import("./lifecycle-revoke");
    const result = await revokeMediaObjectBytes({
      bucket: "quarantine",
      objectKey: "quarantine/stale.jpg",
    });
    expect(result.outcome).toBe("still_reachable");
  });

  it("deletes public derivatives and proves canonical non-2xx", async () => {
    const { revokeMediaObjectBytes } = await import("./lifecycle-revoke");
    const result = await revokeMediaObjectBytes({
      bucket: "public_derivative",
      objectKey: "derivatives/a.webp",
    });
    expect(deletePublicDerivativeObject).toHaveBeenCalledWith(
      "derivatives/a.webp",
      expect.any(AbortSignal),
    );
    expect(result.outcome).toBe("confirmed_gone");
    expect(result.canonicalStatus).toBe(404);
  });

  it.each([
    ["indeterminate_transport"],
    ["indeterminate_auth"],
    ["provider_error"],
  ] as const)("never converts provider %s into absence", async (outcome) => {
    probePublicDerivativeObjectState.mockResolvedValueOnce(outcome);
    const { revokeMediaObjectBytes } = await import("./lifecycle-revoke");
    const result = await revokeMediaObjectBytes({
      bucket: "public_derivative",
      objectKey: "derivatives/fail-closed.webp",
    });
    expect(result).toEqual({ outcome, canonicalStatus: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, "indeterminate_auth"],
    [403, "indeterminate_auth"],
    [500, "provider_error"],
    [302, "still_reachable"],
    [200, "still_reachable"],
    [410, "confirmed_gone"],
  ] as const)("classifies canonical status %s as %s", async (status, outcome) => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status })));
    const { proveCanonicalUrlUnreachable } = await import("./lifecycle-revoke");
    const result = await proveCanonicalUrlUnreachable("https://media.over.garden/x", {
      timeoutMs: 0,
      pollMs: 0,
    });
    expect(result.outcome).toBe(outcome);
  });

  it("performs one canonical probe when the deadline advances before the first attempt", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValueOnce(100).mockReturnValue(101);
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401 })));

    try {
      const { proveCanonicalUrlUnreachable } =
        await import("./lifecycle-revoke");
      const result = await proveCanonicalUrlUnreachable(
        "https://media.over.garden/x",
        { timeoutMs: 0, pollMs: 0 },
      );

      expect(result).toEqual({
        outcome: "indeterminate_auth",
        canonicalStatus: 401,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      now.mockRestore();
    }
  });

  it("keeps failed HEAD and GET transport indeterminate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    const { proveCanonicalUrlUnreachable } = await import("./lifecycle-revoke");
    await expect(
      proveCanonicalUrlUnreachable("https://media.over.garden/x"),
    ).resolves.toEqual({
      outcome: "indeterminate_transport",
      canonicalStatus: null,
    });
  });
});
