import { describe, expect, it } from "vitest";

import {
  resolveDatabaseConnection,
  resolveDatabaseSsl,
  resolveDatabaseSslConfig,
  resolveDirectDatabaseConnection,
  resolvePgConnectionString,
} from "./connection";

describe("direct session resolution", () => {
  const POOLED = "postgresql://app:secret@db.example.test:25061/pool";
  const DIRECT = "postgresql://app:secret@db.example.test:25060/defaultdb";

  it("prefers DIRECT_URL over the pooled connection", () => {
    // Session-level advisory locks and LISTEN/NOTIFY break silently through a
    // transaction pooler, so anything asking for a direct session must not be
    // handed the pooled URL when both are configured.
    expect(
      resolveDirectDatabaseConnection({
        DATABASE_URL: POOLED,
        DIRECT_URL: DIRECT,
      }),
    ).toMatchObject({ connectionString: DIRECT, source: "DIRECT_URL" });
  });

  it("falls back to the pooled resolution when DIRECT_URL is unset", () => {
    // Local development and production-before-the-pooler have no separate
    // direct URL, and there the pooled connection *is* direct.
    expect(
      resolveDirectDatabaseConnection({ DATABASE_URL: POOLED }),
    ).toMatchObject({ connectionString: POOLED, source: "DATABASE_URL" });
  });

  it("treats a blank DIRECT_URL as unset rather than as a connection", () => {
    expect(
      resolveDirectDatabaseConnection({ DATABASE_URL: POOLED, DIRECT_URL: "" }),
    ).toMatchObject({ source: "DATABASE_URL" });
  });

  it("keeps TLS on for a direct connection", () => {
    // `resolveDatabaseSsl` returns false by default for a `DATABASE_URL`
    // source. A direct session must not inherit that exemption, or the lock
    // would travel unencrypted.
    const resolution = resolveDirectDatabaseConnection({ DIRECT_URL: DIRECT });
    expect(resolveDatabaseSsl({ DIRECT_URL: DIRECT }, resolution)).toBe(true);
  });
});

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

  it("uses a configured CA certificate for strict provider TLS", () => {
    const resolution = resolveDatabaseConnection({
      DATABASE_URL:
        "postgresql://app:secret@db.example.test:25060/app?sslmode=require",
    });

    expect(
      resolveDatabaseSslConfig(
        {
          DATABASE_SSL: "true",
          DATABASE_SSL_CA:
            "-----BEGIN CERTIFICATE-----\\nexample\\n-----END CERTIFICATE-----",
        },
        resolution,
      ),
    ).toEqual({
      ca: "-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----",
      rejectUnauthorized: true,
    });
  });

  it("strips sslmode when a CA certificate is configured for node pg", () => {
    const resolution = resolveDatabaseConnection({
      DATABASE_URL:
        "postgresql://app:secret@db.example.test:25060/app?sslmode=require",
    });

    expect(
      resolvePgConnectionString(
        {
          DATABASE_SSL_CA:
            "-----BEGIN CERTIFICATE-----\\nexample\\n-----END CERTIFICATE-----",
        },
        resolution,
      ),
    ).toBe("postgresql://app:secret@db.example.test:25060/app");
  });
});
