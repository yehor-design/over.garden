import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  EPPO_DATA_PORTAL_API_KEY_ENV,
  EPPO_LEGACY_CREDENTIAL_ENV_NAMES,
  assertValidEppoCredential,
  eppoCredentialFingerprintPrefix,
} from "../src/server/catalog-source/eppo-credentials";
import {
  EPPO_LYPES_OPERATION_ID,
  EPPO_REQUEST_TIMEOUT_MS,
  type EppoApiAccessReceipt,
  type EppoOpenApiContract,
  inspectOfficialEppoOpenApi,
  verifyEppoApiAccess,
} from "./verify-eppo-api-access";

export const EPPO_SETUP_ENVIRONMENT = "production";
export const EPPO_SETUP_DEADLINE_MS = 90_000;
export const EPPO_SETUP_LOCK_ENV = "EPPO_DATA_PORTAL_API_KEY_SETUP_LOCK";
export const EPPO_RUNTIME_VERIFICATION_ATTEMPTS = 3;
export const EPPO_RUNTIME_VERIFICATION_RETRY_DELAY_MS = 1_000;

export type EppoCredentialSetupResult =
  | EppoCredentialSetupPlan
  | EppoCredentialSetupReceipt
  | { class: "credential_setup_already_running" };

export interface EppoCredentialSetupPlan {
  class: "plan_ready";
  currentMainSha: string;
  openApiDigest: string;
  operationId: typeof EPPO_LYPES_OPERATION_ID;
  environment: typeof EPPO_SETUP_ENVIRONMENT;
  secretName: typeof EPPO_DATA_PORTAL_API_KEY_ENV;
  targetState: "missing" | "present";
  approvalDigest: string;
  rollback: "remove_new_value_or_restore_previous_value";
}

export interface EppoCredentialSetupReceipt extends Omit<
  EppoCredentialSetupPlan,
  "class" | "approvalDigest" | "rollback"
> {
  class: "completed" | "already_configured_and_verified";
  fingerprintPrefix: string;
  candidateHttpStatusClass: "2xx";
  runtimeHttpStatusClass: "2xx";
  durationMs: number;
  cleanup: "completed";
}

export interface EppoTargetSnapshot {
  canonical: "missing" | "present";
  legacyAliasConfigured: boolean;
}

export interface EppoCredentialTarget {
  inspect(): Promise<EppoTargetSnapshot>;
  acquireTargetLock(): Promise<boolean>;
  releaseTargetLock(): Promise<void>;
  readCurrentCredential(): Promise<Buffer | null>;
  writeCredential(credential: Buffer): Promise<void>;
  removeCredential(): Promise<void>;
  verifyRuntime(): Promise<EppoApiAccessReceipt>;
}

