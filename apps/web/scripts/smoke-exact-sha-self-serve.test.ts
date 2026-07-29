import { describe, expect, it } from "vitest";

import { runExactShaSelfServeSmoke } from "./smoke-exact-sha-self-serve";

const commit = "a".repeat(40);

function response(
  html = '<main data-garden-workspace="guest" data-garden-profile-auth-shell="guest"></main>',
) {
  return new Response(html, { status: 200 });
}

describe("exact SHA self-serve smoke", () => {
  it("requires matching production identity and a rendered guest shell on both origins", async () => {
    const fetchImpl = async () => response();

    await expect(
      runExactShaSelfServeSmoke({
        environment: "production",
        confirmedEnvironment: "production",
        baseUrl: "https://over.garden",
        immutableDeploymentUrl: "https://over-garden-example.vercel.app",
        expectedCommitSha: commit,
        deployedCommitSha: commit,
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      issue: "OVE-226",
      commitMatch: true,
      canonicalGarden: { status: 200, guestShell: true },
      immutableGarden: { status: 200, guestShell: true },
      canonicalProfileAuth: { status: 200, guestAuthShell: true },
      immutableProfileAuth: { status: 200, guestAuthShell: true },
    });
  });

  it("fails closed for deployment drift, non-production execution, or a non-shell response", async () => {
    await expect(
      runExactShaSelfServeSmoke({
        environment: "production",
        confirmedEnvironment: "production",
        baseUrl: "https://over.garden",
        immutableDeploymentUrl: "https://over-garden-example.vercel.app",
        expectedCommitSha: commit,
        deployedCommitSha: "b".repeat(40),
        fetchImpl: async () => response(),
      }),
    ).rejects.toThrow("does not match");

    await expect(
      runExactShaSelfServeSmoke({
        environment: "preview",
        confirmedEnvironment: "preview",
        baseUrl: "https://over.garden",
        immutableDeploymentUrl: "https://over-garden-example.vercel.app",
        expectedCommitSha: commit,
        deployedCommitSha: commit,
        fetchImpl: async () => response(),
      }),
    ).rejects.toThrow("Requires --environment production");

    await expect(
      runExactShaSelfServeSmoke({
        environment: "production",
        confirmedEnvironment: "production",
        baseUrl: "https://over.garden",
        immutableDeploymentUrl: "https://over-garden-example.vercel.app",
        expectedCommitSha: commit,
        deployedCommitSha: commit,
        fetchImpl: async () => response("<main>error shell</main>"),
      }),
    ).rejects.toThrow("guest shell");
  });
});
