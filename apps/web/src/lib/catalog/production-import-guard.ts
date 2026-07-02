export const CATALOG_PRODUCTION_IMPORT_ENVIRONMENTS = [
  "local",
  "staging",
  "preview",
  "production",
] as const;

export type CatalogProductionImportEnvironment =
  (typeof CATALOG_PRODUCTION_IMPORT_ENVIRONMENTS)[number];

export interface CatalogProductionImportOptions {
  environment: CatalogProductionImportEnvironment;
  confirmEnvironment: CatalogProductionImportEnvironment;
  baseUrl: string;
  allowNonLocalMutation: boolean;
}

export type CatalogProductionImportConnectionKind = "local" | "non_local";

export function parseCatalogProductionImportArgs(
  argv: string[],
): Partial<CatalogProductionImportOptions> {
  const options: Partial<CatalogProductionImportOptions> = {
    allowNonLocalMutation: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;

    switch (arg) {
      case "--environment":
        options.environment = parseEnvironment(argv[index + 1], arg);
        index += 1;
        break;
      case "--confirm-environment":
        options.confirmEnvironment = parseEnvironment(argv[index + 1], arg);
        index += 1;
        break;
      case "--base-url":
        options.baseUrl = argv[index + 1];
        index += 1;
        break;
      case "--allow-non-local-mutation":
        options.allowNonLocalMutation = true;
        break;
      default:
        throw new Error(`Unsupported option: ${arg}`);
    }
  }

  return options;
}

export function validateCatalogProductionImportOptions(
  options: Partial<CatalogProductionImportOptions>,
): CatalogProductionImportOptions {
  const environment = options.environment ?? "local";
  const confirmEnvironment = options.confirmEnvironment ?? "local";
  const baseUrl = normalizeBaseUrl(
    options.baseUrl ??
      (environment === "local"
        ? "http://localhost:3000"
        : fail("Missing --base-url for non-local production import.")),
  );

  if (environment !== confirmEnvironment) {
    throw new Error("--confirm-environment must exactly match --environment.");
  }

  const url = new URL(baseUrl);
  if (environment === "local") {
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error("Local production-import proof must use a local app URL.");
    }
  } else {
    if (!options.allowNonLocalMutation) {
      throw new Error(
        "Non-local production import requires --allow-non-local-mutation.",
      );
    }
    if (url.protocol !== "https:") {
      throw new Error("Non-local production import must use an HTTPS base URL.");
    }
  }

  return {
    environment,
    confirmEnvironment,
    baseUrl,
    allowNonLocalMutation: options.allowNonLocalMutation ?? false,
  };
}

export function validateCatalogProductionImportDatabaseTarget(
  options: CatalogProductionImportOptions,
  connectionKind: CatalogProductionImportConnectionKind,
) {
  if (options.environment === "local" && connectionKind !== "local") {
    throw new Error("Local production import must use a local database.");
  }
  if (options.environment !== "local" && connectionKind !== "non_local") {
    throw new Error(
      "Non-local production import must use a non-local database.",
    );
  }
}

export function classifyCatalogProductionImportConnection(
  connectionString: string,
): CatalogProductionImportConnectionKind {
  return isLocalConnectionString(connectionString) ? "local" : "non_local";
}

function parseEnvironment(
  value: string | undefined,
  optionName: string,
): CatalogProductionImportEnvironment {
  if (
    CATALOG_PRODUCTION_IMPORT_ENVIRONMENTS.includes(
      value as CatalogProductionImportEnvironment,
    )
  ) {
    return value as CatalogProductionImportEnvironment;
  }

  throw new Error(
    `${optionName} must be one of: ${CATALOG_PRODUCTION_IMPORT_ENVIRONMENTS.join(
      ", ",
    )}.`,
  );
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function fail(message: string): never {
  throw new Error(message);
}

function isLocalConnectionString(value: string) {
  return (
    value.includes("localhost") ||
    value.includes("127.0.0.1") ||
    value.includes("0.0.0.0")
  );
}
