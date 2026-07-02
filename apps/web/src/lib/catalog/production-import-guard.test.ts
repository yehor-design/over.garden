import { describe, expect, it } from "vitest";

import {
  classifyCatalogProductionImportConnection,
  parseCatalogProductionImportArgs,
  validateCatalogProductionImportDatabaseTarget,
  validateCatalogProductionImportOptions,
} from "./production-import-guard";

describe("catalog production import guard", () => {
  it("defaults to a local-only import target", () => {
    const options = validateCatalogProductionImportOptions(
      parseCatalogProductionImportArgs([]),
    );

    expect(options).toEqual({
      environment: "local",
      confirmEnvironment: "local",
      baseUrl: "http://localhost:3000",
      allowNonLocalMutation: false,
    });
    expect(() =>
      validateCatalogProductionImportDatabaseTarget(options, "local"),
    ).not.toThrow();
    expect(() =>
      validateCatalogProductionImportDatabaseTarget(options, "non_local"),
    ).toThrow("Local production import must use a local database.");
  });

  it("requires explicit production confirmation before non-local mutation", () => {
    expect(() =>
      validateCatalogProductionImportOptions(
        parseCatalogProductionImportArgs([
          "--environment",
          "production",
          "--base-url",
          "https://over.garden",
          "--allow-non-local-mutation",
        ]),
      ),
    ).toThrow("--confirm-environment must exactly match --environment.");

    expect(() =>
      validateCatalogProductionImportOptions(
        parseCatalogProductionImportArgs([
          "--environment",
          "production",
          "--confirm-environment",
          "production",
          "--base-url",
          "https://over.garden",
        ]),
      ),
    ).toThrow(
      "Non-local production import requires --allow-non-local-mutation.",
    );
  });

  it("requires HTTPS and a non-local database for production imports", () => {
    expect(() =>
      validateCatalogProductionImportOptions(
        parseCatalogProductionImportArgs([
          "--environment",
          "production",
          "--confirm-environment",
          "production",
          "--base-url",
          "http://over.garden",
          "--allow-non-local-mutation",
        ]),
      ),
    ).toThrow("Non-local production import must use an HTTPS base URL.");

    const options = validateCatalogProductionImportOptions(
      parseCatalogProductionImportArgs([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--base-url",
        "https://over.garden/garden?x=1#fragment",
        "--allow-non-local-mutation",
      ]),
    );

    expect(options.baseUrl).toBe("https://over.garden");
    expect(() =>
      validateCatalogProductionImportDatabaseTarget(options, "local"),
    ).toThrow("Non-local production import must use a non-local database.");
    expect(() =>
      validateCatalogProductionImportDatabaseTarget(options, "non_local"),
    ).not.toThrow();
  });

  it("classifies local and non-local database connection strings", () => {
    expect(
      classifyCatalogProductionImportConnection(
        "postgres://user:pass@localhost:5432/overgarden",
      ),
    ).toBe("local");
    expect(
      classifyCatalogProductionImportConnection(
        "postgres://user:pass@db.example.internal:5432/overgarden",
      ),
    ).toBe("non_local");
  });
});
