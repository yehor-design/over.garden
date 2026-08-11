import { describe, expect, it, vi } from "vitest";

import { buildAuthenticatedMutationDeploymentReceipt } from "../src/server/authenticated-mutation-deployment-receipt";
import {
  runRemainingDocumentMutationAdmissionSmoke,
  runRemainingDocumentMutationAdmissionSmokeCli,
  type RemainingDocumentMutationEffectCounts,
} from "./smoke-remaining-document-mutation-admission";

const commit = "a".repeat(40);
const ownerACookie = "better-auth.session_token=synthetic-owner-a";
const ownerBCookie = "better-auth.session_token=synthetic-owner-b";
const documentGeneration = "opaque_document_generation_a";
const sourceReceipt = buildAuthenticatedMutationDeploymentReceipt();

describe("OVE-291 remaining document mutation production smoke", () => {
  it("proves exact artifact receipts, owner continuity, rejected mutations, and zero effects", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        const headers = new Headers(init?.headers);

        if (url.endsWith("/api/document-mutation-admission/readback")) {
          return Response.json({
            protocol: "overgarden.document-mutation-generation.v1",
            deploymentSha: commit,
            enforcement: "enabled",
            r2UploadUrlTtl: {
              source: "default",
              effectiveSeconds: 900,
              maximumSeconds: 900,
            },
            authenticatedMutation: sourceReceipt,
          });
        }
        if (url.includes("/api/auth/get-session")) {
          const userId =
            headers.get("cookie") === ownerACookie ? "owner-a" : "owner-b";
          return Response.json({
            session: { id: `session-${userId}` },
            user: { id: userId },
          });
        }
        if (url.endsWith("/api/document-mutation-admission/continuity")) {
          return Response.json(
            { code: "MATCH" },
            { headers: { "cache-control": "private, no-store" } },
          );
        }
        if (
          url.endsWith("/api/notifications/receipts") ||
          url.endsWith("/api/auth/unlink-account")
        ) {
          return Response.json(
            { code: "DOCUMENT_OWNER_CHANGED" },
            {
              status: 409,
              headers: { "cache-control": "private, no-store" },
            },
          );
        }
        if (url.endsWith("/api/auth/sign-in/social")) {
          const body = JSON.parse(String(init?.body)) as { provider?: string };
          if (body.provider === "google") {
            return Response.json({
              url: "https://accounts.google.com/o/oauth2/v2/auth?redacted=1",
            });
          }
          return new Response(null, {
            status: 404,
            headers: { "cache-control": "private, no-store" },
          });
        }
        if (url.endsWith("/api/auth/callback/facebook?code=reject-only")) {
          return new Response(null, {
            status: 404,
            headers: { "cache-control": "private, no-store" },
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    );
    const readEffectCounts = vi.fn(
      async (): Promise<RemainingDocumentMutationEffectCounts> => ({
        notificationReceipts: 0,
        ownerBGoogleAccounts: 1,
        facebookAccounts: 0,
      }),
    );
    const readOwnerDocumentGeneration = vi.fn(async () => ({
      documentGeneration,
      ownerDocumentRendered: true as const,
    }));

    await expect(
      runRemainingDocumentMutationAdmissionSmoke({
        environment: "production",
        mode: "reject-only",
        baseUrl: "https://over-garden-immutable.vercel.app",
        expectedSha: commit,
        families: [
          "remainder",
          "account-disconnect",
          "provider-authority-negative",
        ],
        excludeExplicitGoogleLink: true,
        redacted: true,
        sessions: { ownerACookie, ownerBCookie },
        fetchImpl,
        readEffectCounts,
        readOwnerDocumentGeneration,
      }),
    ).resolves.toMatchObject({
      issue: "OVE-291",
      exactSha: true,
      deploymentReceipts: {
        registryDigestMatch: true,
        enforcementReceiptDigestMatch: true,
        explicitGoogleLinkOwnershipDigestMatch: true,
      },
      rejectionFamilies: {
        remainderUser: true,
        accountDisconnect: true,
      },
      documentContinuity: { ownerDocumentRendered: true },
      providerAuthorities: {
        ordinaryGoogleOpen: true,
        facebookInitiationRetired: true,
        facebookCallbackRetired: true,
        explicitGoogleLinkInvoked: false,
      },
      effects: {
        before: {
          notificationReceipts: 0,
          ownerBGoogleAccounts: 1,
          facebookAccounts: 0,
        },
        digestMatch: true,
      },
    });
    expect(readEffectCounts).toHaveBeenCalledTimes(2);
    expect(readOwnerDocumentGeneration).toHaveBeenCalledOnce();
    expect(
      requests.some((request) => request.url.includes("/api/auth/link-social")),
    ).toBe(false);
  });

  it("fails closed for deployed digest or effect drift", async () => {
    const driftedReceipt = structuredClone(sourceReceipt);
    driftedReceipt.explicitGoogleLink.ownershipDigest = "b".repeat(64);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/document-mutation-admission/readback")) {
        return Response.json({
          protocol: "overgarden.document-mutation-generation.v1",
          deploymentSha: commit,
          enforcement: "enabled",
          authenticatedMutation: driftedReceipt,
        });
      }
      throw new Error("The smoke must stop before any mutation request.");
    });

    await expect(
      runRemainingDocumentMutationAdmissionSmoke({
        environment: "production",
        mode: "reject-only",
        baseUrl: "https://over-garden-immutable.vercel.app",
        expectedSha: commit,
        families: [
          "remainder",
          "account-disconnect",
          "provider-authority-negative",
        ],
        excludeExplicitGoogleLink: true,
        redacted: true,
        sessions: { ownerACookie, ownerBCookie },
        fetchImpl,
        readEffectCounts: vi.fn(),
        readOwnerDocumentGeneration: vi.fn(),
      }),
    ).rejects.toThrow("deployment artifact receipt");
  });

  it("refuses a disconnect proof when owner B has no Google account", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/document-mutation-admission/readback")) {
          return Response.json({
            protocol: "overgarden.document-mutation-generation.v1",
            deploymentSha: commit,
            enforcement: "enabled",
            authenticatedMutation: sourceReceipt,
          });
        }
        if (url.includes("/api/auth/get-session")) {
          const userId =
            new Headers(init?.headers).get("cookie") === ownerACookie
              ? "owner-a"
              : "owner-b";
          return Response.json({
            session: { id: `session-${userId}` },
            user: { id: userId },
          });
        }
        throw new Error("The smoke must stop before any mutation request.");
      },
    );
    const readOwnerDocumentGeneration = vi.fn();

    await expect(
      runRemainingDocumentMutationAdmissionSmoke({
        environment: "production",
        mode: "reject-only",
        baseUrl: "https://over-garden-immutable.vercel.app",
        expectedSha: commit,
        families: [
          "remainder",
          "account-disconnect",
          "provider-authority-negative",
        ],
        excludeExplicitGoogleLink: true,
        redacted: true,
        sessions: { ownerACookie, ownerBCookie },
        fetchImpl,
        readEffectCounts: vi.fn(async () => ({
          notificationReceipts: 0,
          ownerBGoogleAccounts: 0,
          facebookAccounts: 0,
        })),
        readOwnerDocumentGeneration,
      }),
    ).rejects.toThrow("reject-only pre-state was not clean");
    expect(readOwnerDocumentGeneration).not.toHaveBeenCalled();
  });

  it("rejects non-immutable CLI input before loading private sessions", async () => {
    await expect(
      runRemainingDocumentMutationAdmissionSmokeCli({
        argv: [
          "--environment",
          "production",
          "--mode",
          "reject-only",
          "--base-url",
          "https://over.garden",
          "--expected-sha",
          commit,
          "--families",
          "remainder,account-disconnect,provider-authority-negative",
          "--exclude-explicit-google-link",
          "--redacted",
        ],
        env: {},
      }),
    ).rejects.toThrow("immutable Vercel origin");
  });
});
