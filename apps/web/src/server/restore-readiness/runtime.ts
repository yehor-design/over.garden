import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const RECOVERY_RUNTIME_DIR = path.join(
  process.cwd(),
  ".runtime",
  "ove-230-recovery-drill",
);
export const RECOVERY_LOCK_DIR = path.join(RECOVERY_RUNTIME_DIR, "lock");
export const RECOVERY_STATE_FILE = path.join(
  RECOVERY_RUNTIME_DIR,
  "state.json",
);
export const RECOVERY_PLAN_FILE = path.join(RECOVERY_RUNTIME_DIR, "plan.json");

export type RecoveryLifecycleState =
  | "planned"
  | "provider_source_bound"
  | "fork_requested"
  | "fork_online"
  | "target_bound"
  | "schema_current"
  | "product_proved"
  | "search_converged"
  | "readiness_passed"
  | "teardown_requested"
  | "teardown_absent"
  | "completed"
  | "refused"
  | "cleanup_required"
  | "cancelled";

export interface RecoveryStateReceipt {
  issue: "OVE-230";
  generation: string;
  state: RecoveryLifecycleState;
  planDigest: string;
  implementationSha: string;
  targetNameClass: string;
  pid: number;
  updatedAtUtc: string;
  cancelRequested: boolean;
}

export async function acquireRecoveryLock(receipt: RecoveryStateReceipt) {
  await mkdir(RECOVERY_RUNTIME_DIR, { recursive: true, mode: 0o700 });
  try {
    await mkdir(RECOVERY_LOCK_DIR, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("recovery drill is already running on this host");
    }
    throw error;
  }
  await writeRecoveryState(receipt);
}

export async function releaseRecoveryLock() {
  await rm(RECOVERY_LOCK_DIR, { recursive: true, force: true });
}

export async function writeRecoveryState(receipt: RecoveryStateReceipt) {
  await mkdir(RECOVERY_RUNTIME_DIR, { recursive: true, mode: 0o700 });
  const temporary = `${RECOVERY_STATE_FILE}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, RECOVERY_STATE_FILE);
}

export async function readRecoveryState(): Promise<RecoveryStateReceipt> {
  return JSON.parse(await readFile(RECOVERY_STATE_FILE, "utf8"));
}

export async function requestRecoveryCancellation() {
  const state = await readRecoveryState();
  const cancelled: RecoveryStateReceipt = {
    ...state,
    state: "cancelled",
    cancelRequested: true,
    updatedAtUtc: new Date().toISOString(),
  };
  await writeRecoveryState(cancelled);
  if (state.pid > 1 && state.pid !== process.pid) {
    try {
      process.kill(state.pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  return cancelled;
}

export async function writeSecretFile(file: string, value: string) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const handle = await open(file, "w", 0o600);
  try {
    await handle.writeFile(value);
  } finally {
    await handle.close();
  }
}

export function readSafeRecoveryDiagnostic(output: string) {
  const match = output.match(
    /"recoveryBootstrapStage":"([a-z_]+)","errorCode":"([A-Z0-9_]+)"/,
  );
  return match?.[1] && match[2] ? { stage: match[1], code: match[2] } : null;
}

export async function pollUntil<T>(input: {
  read: () => Promise<T>;
  done: (value: T) => boolean;
  timeoutMs: number;
  intervalMs: number;
  timeoutClass: string;
}): Promise<T> {
  const deadline = Date.now() + input.timeoutMs;
  while (true) {
    const value = await input.read();
    if (input.done(value)) return value;
    if (Date.now() >= deadline) throw new Error(input.timeoutClass);
    await new Promise((resolve) => setTimeout(resolve, input.intervalMs));
  }
}
