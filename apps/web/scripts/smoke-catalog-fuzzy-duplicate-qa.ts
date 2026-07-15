import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { config as loadEnv } from "dotenv";

import {
  resolveDatabaseConnection,
  resolvePgConnectionString,
} from "../src/db/connection";

loadEnv({ path: ".env.local", override: false, quiet: true });

const mode = process.argv[2] ?? "--prove";
if (!new Set(["--prove", "--seed-ui", "--reset-ui"]).has(mode)) {
  throw new Error("Expected --prove, --seed-ui, or --reset-ui");
}

const resolution = resolveDatabaseConnection(process.env);
const connectionString = resolvePgConnectionString(process.env, resolution);
if (!connectionString) {
  throw new Error("Missing supported database connection env");
}

const result = spawnSync(
  "uv",
  [
    "run",
    "--frozen",
    "python",
    "-m",
    "scripts.smoke_catalog_fuzzy_duplicate_qa",
    mode,
  ],
  {
    cwd: path.resolve(process.cwd(), "../../services/matching"),
    env: { ...process.env, DIRECT_URL: connectionString },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
