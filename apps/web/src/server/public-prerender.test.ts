import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  cacheLife: vi.fn(),
  pingDatabase: vi.fn(async () => true),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/cache", () => ({ cacheLife: mocks.cacheLife }));
vi.mock("@/server/health-repository", () => ({
  pingDatabase: mocks.pingDatabase,
}));

import {
  deferFailureToRequest,
  deferWithoutDatabase,
  staticReadsAreAvailable,
  STATIC_PARAMS_PLACEHOLDER,
} from "./public-prerender";

const DATABASE_ENV = [
  "DATABASE_URL",
  "DIRECT_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_HOST",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DATABASE",
] as const;

describe("when a public page gives up being static (ADR-0032 D4)", () => {
  beforeEach(() => {
    mocks.connection.mockClear();
    mocks.pingDatabase.mockReset();
    mocks.pingDatabase.mockResolvedValue(true);
    for (const name of DATABASE_ENV) vi.stubEnv(name, "");
    vi.stubEnv("NEXT_PHASE", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("prerenders when a database is configured", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://reader@db.example/overgarden");
    await deferWithoutDatabase();
    // The unconditional `connection()` this replaced is what made every
    // public page dynamic from its first line.
    expect(mocks.connection).not.toHaveBeenCalled();
    // And at run time nobody asks the database whether it is there: a failed
    // read fails one regeneration, not a build.
    expect(mocks.pingDatabase).not.toHaveBeenCalled();
  });

  it("defers to the request when there is no database to read", async () => {
    await expect(staticReadsAreAvailable()).resolves.toBe(false);
    await deferWithoutDatabase();
    expect(mocks.connection).toHaveBeenCalledTimes(1);
    expect(mocks.pingDatabase).not.toHaveBeenCalled();
  });

  describe("during `next build`", () => {
    beforeEach(() => {
      vi.stubEnv("DATABASE_URL", "postgres://reader@db.example/overgarden");
      vi.stubEnv("NEXT_PHASE", "phase-production-build");
    });

    it("reads when the database answers", async () => {
      await expect(staticReadsAreAvailable()).resolves.toBe(true);
      expect(mocks.pingDatabase).toHaveBeenCalledTimes(1);
    });

    it("does not read a database that refuses the connection", async () => {
      // A rejected cached read aborts the prerender however it is handled, so
      // the question has to be one that cannot reject.
      mocks.pingDatabase.mockRejectedValue(
        Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED",
        }),
      );
      await expect(staticReadsAreAvailable()).resolves.toBe(false);
      await deferWithoutDatabase();
      expect(mocks.connection).toHaveBeenCalledTimes(1);
    });

    it("does not wait for a database that never answers", async () => {
      vi.useFakeTimers();
      mocks.pingDatabase.mockReturnValue(new Promise<boolean>(() => undefined));
      const answer = staticReadsAreAvailable();
      await vi.advanceTimersByTimeAsync(3_000);
      await expect(answer).resolves.toBe(false);
    });
  });

  it("never lets a failure into a prerender", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://reader@db.example/overgarden");
    await deferFailureToRequest();
    expect(mocks.connection).toHaveBeenCalledTimes(1);
  });

  it("samples a spelling no address can have", () => {
    // A handle starts with `@`; a slug is letters, digits and hyphens; a
    // number is digits. None of them is this.
    expect(STATIC_PARAMS_PLACEHOLDER).toMatch(/^__[a-z_]+__$/u);
    expect(STATIC_PARAMS_PLACEHOLDER.startsWith("@")).toBe(false);
  });
});
