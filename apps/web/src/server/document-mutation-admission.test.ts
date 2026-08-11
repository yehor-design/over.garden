import { afterEach, describe, expect, it, vi } from "vitest";

import golden from "../../../../contracts/auth/document-mutation-generation-v1.golden.json";
import type { AuthSecretConfiguration } from "@/lib/auth-secret";
import {
  DOCUMENT_MUTATION_GENERATION_HEADER,
  MUTATION_ADMISSION_DEADLINE_MS,
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  type DocumentMutationAdmissionDeps,
} from "./document-mutation-admission";

const vector = golden.vectors[0];
const matchingSession = {
  user: { id: vector.ownerUserId, email: "synthetic-a@example.invalid" },
  session: { id: vector.sessionId },
};
const configuration: AuthSecretConfiguration = {
  health: {
    class: "versioned_current",
    activeVersion: golden.activeVersion,
  },
  active: { version: golden.activeVersion, value: golden.secrets.active },
  versionedSecrets: [
    { version: golden.activeVersion, value: golden.secrets.active },
    { version: golden.fallbackVersion, value: golden.secrets.fallback },
  ],
};

function deps(
  session: unknown = matchingSession,
): DocumentMutationAdmissionDeps {
  return {
    readAuthoritativeSession: vi.fn(async () => session),
    authSecrets: configuration,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("document mutation admission", () => {
  it("returns the one authenticated request scope on a byte-exact match", async () => {
    const injected = deps();
    const result = await admitDocumentMutation({
      transport: vector.transport,
      nowSeconds: vector.issuedAtSeconds + 1,
      deps: injected,
    });

    expect(result).toEqual({
      status: "admitted",
      internalResult: "MATCH",
      transportResult: "MATCH",
      envelopeExpiresAtSeconds: vector.expiresAtSeconds,
      scope: {
        userId: vector.ownerUserId,
        sessionId: vector.sessionId,
      },
    });
    expect(injected.readAuthoritativeSession).toHaveBeenCalledOnce();
  });

  it("supports a single explicit rollback flag without weakening request scope", async () => {
    const injected = { ...deps(), featureEnabled: false };
    const result = await admitDocumentMutation({
      transport: null,
      nowSeconds: vector.issuedAtSeconds + 1,
      deps: injected,
    });

    expect(result).toMatchObject({
      status: "admitted",
      internalResult: "MATCH",
      transportResult: "MATCH",
      scope: {
        userId: vector.ownerUserId,
        sessionId: vector.sessionId,
      },
    });
    expect(injected.readAuthoritativeSession).toHaveBeenCalledOnce();
  });

  it("separates owner, session, protocol, signed-out, and unavailable results", async () => {
    const cases = [
      {
        name: "owner transition",
        transport: vector.transport,
        session: {
          user: {
            id: "00000000-0000-4000-8000-0000000000b2",
            email: "synthetic-b@example.invalid",
          },
          session: { id: "better-auth-session-b2" },
        },
        expected: ["OWNER_TRANSITION_CONFIRMED", "DOCUMENT_OWNER_CHANGED", 409],
      },
      {
        name: "same owner session refresh",
        transport: vector.transport,
        session: {
          ...matchingSession,
          session: { id: "better-auth-session-a2" },
        },
        expected: [
          "SAME_OWNER_SESSION_REFRESH_REQUIRED",
          "DOCUMENT_SESSION_REFRESH_REQUIRED",
          409,
        ],
      },
      {
        name: "missing protocol",
        transport: null,
        session: matchingSession,
        expected: [
          "DOCUMENT_PROTOCOL_REFRESH_REQUIRED",
          "DOCUMENT_PROTOCOL_REFRESH_REQUIRED",
          409,
        ],
      },
      {
        name: "bad protocol",
        transport: `${vector.transport.slice(0, -1)}A`,
        session: matchingSession,
        expected: [
          "INVALID_OR_TAMPERED",
          "DOCUMENT_PROTOCOL_REFRESH_REQUIRED",
          409,
        ],
      },
      {
        name: "signed out",
        transport: vector.transport,
        session: null,
        expected: ["SIGNED_OUT", "AUTHENTICATION_REQUIRED", 401],
      },
    ] as const;

    for (const testCase of cases) {
      const result = await admitDocumentMutation({
        transport: testCase.transport,
        nowSeconds: vector.issuedAtSeconds + 1,
        deps: deps(testCase.session),
      });
      expect(result.status, testCase.name).toBe("rejected");
      if (result.status !== "rejected") throw new Error("Expected rejection.");
      expect(
        [result.internalResult, result.transportResult, result.statusCode],
        testCase.name,
      ).toEqual(testCase.expected);
    }

    const unavailableDeps = deps();
    vi.mocked(unavailableDeps.readAuthoritativeSession).mockRejectedValueOnce(
      new Error("auth unavailable"),
    );
    await expect(
      admitDocumentMutation({
        transport: vector.transport,
        nowSeconds: vector.issuedAtSeconds + 1,
        deps: unavailableDeps,
      }),
    ).resolves.toMatchObject({
      status: "rejected",
      internalResult: "MUTATION_ADMISSION_UNAVAILABLE",
      transportResult: "MUTATION_ADMISSION_UNAVAILABLE",
      statusCode: 503,
    });
  });

  it("settles unavailable at exactly 3000 ms and never admits a late result", async () => {
    vi.useFakeTimers();
    let release!: (value: unknown) => void;
    const readAuthoritativeSession = vi.fn(
      () => new Promise<unknown>((resolve) => (release = resolve)),
    );
    const injected: DocumentMutationAdmissionDeps = {
      ...deps(),
      readAuthoritativeSession,
    };
    const admission = admitDocumentMutation({
      transport: vector.transport,
      nowSeconds: vector.issuedAtSeconds + 1,
      deps: injected,
    });

    await vi.advanceTimersByTimeAsync(MUTATION_ADMISSION_DEADLINE_MS - 1);
    let settled = false;
    void admission.finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(admission).resolves.toMatchObject({
      status: "rejected",
      internalResult: "MUTATION_ADMISSION_UNAVAILABLE",
    });
    release(matchingSession);
    await Promise.resolve();
    await Promise.resolve();
  });

  it("allows effects only for matching snapshots across a 32-request barrier", async () => {
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => (releaseBarrier = resolve));
    let effectCount = 0;
    const attempts = Array.from({ length: 32 }, async (_, index) => {
      const isMatch = index % 2 === 0;
      const injected = deps(
        isMatch
          ? matchingSession
          : {
              user: {
                id: "00000000-0000-4000-8000-0000000000b2",
                email: "synthetic-b@example.invalid",
              },
              session: { id: `better-auth-session-b-${index}` },
            },
      );
      const read = injected.readAuthoritativeSession;
      injected.readAuthoritativeSession = vi.fn(async () => {
        await barrier;
        return read();
      });
      const result = await admitDocumentMutation({
        transport: vector.transport,
        nowSeconds: vector.issuedAtSeconds + 1,
        deps: injected,
      });
      if (result.status === "admitted") effectCount += 1;
      return result;
    });

    releaseBarrier();
    const results = await Promise.all(attempts);
    expect(
      results.filter((result) => result.status === "admitted"),
    ).toHaveLength(16);
    expect(effectCount).toBe(16);
  });

  it("emits only the closed transport class with private no-store semantics", async () => {
    const rejection = await admitDocumentMutation({
      transport: null,
      nowSeconds: vector.issuedAtSeconds + 1,
      deps: deps(),
    });
    if (rejection.status !== "rejected") {
      throw new Error("Expected rejection.");
    }
    const response = documentMutationAdmissionResponse(rejection);

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      code: "DOCUMENT_PROTOCOL_REFRESH_REQUIRED",
    });
    expect(DOCUMENT_MUTATION_GENERATION_HEADER).toBe(
      "x-overgarden-document-generation",
    );
  });
});