export interface EppoCredentialSetupDependencies {
  target: EppoCredentialTarget;
  currentMainSha: () => Promise<string>;
  inspectOpenApi?: () => Promise<EppoOpenApiContract>;
  verifyCandidate?: (credential: string) => Promise<EppoApiAccessReceipt>;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface EppoCredentialSetupInput {
  environment: string;
  confirmEnvironment: string;
  apply: boolean;
  credential?: string;
}

export class EppoCredentialSetupError extends Error {
  constructor(
    readonly code:
      | "invalid_environment"
      | "legacy_alias_configured"
      | "missing_credential"
      | "invalid_credential"
      | "credential_setup_deadline_exceeded"
      | "target_write_failed"
      | "runtime_verification_failed"
      | "rollback_failed",
  ) {
    super(`EPPO credential setup failed: ${code}`);
    this.name = "EppoCredentialSetupError";
  }
}

let setupInProgress = false;

export async function setupEppoCredentials(
  input: EppoCredentialSetupInput,
  dependencies: EppoCredentialSetupDependencies,
): Promise<EppoCredentialSetupResult> {
  if (setupInProgress) {
    return { class: "credential_setup_already_running" };
  }
  setupInProgress = true;

  let candidateBuffer: Buffer | undefined;
  let previousCredential: Buffer | null = null;
  let releaseLocalLock: (() => Promise<void>) | undefined;
  let targetLockAcquired = false;
  try {
    assertProductionEnvironment(input);
    const now = dependencies.now ?? Date.now;
    const sleep = dependencies.sleep ?? defaultSleep;
    const startedAt = now();
    const targetState = await dependencies.target.inspect();
    if (targetState.legacyAliasConfigured) {
      throw new EppoCredentialSetupError("legacy_alias_configured");
    }
    const contract = await (
      dependencies.inspectOpenApi ?? inspectOfficialEppoOpenApi
    )();
    const plan = createPlan(
      await dependencies.currentMainSha(),
      contract,
      targetState.canonical,
    );

    if (!input.apply) return plan;

    const acquiredLocalLock = await acquireLocalLock();
    if (!acquiredLocalLock) {
      return { class: "credential_setup_already_running" };
    }
    releaseLocalLock = acquiredLocalLock;
    targetLockAcquired = await dependencies.target.acquireTargetLock();
    if (!targetLockAcquired) {
      return { class: "credential_setup_already_running" };
    }

    const credential = assertCredentialForSetup(input.credential);
    candidateBuffer = Buffer.from(credential, "utf8");
    const candidateReceipt = await (
      dependencies.verifyCandidate ?? verifyEppoApiAccess
    )(credential);
    assertWithinDeadline(startedAt, now);

    if (targetState.canonical === "present") {
      previousCredential = await dependencies.target.readCurrentCredential();
      if (!previousCredential) {
        throw new EppoCredentialSetupError("runtime_verification_failed");
      }
      const previous = previousCredential.toString("utf8");
      if (
        eppoCredentialFingerprintPrefix(previous) ===
        eppoCredentialFingerprintPrefix(credential)
      ) {
        const runtimeReceipt = await verifyRuntimeWithPropagationRetry(
          dependencies.target,
          startedAt,
          now,
          sleep,
        );
        return completedReceipt(
          "already_configured_and_verified",
          plan,
          credential,
          candidateReceipt,
          runtimeReceipt,
          startedAt,
          now,
        );
      }
    }

    try {
      await dependencies.target.writeCredential(candidateBuffer);
    } catch {
      throw new EppoCredentialSetupError("target_write_failed");
    }
    assertWithinDeadline(startedAt, now);

    try {
      const runtimeReceipt = await verifyRuntimeWithPropagationRetry(
        dependencies.target,
        startedAt,
        now,
        sleep,
      );
      return completedReceipt(
        "completed",
        plan,
        credential,
        candidateReceipt,
        runtimeReceipt,
        startedAt,
        now,
      );
    } catch {
      try {
        if (previousCredential) {
          await dependencies.target.writeCredential(previousCredential);
        } else {
          await dependencies.target.removeCredential();
        }
      } catch {
        throw new EppoCredentialSetupError("rollback_failed");
      }
      throw new EppoCredentialSetupError("runtime_verification_failed");
    }
  } finally {
    candidateBuffer?.fill(0);
    previousCredential?.fill(0);
    if (targetLockAcquired) {
      await dependencies.target.releaseTargetLock();
    }
    await releaseLocalLock?.();
    setupInProgress = false;
  }
}

async function acquireLocalLock(): Promise<(() => Promise<void>) | null> {
  const lockPath = path.join(
    tmpdir(),
    "overgarden-eppo-production-credential-bootstrap.lock",
  );
  try {
    const handle = await open(lockPath, "wx", 0o600);
    return async () => {
      await handle.close();
      await rm(lockPath, { force: true });
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      return null;
    }
    throw new EppoCredentialSetupError("runtime_verification_failed");
  }
}

function assertProductionEnvironment(input: EppoCredentialSetupInput) {
  if (
    input.environment !== EPPO_SETUP_ENVIRONMENT ||
    input.confirmEnvironment !== EPPO_SETUP_ENVIRONMENT
  ) {
    throw new EppoCredentialSetupError("invalid_environment");
  }
}

function assertCredentialForSetup(value: string | undefined): string {
  try {
    return assertValidEppoCredential(value);
  } catch (error) {
    throw new EppoCredentialSetupError(
      error instanceof Error &&
        "code" in error &&
        error.code === "missing_credential"
        ? "missing_credential"
        : "invalid_credential",
    );
  }
}

function assertWithinDeadline(startedAt: number, now: () => number) {
  if (now() - startedAt > EPPO_SETUP_DEADLINE_MS) {
    throw new EppoCredentialSetupError("credential_setup_deadline_exceeded");
  }
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * A Vercel environment write is strongly ordered but its `env run` projection
 * can briefly lag the write acknowledgement. Retry only this local read-back,
 * never the credential write or candidate authentication, and retain the
 * enclosing 90-second deadline and rollback behavior.
 */
async function verifyRuntimeWithPropagationRetry(
  target: EppoCredentialTarget,
  startedAt: number,
  now: () => number,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<EppoApiAccessReceipt> {
  let lastError: unknown;
  for (
    let attempt = 1;
    attempt <= EPPO_RUNTIME_VERIFICATION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const receipt = await target.verifyRuntime();
      assertWithinDeadline(startedAt, now);
      return receipt;
    } catch (error) {
      lastError = error;
      if (attempt === EPPO_RUNTIME_VERIFICATION_ATTEMPTS) break;
      assertWithinDeadline(startedAt, now);
      await sleep(EPPO_RUNTIME_VERIFICATION_RETRY_DELAY_MS * attempt);
      assertWithinDeadline(startedAt, now);
    }
  }
  throw lastError;
}

function createPlan(
  currentMainSha: string,
  contract: EppoOpenApiContract,
  targetState: "missing" | "present",
): EppoCredentialSetupPlan {
  const plan = {
    class: "plan_ready" as const,
    currentMainSha,
    openApiDigest: contract.openApiDigest,
    operationId: contract.operationId,
    environment: EPPO_SETUP_ENVIRONMENT as typeof EPPO_SETUP_ENVIRONMENT,
    secretName:
      EPPO_DATA_PORTAL_API_KEY_ENV as typeof EPPO_DATA_PORTAL_API_KEY_ENV,
    targetState,
    rollback: "remove_new_value_or_restore_previous_value" as const,
  };
  return {
    ...plan,
    approvalDigest: createHash("sha256")
      .update(JSON.stringify(plan), "utf8")
      .digest("hex"),
  };
}

function completedReceipt(
  className: EppoCredentialSetupReceipt["class"],
  plan: EppoCredentialSetupPlan,
  credential: string,
  candidateReceipt: EppoApiAccessReceipt,
  runtimeReceipt: EppoApiAccessReceipt,
  startedAt: number,
  now: () => number,
): EppoCredentialSetupReceipt {
  assertWithinDeadline(startedAt, now);
  return {
    class: className,
    currentMainSha: plan.currentMainSha,
    openApiDigest: plan.openApiDigest,
    operationId: plan.operationId,
    environment: plan.environment,
    secretName: plan.secretName,
    targetState: plan.targetState,
    fingerprintPrefix: eppoCredentialFingerprintPrefix(credential),
    candidateHttpStatusClass: candidateReceipt.httpStatusClass,
    runtimeHttpStatusClass: runtimeReceipt.httpStatusClass,
    durationMs: Math.max(0, now() - startedAt),
    cleanup: "completed",
  };
}

interface CommandResult {
  exitCode: number;
  stdout: Buffer;
  stderr: Buffer;
}

async function runVercel(
  args: string[],
  stdin?: Buffer,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "vercel", ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "pipe",
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeout = setTimeout(
      () => child.kill("SIGTERM"),
      EPPO_REQUEST_TIMEOUT_MS,
    );
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    });
    if (stdin) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

function destroyCommandResult(result: CommandResult) {
  result.stdout.fill(0);
  result.stderr.fill(0);
}

function commandSucceeded(result: CommandResult): boolean {
  const succeeded = result.exitCode === 0;
  destroyCommandResult(result);
  return succeeded;
}

function parseVercelEnvironmentRows(
  output: Buffer,
): Array<Record<string, unknown>> {
  const raw = output.toString("utf8");
  try {
    const json = extractJsonArray(raw);
    const parsed: unknown = json ? JSON.parse(json) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (row): row is Record<string, unknown> =>
            Boolean(row) && typeof row === "object",
        )
      : [];
  } catch {
    return [];
  } finally {
    output.fill(0);
  }
}

