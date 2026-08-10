import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import golden from "../../../../contracts/auth/document-mutation-generation-v1.golden.json";
import {
  DOCUMENT_MUTATION_GENERATION_CLOCK_SKEW_SECONDS,
  DOCUMENT_MUTATION_GENERATION_MAX_AGE_SECONDS,
  DOCUMENT_MUTATION_GENERATION_PROTOCOL,
  classifyDocumentMutationGeneration,
  issueDocumentMutationGeneration,
  parseDocumentMutationGeneration,
  type DocumentMutationGenerationClassification,
} from "@/lib/auth/document-mutation-generation-contract";
import type { AuthSecretConfiguration } from "@/lib/auth-secret";

type GoldenVector = (typeof golden.vectors)[number];

function configurationFor(): AuthSecretConfiguration {
  const active = {
    version: golden.activeVersion,
    value: golden.secrets.active,
  };
  const fallback = {
    version: golden.fallbackVersion,
    value: golden.secrets.fallback,
  };
  return {
    health: {
      class: "versioned_current",
      activeVersion: active.version,
    },
    active,
    versionedSecrets: [active, fallback],
  };
}

function classify(
  vector: GoldenVector,
  overrides: Partial<{
    transport: string;
    ownerUserId: string;
    sessionId: string;
    nowSeconds: number;
    authSecrets: AuthSecretConfiguration;
  }> = {},
): DocumentMutationGenerationClassification {
  return classifyDocumentMutationGeneration({
    transport: overrides.transport ?? vector.transport,
    ownerUserId: overrides.ownerUserId ?? vector.ownerUserId,
    sessionId: overrides.sessionId ?? vector.sessionId,
    nowSeconds: overrides.nowSeconds ?? vector.issuedAtSeconds + 1,
    authSecrets: overrides.authSecrets ?? configurationFor(),
  });
}

describe("DocumentMutationGenerationV1", () => {
  it("matches every byte in the active and fallback golden vectors", () => {
    expect(golden.schemaVersion).toBe(
      "overgarden.document-mutation-generation.golden.v1",
    );
    expect(golden.vectors.map((vector) => vector.secretClass)).toEqual([
      "active",
      "fallback",
    ]);

    for (const vector of golden.vectors) {
      const issued = issueDocumentMutationGeneration({
        ownerUserId: vector.ownerUserId,
        sessionId: vector.sessionId,
        issuedAtSeconds: vector.issuedAtSeconds,
        expiresAtSeconds: vector.expiresAtSeconds,
        documentNonce: Buffer.from(vector.documentNonceHex, "hex"),
        authSecrets: {
          ...configurationFor(),
          active: {
            version: vector.secretVersion,
            value:
              vector.secretClass === "active"
                ? golden.secrets.active
                : golden.secrets.fallback,
          },
        },
      });

      expect(issued.envelope).toEqual(vector.envelope);
      expect(issued.unsignedPayload.toString("hex")).toBe(
        vector.unsignedPayloadHex,
      );
      expect(issued.transport).toBe(vector.transport);
      expect(parseDocumentMutationGeneration(vector.transport)).toEqual(
        vector.envelope,
      );
      expect(classify(vector)).toBe("MATCH");
    }
  });

  it("uses the exact domain-separated HMAC construction", () => {
    const vector = golden.vectors[0];
    const secret = golden.secrets.active;
    const ownerGeneration = createHmac("sha256", secret)
      .update(
        `overgarden.document-owner-generation.v1\0${vector.ownerUserId}`,
        "utf8",
      )
      .digest("base64url");
    const sessionGeneration = createHmac("sha256", secret)
      .update(
        `overgarden.document-session-generation.v1\0${vector.ownerUserId}\0${vector.sessionId}`,
        "utf8",
      )
      .digest("base64url");

    expect(vector.envelope.ownerGeneration).toBe(ownerGeneration);
    expect(vector.envelope.sessionGeneration).toBe(sessionGeneration);
    expect(vector.envelope.protocol).toBe(
      "overgarden.document-mutation-generation.v1",
    );
    expect(DOCUMENT_MUTATION_GENERATION_PROTOCOL).toBe(
      vector.envelope.protocol,
    );
  });

  it("separates owner transitions, same-owner session refresh, and invalid protocol", () => {
    const vector = golden.vectors[0];

    expect(
      classify(vector, {
        ownerUserId: "00000000-0000-4000-8000-0000000000b2",
        sessionId: "better-auth-session-b2",
      }),
    ).toBe("OWNER_TRANSITION_CONFIRMED");
    expect(classify(vector, { sessionId: "better-auth-session-a2" })).toBe(
      "SAME_OWNER_SESSION_REFRESH_REQUIRED",
    );

    const tampered = `${vector.transport.slice(0, -1)}${
      vector.transport.endsWith("A") ? "B" : "A"
    }`;
    expect(classify(vector, { transport: tampered })).toBe(
      "INVALID_OR_TAMPERED",
    );
  });

  it("rejects non-canonical encodings, unknown secret versions, and invalid time windows", () => {
    const vector = golden.vectors[0];
    const decodedTuple = JSON.parse(
      Buffer.from(vector.transport, "base64url").toString("utf8"),
    ) as unknown[];
    const paddedTransport = `${vector.transport}=`;
    const whitespaceTuple = Buffer.from(
      JSON.stringify(decodedTuple, null, 2),
      "utf8",
    ).toString("base64url");
    const unknownVersionTuple = [...decodedTuple];
    unknownVersionTuple[1] = 999;
    const unknownVersionTransport = Buffer.from(
      JSON.stringify(unknownVersionTuple),
      "utf8",
    ).toString("base64url");

    expect(parseDocumentMutationGeneration(paddedTransport)).toBeNull();
    expect(parseDocumentMutationGeneration(whitespaceTuple)).toBeNull();
    expect(classify(vector, { transport: unknownVersionTransport })).toBe(
      "INVALID_OR_TAMPERED",
    );
    expect(classify(vector, { nowSeconds: vector.expiresAtSeconds })).toBe(
      "INVALID_OR_TAMPERED",
    );
    expect(
      classify(vector, {
        nowSeconds:
          vector.issuedAtSeconds -
          DOCUMENT_MUTATION_GENERATION_CLOCK_SKEW_SECONDS -
          1,
      }),
    ).toBe("INVALID_OR_TAMPERED");

    expect(() =>
      issueDocumentMutationGeneration({
        ownerUserId: vector.ownerUserId,
        sessionId: vector.sessionId,
        issuedAtSeconds: vector.issuedAtSeconds,
        expiresAtSeconds:
          vector.issuedAtSeconds +
          DOCUMENT_MUTATION_GENERATION_MAX_AGE_SECONDS +
          1,
        documentNonce: Buffer.alloc(16),
        authSecrets: configurationFor(),
      }),
    ).toThrow("bounded document mutation generation lifetime");
  });

  it("fails unavailable for malformed selected active material", () => {
    const vector = golden.vectors[0];
    const configuration = configurationFor();

    expect(
      classify(vector, {
        authSecrets: {
          ...configuration,
          versionedSecrets: [
            { version: golden.activeVersion, value: "" },
            configuration.versionedSecrets[1]!,
          ],
        },
      }),
    ).toBe("MUTATION_ADMISSION_UNAVAILABLE");
  });
});
