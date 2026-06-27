import { describe, expect, it } from "vitest";

import { resolveDatabaseConnection, resolveDatabaseSsl } from "./connection";

describe("database connection resolution", () => {
  it("uses DATABASE_URL first", () => {
    const resolution = resolveDatabaseConnection({
      DATABASE_URL: "postgresql://app:secret@db.example.test/app",
      POSTGRES_URL: "postgresql://provider:secret@db.example.test/provider",
    });

    expect(resolution).toMatchObject({
      connectionString: "postgresql://app:secret@db.example.test/app",
      source: "DATABASE_URL",
    });
  });

  it("falls back to Vercel/Postgres provider URLs", () => {
    expect(
      resolveDatabaseConnection({
        POSTGRES_URL: "postgresql://provider:secret@db.example.test/app",
      }),
    ).toMatchObject({
      connectionString: "postgresql://provider:secret@db.example.test/app",
      source: "POSTGRES_URL",
    });

    expect(
      resolveDatabaseConnection({
        POSTGRES_PRISMA_URL: "postgresql://prisma:secret@db.example.test/app",
      }),
    ).toMatchObject({
      connectionString: "postgresql://prisma:secret@db.example.test/app",
      source: "POSTGRES_PRISMA_URL",
    });
  });

  it("constructs a provider URL from Postgres components without leaking values", () => {
    const resolution = resolveDatabaseConnection({
      POSTGRES_HOST: "db.example.test:5432",
      POSTGRES_USER: "app user",
      POSTGRES_PASSWORD: "secret/pass",
      POSTGRES_DATABASE: "over garden",
    });

    expect(resolution.source).toBe("POSTGRES_COMPONENTS");
    expect(resolution.connectionString).toBe(
      "postgresql://app%20user:secret%2Fpass@db.example.test:5432/over%20garden",
    );
  });

  it("treats empty Vercel env placeholders as missing", () => {
    expect(
      resolveDatabaseConnection({
        POSTGRES_URL: '""',
        POSTGRES_URL_NON_POOLING: "''",
      }),
    ).toEqual({ source: "missing" });
  });

  it("keeps local database SSL off and provider fallback SSL on by default", () => {
    const local = resolveDatabaseConnection({
      DATABASE_URL: "postgresql://overgarden:overgarden@localhost:5432/app",
    });
    const provider = resolveDatabaseConnection({
      POSTGRES_URL: "postgresql://provider:secret@db.example.test/app",
    });

    expect(resolveDatabaseSsl({}, local)).toBe(false);
    expect(resolveDatabaseSsl({}, provider)).toBe(true);
    expect(resolveDatabaseSsl({ DATABASE_SSL: "false" }, provider)).toBe(false);
    expect(resolveDatabaseSsl({ DATABASE_SSL: "true" }, local)).toBe(true);
  });
});
