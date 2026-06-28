import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { config as loadEnv } from "dotenv";

const envFile = ".env.local";

if (existsSync(envFile)) {
  loadEnv({ path: envFile, quiet: true });
}

if (!process.env.DATABASE_URL) {
  console.error(
    "Missing DATABASE_URL. Start local Postgres or provide a CI service database before checking generated DB types.",
  );
  process.exitCode = 1;
} else {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

async function main() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "overgarden-db-types-"));
  const generatedPath = path.join(process.cwd(), "src/db/generated.ts");
  const tempGeneratedPath = path.join(tempDir, "generated.ts");

  try {
    runCodegen(tempGeneratedPath);

    const [committedTypes, generatedTypes] = await Promise.all([
      readFile(generatedPath, "utf8"),
      readFile(tempGeneratedPath, "utf8"),
    ]);

    if (normalize(committedTypes) !== normalize(generatedTypes)) {
      console.error(
        [
          "Generated DB types are out of date.",
          "Run `pnpm local:bootstrap` and `pnpm db:types`, then commit apps/web/src/db/generated.ts.",
        ].join("\n"),
      );
      process.exitCode = 1;
      return;
    }

    console.log("Generated DB types match the live database schema.");
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

function runCodegen(outFile: string) {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(
    pnpm,
    [
      "exec",
      "kysely-codegen",
      "--dialect",
      "postgres",
      "--out-file",
      outFile,
      "--url",
      "env(DATABASE_URL)",
    ],
    {
      env: process.env,
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`kysely-codegen exited with status ${result.status ?? 1}.`);
  }
}

function normalize(value: string) {
  return value.replaceAll("\r\n", "\n").trimEnd();
}
