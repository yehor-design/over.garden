import type {
  EphemeralMediaCommitStatus,
  EphemeralMediaGenerationState,
} from "../../../src/lib/media/ephemeral-staging-contract";

export type GenerationTransitionClass =
  | "new_generation"
  | "retry"
  | "replay"
  | "receipt_mismatch"
  | "stale_generation"
  | "generation_expired";

export function classifyGenerationTransition(
  current: {
    generation: number;
    sha256: string;
    state: EphemeralMediaGenerationState;
  } | null,
  incoming: { generation: number; sha256: string },
): GenerationTransitionClass {
  if (!current || incoming.generation > current.generation)
    return "new_generation";
  if (incoming.generation < current.generation) return "stale_generation";
  if (incoming.sha256 !== current.sha256) return "receipt_mismatch";
  if (["staged", "claimed", "finalized"].includes(current.state))
    return "replay";
  if (["deleting", "deleted", "expired"].includes(current.state))
    return "generation_expired";
  return "retry";
}

export type AlarmAction =
  | "delete_staging"
  | "delete_all"
  | "finalize"
  | "reschedule";

export function classifyAlarmAction(
  state: EphemeralMediaGenerationState,
  commitStatus: EphemeralMediaCommitStatus | null,
): AlarmAction {
  if (state === "claimed") {
    if (commitStatus === "committed") return "finalize";
    if (commitStatus === "absent") return "delete_all";
    return "reschedule";
  }
  if (state === "finalized") return "finalize";
  return "delete_staging";
}

export function nextReconciliationDelayMs(attempt: number): number {
  const exponent = Math.max(0, Math.min(4, Math.trunc(attempt)));
  return Math.min(15 * 60_000, 60_000 * 2 ** exponent);
}

export function isControlDeadlineOpen(
  deadlineAtMs: number,
  nowMs = Date.now(),
): boolean {
  return (
    Number.isSafeInteger(deadlineAtMs) &&
    deadlineAtMs > 0 &&
    nowMs <= deadlineAtMs
  );
}

export async function readBoundedResponseText(
  response: Response,
  maxBytes: number,
): Promise<string | null> {
  const declared = response.headers.get("content-length");
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    (declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) ||
    !response.body
  ) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
