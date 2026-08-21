import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

type ProductionParityRunnerDependencies = {
  webRoot: string;
  environment?: Readonly<Record<string, string | undefined>>;
  makeTempDirectory?: (prefix: string) => string;
  removeTempDirectory?: (path: string) => void;
  spawn?: typeof spawnSync;
};

const LOCAL_BINDING_ENVIRONMENT_KEYS = [
  "DATABASE_POOL_MAX",
  "DATABASE_SSL",
  "DATABASE_SSL_CA",
  "DATABASE_URL",
  "DIRECT_URL",
  "DOTENV_CONFIG_OVERRIDE",
  "DOTENV_CONFIG_PATH",
  "MATCHING_SERVICE_TOKEN",
  "MATCHING_SERVICE_URL",
  "MEILISEARCH_API_KEY",
  "MEILISEARCH_HOST",
  "NODE_OPTIONS",
] as const;

function productionProviderEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const sanitized = Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  for (const name of LOCAL_BINDING_ENVIRONMENT_KEYS) delete sanitized[name];
  sanitized.NODE_ENV ??= "production";
  sanitized.OVERGARDEN_PRODUCTION_PARITY_ISOLATED = "1";
  return sanitized as NodeJS.ProcessEnv;
}

export function runProductionPublicIndexParity(
  argv: string[],
  dependencies: ProductionParityRunnerDependencies,
) {
  const makeTempDirectory =
    dependencies.makeTempDirectory ?? ((prefix) => mkdtempSync(prefix));
  const removeTempDirectory =
    dependencies.removeTempDirectory ??
    ((directory) => rmSync(directory, { recursive: true, force: true }));
  const spawn = dependencies.spawn ?? spawnSync;
  const operatorDirectory = makeTempDirectory(
    path.join(os.tmpdir(), "overgarden-public-index-production-"),
  );

  try {
    const result = spawn(
      "pnpm",
      [
        "dlx",
        "vercel@59.3.0",
        "env",
        "run",
        "-e",
        "production",
        "--project",
        "over-garden",
        "--scope",
        "yehors-projects-01221e2b",
        "--",
        "env",
        "NODE_OPTIONS=--conditions=react-server",
        path.join(dependencies.webRoot, "node_modules/.bin/tsx"),
        "--tsconfig",
        path.join(dependencies.webRoot, "tsconfig.json"),
        path.join(dependencies.webRoot, "scripts/smoke-public-index-parity.ts"),
        ...argv,
      ],
      {
        cwd: operatorDirectory,
        env: productionProviderEnvironment(
          dependencies.environment ?? process.env,
        ),
        stdio: "inherit",
      },
    );
    if (result.error) throw result.error;
    return result.status ?? 1;
  } finally {
    removeTempDirectory(operatorDirectory);
  }
}