function extractJsonArray(value: string): string | null {
  const start = value.indexOf("[");
  if (start < 0) return null;
  let depth = 0;
  let escaped = false;
  let inString = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "[") depth += 1;
    if (character === "]") {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return null;
}

export function createVercelEppoCredentialTarget(): EppoCredentialTarget {
  return {
    async inspect() {
      const result = await runVercel([
        "env",
        "ls",
        EPPO_SETUP_ENVIRONMENT,
        "--format",
        "json",
        "--no-color",
      ]);
      if (result.exitCode !== 0) {
        destroyCommandResult(result);
        throw new EppoCredentialSetupError("runtime_verification_failed");
      }
      const names = new Set(
        parseVercelEnvironmentRows(result.stdout)
          .map((row) => row.key ?? row.name)
          .filter((name): name is string => typeof name === "string"),
      );
      result.stderr.fill(0);
      return {
        canonical: names.has(EPPO_DATA_PORTAL_API_KEY_ENV)
          ? "present"
          : "missing",
        legacyAliasConfigured: EPPO_LEGACY_CREDENTIAL_ENV_NAMES.some((name) =>
          names.has(name),
        ),
      };
    },
    async readCurrentCredential() {
      const marker = `__OVERGARDEN_EPPO_BACKUP_${randomUUID()}__`;
      const result = await runVercel([
        "env",
        "run",
        "-e",
        EPPO_SETUP_ENVIRONMENT,
        "--",
        "node",
        "-e",
        `const value=process.env.${EPPO_DATA_PORTAL_API_KEY_ENV};if(!value){process.exit(2)};process.stdout.write("${marker}"+Buffer.from(value,"utf8").toString("base64")+"${marker}")`,
      ]);
      try {
        if (result.exitCode !== 0) return null;
        const output = result.stdout.toString("utf8");
        const first = output.indexOf(marker);
        const last = output.lastIndexOf(marker);
        if (first < 0 || last <= first) return null;
        const encoded = output.slice(first + marker.length, last);
        if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) return null;
        const credential = Buffer.from(encoded, "base64");
        assertValidEppoCredential(credential.toString("utf8"));
        return credential;
      } finally {
        destroyCommandResult(result);
      }
    },
    async acquireTargetLock() {
      const token = Buffer.from(randomUUID(), "utf8");
      try {
        const result = await runVercel(
          [
            "env",
            "add",
            EPPO_SETUP_LOCK_ENV,
            EPPO_SETUP_ENVIRONMENT,
            "--yes",
            "--no-color",
          ],
          Buffer.concat([token, Buffer.from("\n")]),
        );
        return commandSucceeded(result);
      } finally {
        token.fill(0);
      }
    },
    async releaseTargetLock() {
      const result = await runVercel([
        "env",
        "rm",
        EPPO_SETUP_LOCK_ENV,
        EPPO_SETUP_ENVIRONMENT,
        "--yes",
        "--no-color",
      ]);
      if (!commandSucceeded(result)) {
        throw new EppoCredentialSetupError("rollback_failed");
      }
    },
    async writeCredential(credential) {
      const result = await runVercel(
        [
          "env",
          "add",
          EPPO_DATA_PORTAL_API_KEY_ENV,
          EPPO_SETUP_ENVIRONMENT,
          "--force",
          "--yes",
          "--no-color",
        ],
        Buffer.concat([credential, Buffer.from("\n")]),
      );
      if (!commandSucceeded(result)) {
        throw new EppoCredentialSetupError("target_write_failed");
      }
    },
    async removeCredential() {
      const result = await runVercel([
        "env",
        "rm",
        EPPO_DATA_PORTAL_API_KEY_ENV,
        EPPO_SETUP_ENVIRONMENT,
        "--yes",
        "--no-color",
      ]);
      if (!commandSucceeded(result)) {
        throw new EppoCredentialSetupError("rollback_failed");
      }
    },
    async verifyRuntime() {
      const result = await runVercel([
        "env",
        "run",
        "-e",
        EPPO_SETUP_ENVIRONMENT,
        "--",
        "env",
        "NODE_OPTIONS=--conditions=react-server",
        "pnpm",
        "exec",
        "tsx",
        "scripts/verify-eppo-api-access.ts",
        "--runtime",
        "--json",
      ]);
      try {
        if (result.exitCode !== 0) {
          throw new EppoCredentialSetupError("runtime_verification_failed");
        }
        const lines = result.stdout.toString("utf8").trim().split("\n");
        const json = [...lines].reverse().find((line) => line.startsWith("{"));
        const receipt = json
          ? (JSON.parse(json) as EppoApiAccessReceipt)
          : null;
        if (
          !receipt ||
          receipt.class !== "verified" ||
          receipt.operationId !== EPPO_LYPES_OPERATION_ID
        ) {
          throw new EppoCredentialSetupError("runtime_verification_failed");
        }
        return receipt;
      } catch (error) {
        if (error instanceof EppoCredentialSetupError) throw error;
        throw new EppoCredentialSetupError("runtime_verification_failed");
      } finally {
        destroyCommandResult(result);
      }
    },
  };
}

