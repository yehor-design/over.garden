import { beforeEach, describe, expect, it, vi } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  resolveEnvironment: vi.fn(),
}));

vi.mock("@/lib/visual-fixtures/environment", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/visual-fixtures/environment")>();
  return {
    ...original,
    tryResolveVisualFixtureEnvironment: mocks.resolveEnvironment,
  };
});

vi.mock("@/server/visual-fixtures/journal-creation-evidence", () => ({
  executeVisualJournalCreationEvidence: mocks.execute,
}));

describe("POST /api/__visual-fixtures/journal-creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveEnvironment.mockReturnValue({
      databaseHostClass: "loopback",
      databaseName: "overgarden",
      objectStoreHostClass: "loopback",
      target: "local",
    });
    mocks.execute.mockResolvedValue({
      action: "run",
      scenarioId: "ove182-c001",
      postSavePath: "/garden/objects/result",
    });
  });

  it("runs only a trusted manifest scenario on a matching non-production origin", async () => {
    const scenario = VISUAL_FIXTURE_MANIFEST.creationEvidence.scenarios[0];
    const { POST } = await import("./route");
    const response = await POST(
      requestFor("http://localhost:3000", {
        action: "run",
        scenarioId: scenario.id,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.execute).toHaveBeenCalledWith("run", scenario);
  });

  it("hard-404s a local fixture write requested through a public origin", async () => {
    const scenario = VISUAL_FIXTURE_MANIFEST.creationEvidence.scenarios[0];
    const { POST } = await import("./route");
    const response = await POST(
      requestFor("https://over.garden", {
        action: "run",
        scenarioId: scenario.id,
      }),
    );

    expect(response.status).toBe(404);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects arbitrary ids and actions without reaching the repository", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      requestFor("http://127.0.0.1:3000", {
        action: "delete-everything",
        scenarioId: "not-in-manifest",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("accepts only the exact configured preview host", async () => {
    const { requestOriginMatchesEnvironment } = await import("./route");
    const environment = {
      databaseHostClass: "remote-preview",
      databaseName: "overgarden-preview",
      objectStoreHostClass: "remote-preview",
      target: "preview",
    } as const;
    const env = {
      PUBLIC_SITE_URL: "https://ove-182-preview.vercel.app",
      BETTER_AUTH_URL: "https://ove-182-preview.vercel.app",
    };

    expect(
      requestOriginMatchesEnvironment(
        new Request("https://ove-182-preview.vercel.app/api/test"),
        environment,
        env,
      ),
    ).toBe(true);
    expect(
      requestOriginMatchesEnvironment(
        new Request("https://attacker.example/api/test"),
        environment,
        env,
      ),
    ).toBe(false);
  });
});

function requestFor(origin: string, body: unknown) {
  return new Request(`${origin}/api/__visual-fixtures/journal-creation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
