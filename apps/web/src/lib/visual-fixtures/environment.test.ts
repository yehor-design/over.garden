import { describe, expect, it } from "vitest";

import {
  resolveVisualFixtureEnvironment,
  tryResolveVisualFixtureEnvironment,
} from "./environment";

const LOCAL_ENV = {
  VISUAL_FIXTURES_ENABLED: "true",
  VISUAL_FIXTURES_TARGET: "local",
  VISUAL_FIXTURES_DATABASE: "overgarden",
  DATABASE_URL:
    "postgresql://overgarden:local-password@localhost:5432/overgarden",
  PUBLIC_SITE_URL: "http://localhost:3000",
  BETTER_AUTH_URL: "http://localhost:3000",
} as const;

describe("visual fixture environment guard", () => {
  it("accepts an explicitly enabled loopback database with a matching name", () => {
    expect(resolveVisualFixtureEnvironment(LOCAL_ENV)).toEqual({
      databaseHostClass: "loopback",
      databaseName: "overgarden",
      target: "local",
    });
  });

  it("fails closed when fixtures are disabled or incomplete", () => {
    expect(() =>
      resolveVisualFixtureEnvironment({
        ...LOCAL_ENV,
        VISUAL_FIXTURES_ENABLED: "false",
      }),
    ).toThrow("Visual fixtures are disabled");
    expect(() =>
      resolveVisualFixtureEnvironment({
        ...LOCAL_ENV,
        VISUAL_FIXTURES_DATABASE: undefined,
      }),
    ).toThrow("VISUAL_FIXTURES_DATABASE");
  });

  it("rejects Vercel Production and canonical production origins unconditionally", () => {
    expect(() =>
      resolveVisualFixtureEnvironment({
        ...LOCAL_ENV,
        VERCEL: "1",
        VERCEL_ENV: "production",
      }),
    ).toThrow("Production");

    expect(() =>
      resolveVisualFixtureEnvironment({
        ...LOCAL_ENV,
        PUBLIC_SITE_URL: "https://over.garden",
      }),
    ).toThrow("canonical production origin");
  });

  it("rejects database-name mismatch and non-loopback local targets", () => {
    expect(() =>
      resolveVisualFixtureEnvironment({
        ...LOCAL_ENV,
        VISUAL_FIXTURES_DATABASE: "another_database",
      }),
    ).toThrow("database name does not match");

    expect(() =>
      resolveVisualFixtureEnvironment({
        ...LOCAL_ENV,
        DATABASE_URL:
          "postgresql://fixture:secret@db.example.test:5432/overgarden",
      }),
    ).toThrow("loopback");
  });

  it("accepts preview only with both Vercel preview and the explicit write gate", () => {
    const preview = {
      ...LOCAL_ENV,
      VISUAL_FIXTURES_TARGET: "preview",
      VISUAL_FIXTURES_ALLOW_PREVIEW: "true",
      DATABASE_URL:
        "postgresql://fixture:secret@preview-db.example.test:5432/overgarden_preview",
      VISUAL_FIXTURES_DATABASE: "overgarden_preview",
      VERCEL: "1",
      VERCEL_ENV: "preview",
      PUBLIC_SITE_URL: "https://over-garden-git-ove187.example.test",
      BETTER_AUTH_URL: "https://over-garden-git-ove187.example.test",
    } as const;

    expect(resolveVisualFixtureEnvironment(preview)).toEqual({
      databaseHostClass: "remote-preview",
      databaseName: "overgarden_preview",
      target: "preview",
    });

    expect(() =>
      resolveVisualFixtureEnvironment({
        ...preview,
        VISUAL_FIXTURES_ALLOW_PREVIEW: "false",
      }),
    ).toThrow("VISUAL_FIXTURES_ALLOW_PREVIEW");
  });

  it("offers a non-throwing route availability check without exposing reasons", () => {
    expect(tryResolveVisualFixtureEnvironment(LOCAL_ENV)).toEqual(
      resolveVisualFixtureEnvironment(LOCAL_ENV),
    );
    expect(
      tryResolveVisualFixtureEnvironment({
        ...LOCAL_ENV,
        VERCEL_ENV: "production",
      }),
    ).toBeNull();
  });
});