function parseCliInput(argv: string[]): EppoCredentialSetupInput {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  let environment: string | undefined;
  let confirmEnvironment: string | undefined;
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    if (argument === "--environment" || argument === "--confirm-environment") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new EppoCredentialSetupError("invalid_environment");
      }
      if (argument === "--environment") environment = value;
      else confirmEnvironment = value;
      index += 1;
      continue;
    }
    throw new EppoCredentialSetupError("invalid_credential");
  }
  return {
    environment: environment ?? "",
    confirmEnvironment: confirmEnvironment ?? "",
    apply,
  };
}

async function readMaskedCredential(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new EppoCredentialSetupError("missing_credential");
  }
  process.stdout.write("Paste EPPO API key (input hidden; Enter confirms): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    const bytes: number[] = [];
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
    };
    const onData = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === 3) {
          cleanup();
          reject(new EppoCredentialSetupError("missing_credential"));
          return;
        }
        if (byte === 13 || byte === 10) {
          cleanup();
          process.stdout.write("\n");
          resolve(Buffer.from(bytes).toString("utf8"));
          return;
        }
        if (byte === 127 || byte === 8) {
          bytes.pop();
          continue;
        }
        bytes.push(byte);
      }
    };
    process.stdin.on("data", onData);
  });
}

async function currentMainSha(): Promise<string> {
  const result = await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (exitCode) =>
      resolve({
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      }),
    );
  });
  try {
    if (result.exitCode !== 0) {
      throw new EppoCredentialSetupError("runtime_verification_failed");
    }
    const sha = result.stdout.toString("utf8").trim();
    if (!/^[a-f0-9]{40}$/u.test(sha)) {
      throw new EppoCredentialSetupError("runtime_verification_failed");
    }
    return sha;
  } finally {
    destroyCommandResult(result);
  }
}

async function runCli() {
  const input = parseCliInput(process.argv.slice(2));
  const target = createVercelEppoCredentialTarget();
  const prepared = await setupEppoCredentials(
    { ...input, apply: false },
    {
      target,
      currentMainSha,
    },
  );
  if (!input.apply) {
    process.stdout.write(`${JSON.stringify(prepared)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(prepared)}\n`);
  const credential = await readMaskedCredential();
  const result = await setupEppoCredentials(
    { ...input, credential, apply: true },
    { target, currentMainSha },
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runCli().catch((error: unknown) => {
    const code =
      error instanceof EppoCredentialSetupError
        ? error.code
        : "unexpected_failure";
    process.stderr.write(`eppo_credential_setup=failed code=${code}\n`);
    process.exitCode = 1;
  });
}
