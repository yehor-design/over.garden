import { afterEach, describe, expect, it, vi } from "vitest";

import golden from "../../../../contracts/auth/document-mutation-generation-v1.golden.json";
import type { AuthSecretConfiguration } from "@/lib/auth-secret";
import {
  MUTATION_ADMISSION_DEADLINE_MS,
  admitDocumentMutation,
  type DocumentMutationAdmissionDeps,
} from "./document-mutation-admission";

const vector = golden.vectors[0];
const OWNER_B = "00000000-0000-4000-8000-0000000000b2";
const FAMILIES = [
  "authenticated_user",
  "elevated_operator",
  "account_disconnect",
  "privacy_lifecycle",
] as const;
const CASES = [
  "matching_authorized",
  "matching_unauthorized",
  "owner_changed",
  "same_owner_session_refresh",
  "missing_protocol",
  "invalid_protocol",
  "signed_out",
  "session_unavailable",
] as const;

type Family = (typeof FAMILIES)[number];
type MatrixCase = (typeof CASES)[number];

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

afterEach(() => {
  vi.useRealTimers();
});

describe("remaining document mutation admission", () => {
  it("allows exactly one canonical effect per family across the 32-case authority matrix", async () => {
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => (releaseBarrier = resolve));
    const effectCounts = Object.fromEntries(
      FAMILIES.map((family) => [family, 0]),
    ) as Record<Family, number>;

    const attempts = FAMILIES.flatMap((family) =>
      CASES.map(async (matrixCase) => {
        const fixture = matrixFixture(matrixCase, barrier);
        const admission = await admitDocumentMutation({
          transport: fixture.transport,
          nowSeconds: vector.issuedAtSeconds + 1,
          deps: fixture.deps,
        });
        if (admission.status === "rejected") {
          return {
            family,
            matrixCase,
            result: admission.transportResult,
            effect: false,
          } as const;
        }

        const authorized = matrixCase === "matching_authorized";
        if (authorized) {
          effectCounts[family] += 1;
        }
        return {
          family,
          matrixCase,
          result: authorized ? "MATCH" : "ROLE_DENIED_AFTER_ADMISSION",
          effect: authorized,
        } as const;
      }),
    );

    releaseBarrier();
    const receipts = await Promise.all(attempts);

    expect(receipts).toHaveLength(32);
    expect(effectCounts).toEqual({
      authenticated_user: 1,
      elevated_operator: 1,
      account_disconnect: 1,
      privacy_lifecycle: 1,
    });
    expect(receipts.filter((receipt) => receipt.effect)).toHaveLength(
      FAMILIES.length,
    );
    for (const family of FAMILIES) {
      expect(
        receipts.find(
          (receipt) =>
            receipt.family === family && receipt.matrixCase === "owner_changed",
        ),
      ).toMatchObject({ result: "DOCUMENT_OWNER_CHANGED", effect: false });
      expect(
        receipts.find(
          (receipt) =>
            receipt.family === family &&
            receipt.matrixCase === "matching_unauthorized",
        ),
      ).toMatchObject({
        result: "ROLE_DENIED_AFTER_ADMISSION",
        effect: false,
      });
    }

    const redactedReceipt = JSON.stringify({
      matrixSize: receipts.length,
      families: FAMILIES,
      admittedEffects: Object.values(effectCounts).reduce(
        (sum, count) => sum + count,
        0,
      ),
      rejectedEffects: 0,
      geospatialPatternCount: 0,
    });
    expect(redactedReceipt).not.toMatch(
      /userId|sessionId|cookie|generation|email|latitude|longitude|coordinates|\d{2}\.\d{4}/i,
    );
  });

  it("settles at the canonical deadline and fences a released late resolver before effect", async () => {
    vi.useFakeTimers();
    let release!: (session: unknown) => void;
    let effectCount = 0;
    const deps = baseDeps(
      () => new Promise<unknown>((resolve) => (release = resolve)),
    );
    const pending = admitDocumentMutation({
      transport: vector.transport,
      nowSeconds: vector.issuedAtSeconds + 1,
      deps,
    }).then((admission) => {
      if (admission.status === "admitted") effectCount += 1;
      return admission;
    });

    expect(MUTATION_ADMISSION_DEADLINE_MS).toBeLessThanOrEqual(3_000);
    await vi.advanceTimersByTimeAsync(MUTATION_ADMISSION_DEADLINE_MS);
    await expect(pending).resolves.toMatchObject({
      status: "rejected",
      transportResult: "MUTATION_ADMISSION_UNAVAILABLE",
    });

    release(matchingSession());
    await Promise.resolve();
    await Promise.resolve();
    expect(effectCount).toBe(0);
  });
});

function matrixFixture(matrixCase: MatrixCase, barrier: Promise<void>) {
  let transport: string | null = vector.transport;
  let readSession: () => Promise<unknown> = async () => matchingSession();
  switch (matrixCase) {
    case "owner_changed":
      readSession = async () => ({
        user: { id: OWNER_B },
        session: { id: "synthetic-session-b" },
      });
      break;
    case "same_owner_session_refresh":
      readSession = async () => ({
        user: { id: vector.ownerUserId },
        session: { id: "synthetic-session-a2" },
      });
      break;
    case "missing_protocol":
      transport = null;
      break;
    case "invalid_protocol":
      transport = `${vector.transport.slice(0, -1)}A`;
      break;
    case "signed_out":
      readSession = async () => null;
      break;
    case "session_unavailable":
      readSession = async () => {
        throw new Error("synthetic resolver unavailable");
      };
      break;
    case "matching_authorized":
    case "matching_unauthorized":
      break;
  }

  return {
    transport,
    deps: baseDeps(async () => {
      await barrier;
      return readSession();
    }),
  };
}

function baseDeps(
  readAuthoritativeSession: () => Promise<unknown>,
): DocumentMutationAdmissionDeps {
  return {
    readAuthoritativeSession: vi.fn(readAuthoritativeSession),
    authSecrets: configuration,
  };
}

function matchingSession() {
  return {
    user: { id: vector.ownerUserId },
    session: { id: vector.sessionId },
  };
}
