export const COMPOSER_IDLE_DEADLINE_MS = 1_500;

export async function waitForComposerIdle(input: {
  isBusy: () => boolean;
  signal?: AbortSignal;
  deadlineMs?: number;
  pollMs?: number;
}): Promise<"idle" | "deadline"> {
  const deadlineMs = input.deadlineMs ?? COMPOSER_IDLE_DEADLINE_MS;
  const pollMs = input.pollMs ?? 16;
  const startedAt = performance.now();
  while (input.isBusy()) {
    if (input.signal?.aborted) throw input.signal.reason;
    if (performance.now() - startedAt >= deadlineMs) return "deadline";
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(input.signal?.reason);
      };
      const timer = setTimeout(() => {
        input.signal?.removeEventListener("abort", onAbort);
        resolve();
      }, pollMs);
      input.signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  return "idle";
}
