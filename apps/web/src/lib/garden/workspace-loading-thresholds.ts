/**
 * How long a workspace skeleton may stay silent before it says something.
 *
 * ADR-0023: a skeleton that never resolves is the failure this work exists to
 * remove, so the skeleton itself has to be able to speak. The first threshold
 * adds a polite line — the wait is acknowledged, nothing is claimed broken. The
 * second offers a reload the reader chooses to press. Neither ever reloads on
 * its own: a page that reloads itself can destroy an unsaved composer draft,
 * and under ADR-0022 D3 a draft has nowhere else to live.
 *
 * These are shared by the client watchdog and by the suite that proves the
 * thresholds, so neither can drift from the other.
 */
export const WORKSPACE_LOADING_NOTICE_MS = 10_000;
export const WORKSPACE_LOADING_RELOAD_MS = 30_000;

/** What a skeleton is allowed to say, in the order it may say it. */
export type WorkspaceLoadingStage = "none" | "notice" | "reload";

/**
 * The stage a wait of `elapsedMs` has reached. Timing is a value here rather
 * than three `setTimeout` calls buried in an effect, so the thresholds can be
 * proven without a DOM and cannot drift from the ones the component uses.
 */
export function workspaceLoadingStage(
  elapsedMs: number,
): WorkspaceLoadingStage {
  if (elapsedMs >= WORKSPACE_LOADING_RELOAD_MS) return "reload";
  if (elapsedMs >= WORKSPACE_LOADING_NOTICE_MS) return "notice";
  return "none";
}

/**
 * Every transition the watchdog schedules, and the whole of what it schedules.
 * There is no entry that reloads, navigates, or refetches: the reader presses
 * the control or nothing happens.
 */
export const WORKSPACE_LOADING_SCHEDULE: ReadonlyArray<{
  delayMs: number;
  stage: WorkspaceLoadingStage;
}> = [
  { delayMs: WORKSPACE_LOADING_NOTICE_MS, stage: "notice" },
  { delayMs: WORKSPACE_LOADING_RELOAD_MS, stage: "reload" },
];
