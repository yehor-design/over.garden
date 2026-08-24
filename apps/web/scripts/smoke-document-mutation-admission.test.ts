import { describe, expect, it, vi } from "vitest";

import {
  runDocumentMutationAdmissionSmoke,
  runDocumentMutationAdmissionSmokeCli,
  type DocumentMutationEffectCounts,
} from "./smoke-document-mutation-admission";

const commit = "a".repeat(40);
const sessions = {
  ownerA1Cookie: "better-auth.session_token=synthetic-owner-a1",
  ownerA2Cookie: "better-auth.session_token=synthetic-owner-a2",
  ownerBCookie: "better-auth.session_token=synthetic-owner-b",
  ownerA1DocumentGeneration: "opaque_document_generation_a1",
};

describe("document mutation admission production smoke", () => {
  it("starts as a standalone CLI without importing the Next server-only sentinel", async () => {
    await expect(
      runDocumentMutationAdmissionSmokeCli({
        argv: [
          "--environment",
          "production",
          "--mode",
          "reject-only",
          "--base-url",
          "https://example.com",
          "--expected-sha",
          commit,
          "--capability-ttl-readback",
          "required",
          "--redacted",
        ],
        env: {
          OVE290_SESSION_A1_COOKIE: sessions.ownerA1Cookie,
          OVE290_SESSION_A2_COOKIE: sessions.ownerA2Cookie,
          OVE290_SESSION_B_COOKIE: sessions.ownerBCookie,
          OVE290_DOCUMENT_A1_GENERATION:
            sessions.ownerA1DocumentGeneration,
        },
      }),
    ).rejects.toThrow("OVE-290 base URL must be an immutable Vercel origin.");
  });

  it("proves exact classes, closed capability TTL, and identical zero-effect counts", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.endsWith("/api/document-mutation-admission/readback")) {
          return Response.json({
            protocol: "overgarden.document-mutation-generation.v1",
            deploymentSha: commit,
            enforcement: "enabled",
            ephemeralMediaCapabilityTtlSeconds: 900,
          });
        }
        if (url.endsWith("/garden")) {
          return new Response('<main data-garden-workspace="guest"></main>');
        }
        if (url.endsWith("/api/auth/get-session")) {
          return Response.json(null);
        }
        if (url.endsWith("/api/garden/entries")) {
          const headers = new Headers(init?.headers);
          const cookie = headers.get("cookie");
          const generation = headers.get("x-overgarden-document-generation");
          const code =
            cookie === sessions.ownerBCookie
              ? "DOCUMENT_OWNER_CHANGED"
              : cookie === sessions.ownerA2Cookie
                ? "DOCUMENT_SESSION_REFRESH_REQUIRED"
                : generation === "malformed"
                  ? "DOCUMENT_PROTOCOL_REFRESH_REQUIRED"
                  : null;
          if (!code) throw new Error("Unexpected admitted smoke request.");
          return Response.json(
            { code },
            {
              status: 409,
              headers: { "cache-control": "private, no-store" },
            },
          );
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    );
    const readEffectCounts = vi.fn(
      async (): Promise<DocumentMutationEffectCounts> => ({
        journalEntries: 0,
        mutationReceipts: 0,
      }),
    );

    await expect(
      runDocumentMutationAdmissionSmoke({
        environment: "production",
        mode: "reject-only",
        baseUrl: "https://over-garden-immutable.vercel.app",
        expectedSha: commit,
        capabilityTtlReadback: "required",
        redacted: true,
        sessions,
        fetchImpl,
        readEffectCounts,
      }),
    ).resolves.toMatchObject({
      issue: "OVE-290",
      exactSha: true,
      enforcement: "enabled",
      rejectionClasses: {
        ownerChanged: true,
        sameOwnerSessionRefresh: true,
        protocolRefresh: true,
      },
      effectCounts: {
        before: { journalEntries: 0, mutationReceipts: 0 },
        after: { journalEntries: 0, mutationReceipts: 0 },
        digestMatch: true,
      },
    });
    expect(readEffectCounts).toHaveBeenCalledTimes(2);
    expect(
      requests.filter((request) => request.url.endsWith("/entries")),
    ).toHaveLength(3);
  });

  it("fails closed for SHA, TTL, class, or effect drift", async () => {
    const readEffectCounts = vi
      .fn()
      .mockResolvedValueOnce({ journalEntries: 0, mutationReceipts: 0 })
      .mockResolvedValueOnce({ journalEntries: 1, mutationReceipts: 0 });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/document-mutation-admission/readback")) {
        return Response.json({
          protocol: "overgarden.document-mutation-generation.v1",
          deploymentSha: commit,
          enforcement: "enabled",
          ephemeralMediaCapabilityTtlSeconds: 899,
        });
      }
      return new Response(null, { status: 200 });
    });

    await expect(
      runDocumentMutationAdmissionSmoke({
        environment: "production",
        mode: "reject-only",
        baseUrl: "https://over-garden-immutable.vercel.app",
        expectedSha: commit,
        capabilityTtlReadback: "required",
        redacted: true,
        sessions,
        fetchImpl,
        readEffectCounts,
      }),
    ).rejects.toThrow("exact-SHA or capability TTL");
  });
});
