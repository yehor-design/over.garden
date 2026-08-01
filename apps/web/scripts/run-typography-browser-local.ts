import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const LOCAL_PORT = 3_245;
const LOCAL_ORIGIN = `http://127.0.0.1:${LOCAL_PORT}`;
const STARTUP_TIMEOUT_MS = 90_000;
const STOP_TIMEOUT_MS = 5_000;

async function main() {
  const passthrough = process.argv.slice(2).filter((argument) => argument !== "--");
  if (passthrough.includes("--base-url")) {
    throw new Error(
      "test:typography-browser-local owns its loopback base URL; do not pass --base-url.",
    );
  }

  const previewEnv = localPreviewEnvironment();
  await runPnpm(["visual:fixtures:verify"], previewEnv);
  await runPnpm(["build"], previewEnv);

  const preview = spawn(
    pnpmCommand(),
    [
      "exec",
      "next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(LOCAL_PORT),
    ],
    {
      detached: process.platform !== "win32",
      env: previewEnv,
      stdio: "inherit",
    },
  );

  try {
    await waitForHealthyPreview(preview);
    await runPnpm([
      "typography:browser",
      "--base-url",
      LOCAL_ORIGIN,
      ...passthrough,
    ], previewEnv);
  } finally {
    await stopPreview(preview);
  }
}

function pnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function localPreviewEnvironment(): NodeJS.ProcessEnv {
  const currentVersion = "0";
  return {
    ...process.env,
    BETTER_AUTH_CURRENT_SECRET_VERSION: currentVersion,
    BETTER_AUTH_LEGACY_GRACE_UNTIL: "",
    BETTER_AUTH_SECRET: "",
    BETTER_AUTH_SECRETS: `${currentVersion}:${randomBytes(32).toString("base64url")}`,
  };
}

async function runPnpm(args: string[], env: NodeJS.ProcessEnv = process.env) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(pnpmCommand(), args, {
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `pnpm ${args.join(" ")} stopped with ${signal ?? `exit code ${code ?? 1}`}.`,
        ),
      );
    });
  });
}

async function waitForHealthyPreview(preview: ReturnType<typeof spawn>) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError = "preview did not respond";

  while (Date.now() < deadline) {
    if (preview.exitCode !== null) {
      throw new Error(
        `Typography preview exited before becoming healthy (exit code ${preview.exitCode}).`,
      );
    }
    try {
      const paths = ["/", "/__visual-fixtures"];
      const responses = await Promise.all(
        paths.map(async (path) => ({
          path,
          response: await fetch(`${LOCAL_ORIGIN}${path}`, {
            signal: AbortSignal.timeout(2_000),
          }),
        })),
      );
      const failed = responses.find(({ response }) => !response.ok);
      if (!failed) return;
      lastError = `${failed.path} responded with HTTP ${failed.response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Typography preview did not become healthy within ${STARTUP_TIMEOUT_MS}ms: ${lastError}`,
  );
}

async function stopPreview(preview: ReturnType<typeof spawn>) {
  if (preview.exitCode !== null) return;

  try {
    if (process.platform === "win32") {
      preview.kill("SIGTERM");
    } else {
      process.kill(-preview.pid!, "SIGTERM");
    }
  } catch {
    return;
  }

  await Promise.race([
    new Promise<void>((resolve) => preview.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS)),
  ]);

  if (preview.exitCode !== null) return;
  try {
    if (process.platform === "win32") {
      preview.kill("SIGKILL");
    } else {
      process.kill(-preview.pid!, "SIGKILL");
    }
  } catch {
    // The process may have exited between the last observation and this kill.
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
