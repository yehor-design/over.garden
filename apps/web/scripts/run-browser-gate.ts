/**
 * Runs the browser gate: every spec in `BROWSER_GATE_SPECS`, against a
 * production server this script starts and stops (`OVE-462`).
 *
 * It exists so that CI and a laptop run the same list the same way. They did
 * not: CI ran its own list against `next start`, and `pnpm gates:browser` ran
 * another against the `next dev` server Playwright's config starts — while the
 * specs' own headers said "against a production build", because a dev server
 * does not take the prerender, postpone and resume path most of them are about.
 *
 *   pnpm build && pnpm gates:browser            # a laptop, local infra env
 *   pnpm exec tsx scripts/run-browser-gate.ts   # CI, after its Build step
 *
 * `--shard=1/2` is handed to Playwright as is. `--port=3179` moves the server.
 * `--spec=static-documents.spec.ts` runs one spec of the gate, the same way.
 * `--workers=2` is the default, on every machine: it is what a CI runner gives
 * Playwright, and Better Auth answers 429 to the fourth sign-up in a window —
 * seven workers on a laptop failed three specs that pass at two.
 *
 * What the server is started with, and why here rather than in a YAML string:
 * Better Auth checks the request origin against `BETTER_AUTH_URL`, so it must
 * be the origin the server answers on; the owner surfaces are gated on a user
 * id the process reads at start, so the sealed account is written first
 * (`owner:seed-browser-fixture`); and the retention proof drives the purge
 * through the cron ingress, which takes a secret both sides have to hold — a
 * fresh one per run, never printed.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { OWNER_BROWSER_FIXTURE } from "../tests/helpers/owner-fixture";
import { BROWSER_GATE_SPECS } from "./browser-gate-specs";

const READY_PATH = "/journals";
const READY_TIMEOUT_MS = 90_000;

function readOption(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

async function waitUntilReady(origin: string, server: ChildProcess) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`The server exited with code ${server.exitCode}.`);
    }
    try {
      const response = await fetch(`${origin}${READY_PATH}`, {
        redirect: "manual",
      });
      if (response.status === 200) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`${origin}${READY_PATH} did not answer 200 in time.`);
}

async function main() {
  const rootDir = fileURLToPath(new URL("..", import.meta.url));
  const port = readOption("port") ?? "3179";
  const shard = readOption("shard");
  const only = readOption("spec");
  const workers = readOption("workers") ?? "2";
  if (only && !(BROWSER_GATE_SPECS as readonly string[]).includes(only)) {
    throw new Error(`${only} is not in BROWSER_GATE_SPECS.`);
  }
  const specs = only ? [only] : [...BROWSER_GATE_SPECS];
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    BETTER_AUTH_URL: origin,
    PUBLIC_SITE_URL: origin,
    OVERGARDEN_ADMIN_OWNER_USER_ID: OWNER_BROWSER_FIXTURE.userId,
    CRON_SECRET: randomBytes(32).toString("base64url"),
    NEXT_TELEMETRY_DISABLED: "1",
  };

  const seeded = spawnSync("pnpm", ["owner:seed-browser-fixture"], {
    cwd: rootDir,
    env,
    stdio: "inherit",
  });
  if (seeded.status !== 0) {
    throw new Error("The sealed owner account could not be written.");
  }

  // No `--hostname`: with it the author-scoped rewrite re-enters the proxy and
  // a public address answers 308 to itself. And `next` itself rather than
  // `pnpm exec next`: a signal sent to the wrapper does not reach the server,
  // which then keeps the port after this script has gone.
  const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
  const server = spawn(process.execPath, [nextBin, "start", "-p", port], {
    cwd: rootDir,
    env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  let exitCode = 1;
  try {
    await waitUntilReady(origin, server);
    const playwright = spawnSync(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        ...specs.map((spec) => `tests/${spec}`),
        `--workers=${workers}`,
        ...(shard ? [`--shard=${shard}`] : []),
      ],
      {
        cwd: rootDir,
        env: { ...env, PLAYWRIGHT_BASE_URL: origin },
        stdio: "inherit",
      },
    );
    exitCode = playwright.status ?? 1;
  } finally {
    server.kill("SIGTERM");
  }
  process.exit(exitCode);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
