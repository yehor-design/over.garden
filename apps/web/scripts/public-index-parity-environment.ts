import { existsSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";

type EnvironmentPreparationDependencies = {
  cwd?: string;
  environment?: Readonly<Record<string, string | undefined>>;
  envFileExists?: (path: string) => boolean;
  loadEnvFile?: (options: { path: string }) => unknown;
};

function readFlag(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] ?? null;
}

export function preparePublicIndexParityEnvironment(
  argv: string[],
  dependencies: EnvironmentPreparationDependencies = {},
) {
  const environment = readFlag(argv, "--environment");
  const cwd = dependencies.cwd ?? process.cwd();
  const processEnvironment = dependencies.environment ?? process.env;
  const envFilePath = path.join(cwd, ".env.local");
  const envFileExists = dependencies.envFileExists ?? existsSync;
  const loadEnvFile = dependencies.loadEnvFile ?? loadEnv;

  if (environment === "production") {
    if (envFileExists(envFilePath)) {
      throw new Error(
        "Production parity requires an isolated cwd without .env.local.",
      );
    }
    if (processEnvironment.OVERGARDEN_PRODUCTION_PARITY_ISOLATED !== "1") {
      throw new Error(
        "Production parity requires the isolated production wrapper.",
      );
    }
    return { environment, loadedEnvFile: false } as const;
  }

  loadEnvFile({ path: envFilePath });
  return { environment, loadedEnvFile: true } as const;
}
