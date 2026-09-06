import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  readCurationDigestSummary: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/catalog-curation-repository", () => ({
  readCurationDigestSummary: mocks.readCurationDigestSummary,
}));
vi.mock("kysely", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kysely")>();
  return {
    ...actual,
    sql: Object.assign(
      (...args: unknown[]) => ({
        execute: () => mocks.execute(...args),
      }),
      actual.sql,
    ),
  };
});

import { GET, POST } from "./route";

function request(secret?: string) {
  return new Request("https://over.garden/api/cron/catalog-digest", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe("weekly catalog digest cron (ADR-0026 D10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.execute.mockResolvedValue({ rows: [{ id: "outbox-1" }] });
  });

  it("refuses an unauthenticated caller on GET and POST", async () => {
    for (const handler of [GET, POST]) {
      const response = await handler(request());
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    }
    expect(mocks.readCurationDigestSummary).not.toHaveBeenCalled();

    const wrong = await GET(request("not-the-secret"));
    expect(wrong.status).toBe(401);
  });

  it("enqueues one email when there is something to decide, with counts only", async () => {
    mocks.readCurationDigestSummary.mockResolvedValue({
      openItems: 4,
      newItems: 2,
      withGardenerObjects: 3,
      autoAppliedItems: 1,
    });

    const response = await GET(request("cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      issue: "OVE-391",
      digest: {
        enqueued: true,
        openItems: 4,
        newItems: 2,
        withGardenerObjects: 3,
        autoAppliedItems: 1,
      },
    });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    // The response is read from logs: numbers, never a name or a label.
    expect(JSON.stringify(body)).not.toMatch(/[А-Яа-яЇїІіЄєҐґ]/u);
  });

  it("enqueues nothing when there is nothing to decide", async () => {
    mocks.readCurationDigestSummary.mockResolvedValue({
      openItems: 0,
      newItems: 0,
      withGardenerObjects: 0,
      autoAppliedItems: 0,
    });

    const response = await GET(request("cron-secret"));

    expect(await response.json()).toEqual({
      ok: true,
      issue: "OVE-391",
      digest: { enqueued: false, reason: "nothing_to_decide" },
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("reports enqueued false when the outbox already holds an unsent digest", async () => {
    mocks.readCurationDigestSummary.mockResolvedValue({
      openItems: 4,
      newItems: 0,
      withGardenerObjects: 0,
      autoAppliedItems: 0,
    });
    mocks.execute.mockResolvedValue({ rows: [] });

    const body = await (await GET(request("cron-secret"))).json();

    expect(body.digest.enqueued).toBe(false);
  });

  it("answers 503 without detail when the database is away", async () => {
    mocks.readCurationDigestSummary.mockRejectedValue(new Error("connection refused"));

    const response = await GET(request("cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      issue: "OVE-391",
      digest: { lifecycleClass: "unavailable" },
    });
    expect(JSON.stringify(body)).not.toContain("connection refused");
  });
});
