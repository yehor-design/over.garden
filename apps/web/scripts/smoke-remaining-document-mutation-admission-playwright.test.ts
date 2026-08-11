import { afterEach, describe, expect, it, vi } from "vitest";

const fakeDatabaseState = vi.hoisted(() => ({
  destroyed: false,
}));

vi.mock("kysely", () => {
  class FakeQuery {
    private providerId: string | undefined;

    constructor(private readonly table: string) {}

    select() {
      return this;
    }

    where(column: string, _operator: string, value: string) {
      if (column === "providerId") this.providerId = value;
      return this;
    }

    async executeTakeFirstOrThrow() {
      if (this.table === "account" && this.providerId === "google") {
        return { count: 1 };
      }
      return { count: 0 };
    }
  }

  class FakeKysely {
    selectFrom(table: string) {
      return new FakeQuery(table);
    }

    async destroy() {
      fakeDatabaseState.destroyed = true;
    }
  }

  return {
    Kysely: FakeKysely,
    PostgresDialect: class FakePostgresDialect {},
  };
});

vi.mock("pg", () => ({
  Pool: class FakePool {},
}));

vi.mock("playwright", () => {
  const generationFields = {
    count: async () => 2,
    first: () => ({ inputValue: async () => "opaque_document_generation_a" }),
  };
  const page = {
    goto: async () => ({ ok: () => true }),
    locator: (selector: string) => {
      if (selector === 'input[name="__overgardenDocumentGeneration"]') {
        return generationFields;
      }
      throw new Error(`Unexpected locator: ${selector}`);
    },
  };
  const context = {
    addCookies: async () => undefined,
    close: async () => undefined,
    newPage: async () => page,
  };
  return {
    chromium: {
      launch: async () => ({
        close: async () => undefined,
        newContext: async () => context,
      }),
    },
  };
});

import { buildAuthenticatedMutationDeploymentReceipt } from "../src/server/authenticated-mutation-deployment-receipt";
import { runRemainingDocumentMutationAdmissionSmokeCli } from "./smoke-remaining-document-mutation-admission";

const commit = "a".repeat(40);
const ownerACookie = "better-auth.session_token=synthetic-owner-a";
const ownerBCookie = "better-auth.session_token=synthetic-owner-b";
const sourceReceipt = buildAuthenticatedMutationDeploymentReceipt();

describe("OVE-291 signed owner-document production journey", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    fakeDatabaseState.destroyed = false;
  });

  it("reads one signed owner mutation form without submitting it", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);

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
    vi.stubGlobal("fetch", fetchImpl);

    await expect(
      runRemainingDocumentMutationAdmissionSmokeCli({
        argv: [
          "--environment",
          "production",
          "--mode",
          "reject-only",
          "--base-url",
          "https://over-garden-immutable.vercel.app",
          "--expected-sha",
          commit,
          "--families",
          "remainder,account-disconnect,provider-authority-negative",
          "--exclude-explicit-google-link",
          "--redacted",
        ],
        env: {
          DATABASE_URL: "postgres://smoke:smoke@db.example.com/overgarden",
          OVE291_SESSION_A_COOKIE: ownerACookie,
          OVE291_SESSION_B_COOKIE: ownerBCookie,
        },
      }),
    ).resolves.toMatchObject({
      documentContinuity: { ownerDocumentRendered: true },
      effects: { digestMatch: true },
    });
    expect(fakeDatabaseState.destroyed).toBe(true);
  });
});
