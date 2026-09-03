/**
 * The failure vocabulary every page under `/garden/**` shares.
 *
 * ADR-0023: under Cache Components a Server Component that throws while the
 * postponed part of a workspace response is resumed leaves its Suspense
 * boundary pending forever on a hard load — no `$RX` instruction is written, so
 * `error.tsx` never renders and the reader keeps the skeleton. A workspace
 * failure therefore has to be a *value* the server renders, never an exception
 * a boundary is expected to catch. `settleSection` is how a read becomes that
 * value.
 *
 * This module deliberately has no `server-only` guard and no Node import: the
 * classes and the digest are also read by the components that render them, and
 * the proof script imports it under plain Node.
 */

/**
 * The closed set of reasons a workspace section can fail. Renaming a member is
 * a breaking change for `scripts/prove-workspace-section-observability.ts` and
 * for every `data-section-failure` assertion in the suite.
 */
export const WORKSPACE_FAILURE_CLASSES = [
  "permission_denied",
  "schema_missing",
  "query_timeout",
  "connection_unavailable",
  "serialization_failure",
  "unknown",
] as const;

export type WorkspaceFailureClass = (typeof WORKSPACE_FAILURE_CLASSES)[number];

export type WorkspaceSection<T> =
  | { status: "ready"; value: T }
  | ({ status: "error" } & WorkspaceFailureDescription);

/**
 * What an operator gets to see about a failure, and nothing more. `digest` is
 * the reference the panel prints and `onRequestError` writes, so the person
 * reading the screen and the person reading the log are holding the same
 * string. `relation` is populated only for `schema_missing`, and only for
 * owner-only surfaces to render.
 */
export interface WorkspaceFailureDescription {
  failureClass: WorkspaceFailureClass;
  digest: string;
  relation: string | null;
}

/** One workspace section costs this long per declared database round trip. */
export const WORKSPACE_SECTION_DEADLINE_MS = 1_200;

/**
 * A section's budget is derived from its own round-trip cost rather than shared
 * with sections of unequal work: a single constant gives the largest section a
 * fraction of the protection the smallest one gets.
 */
export function workspaceSectionDeadlineMs(queryCount: number): number {
  const trips = Number.isFinite(queryCount)
    ? Math.max(1, Math.trunc(queryCount))
    : 1;
  return WORKSPACE_SECTION_DEADLINE_MS * trips;
}

/**
 * A section that exceeded its own deadline. It carries a code so the bounded
 * classifier reports `query_timeout` rather than losing the distinction between
 * a slow dependency and an unrecognised fault.
 */
export class WorkspaceSectionDeadlineError extends Error {
  readonly code = "workspace_section_deadline";

  constructor() {
    super("Workspace section deadline exceeded.");
    this.name = "WorkspaceSectionDeadlineError";
  }
}

/**
 * Workspace sections are independent support surfaces. A slow dependency must
 * settle as the caller's bounded failure, while a later completion remains
 * unable to alter that completed read.
 */
export function withWorkspaceSectionDeadline<T>(
  load: () => Promise<T>,
  deadlineMs = WORKSPACE_SECTION_DEADLINE_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new WorkspaceSectionDeadlineError());
    }, deadlineMs);

    void Promise.resolve()
      .then(load)
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
  });
}

const POSTGRES_FAILURE_CLASS: Readonly<Record<string, WorkspaceFailureClass>> =
  {
    // insufficient_privilege
    "42501": "permission_denied",
    // undefined_table, undefined_column, undefined_function, undefined_object
    "42P01": "schema_missing",
    "42703": "schema_missing",
    "42883": "schema_missing",
    "42704": "schema_missing",
    // query_canceled, idle_session_timeout
    "57014": "query_timeout",
    "57P05": "query_timeout",
    // connection exception family
    "08000": "connection_unavailable",
    "08001": "connection_unavailable",
    "08003": "connection_unavailable",
    "08004": "connection_unavailable",
    "08006": "connection_unavailable",
    "08007": "connection_unavailable",
    "57P01": "connection_unavailable",
    "57P03": "connection_unavailable",
    // serialization_failure, deadlock_detected
    "40001": "serialization_failure",
    "40P01": "serialization_failure",
  };

const SYSTEM_FAILURE_CLASS: Readonly<Record<string, WorkspaceFailureClass>> = {
  ECONNREFUSED: "connection_unavailable",
  ECONNRESET: "connection_unavailable",
  EHOSTUNREACH: "connection_unavailable",
  ENOTFOUND: "connection_unavailable",
  EPIPE: "connection_unavailable",
  ETIMEDOUT: "query_timeout",
  workspace_section_deadline: "query_timeout",
};

function failureCode(reason: unknown): string | undefined {
  if (reason === null || typeof reason !== "object") return undefined;
  if (!("code" in reason)) return undefined;
  const code = (reason as { code: unknown }).code;
  return typeof code === "string" || typeof code === "number"
    ? String(code)
    : undefined;
}

/**
 * Maps a rejection onto exactly one bounded class. The reason itself is never
 * returned or recorded: a driver error can carry the failing statement and its
 * bound parameters, and those may contain journal content.
 */
export function classifyWorkspaceFailure(
  reason: unknown,
): WorkspaceFailureClass {
  if (reason instanceof Error && reason.name === "AbortError") {
    return "query_timeout";
  }
  const code = failureCode(reason);
  if (!code) return "unknown";
  return (
    POSTGRES_FAILURE_CLASS[code] ?? SYSTEM_FAILURE_CLASS[code] ?? "unknown"
  );
}

/**
 * The only thing read out of a driver message anywhere in this codebase, and it
 * is read under a pattern that cannot match journal text: an unquoted lowercase
 * SQL identifier inside Postgres' own fixed sentence for an undefined object.
 * It exists because the owner is the person who can apply the migration, and
 * naming the relation is the difference between a five-minute fix and a hunt.
 */
const MISSING_RELATION_PATTERN =
  /(?:relation|column|function|type)\s+"([a-z0-9_.]{1,63})"\s+does not exist/i;

function missingRelation(reason: unknown): string | null {
  if (!(reason instanceof Error) || typeof reason.message !== "string") {
    return null;
  }
  return MISSING_RELATION_PATTERN.exec(reason.message)?.[1] ?? null;
}

/**
 * A stable, short reference for one failure: the same class and the same
 * Postgres code always produce the same string, so the panel on screen and the
 * `onRequestError` line in the platform log can be matched by eye. It is a hash
 * of the class and the code only — never of a message, a statement, or a
 * parameter.
 */
export function workspaceFailureDigest(
  failureClass: WorkspaceFailureClass,
  code: string | undefined,
): string {
  // FNV-1a, 32-bit. A cryptographic hash would be misleading here: this is a
  // human-matchable reference, not a secret, and `node:crypto` would tie this
  // module to a runtime the components rendering the digest do not share.
  let hash = 0x811c9dc5;
  for (const character of `${failureClass}:${code ?? "none"}`) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(7, "0");
}

/** The class, the reference the operator quotes, and — for a missing relation
 * only — the object Postgres could not find. */
export function describeWorkspaceFailure(
  reason: unknown,
): WorkspaceFailureDescription {
  const failureClass = classifyWorkspaceFailure(reason);
  return {
    failureClass,
    digest: workspaceFailureDigest(failureClass, failureCode(reason)),
    relation:
      failureClass === "schema_missing" ? missingRelation(reason) : null,
  };
}

/**
 * A failure section built from a class rather than from a caught reason. Two
 * callers need it: a surface that has already decided its own bounded failure
 * (an access read that could not reach the role table), and the suite, which
 * has to state a class without inventing a driver error to carry it.
 */
export function failedSection(
  failureClass: WorkspaceFailureClass,
  options: { code?: string; relation?: string | null } = {},
): { status: "error" } & WorkspaceFailureDescription {
  return {
    status: "error",
    failureClass,
    digest: workspaceFailureDigest(failureClass, options.code),
    relation: options.relation ?? null,
  };
}

/**
 * One JSON line for a section that settled into a failure.
 *
 * `instrumentation.ts` cannot cover this. A workspace page that renders its
 * failure state does not throw, so `onRequestError` is never called — and even
 * when something does throw, the error React forwards there is a sanitized
 * `Error` carrying only a digest (measured 2026-09-03 against a production
 * build), so the class is gone by the time it arrives. Here the code is still in
 * hand, which is the only place the class can honestly be derived.
 *
 * The line carries the surface, the section, the bounded class and the digest —
 * never a message, a statement, a parameter, or an owner identifier. It shares
 * the `workspace_` prefix with the `onRequestError` line so one grep finds both.
 */
export function recordWorkspaceSectionFailure(
  failure: WorkspaceFailureDescription,
  labels: { surface?: string; section?: string } = {},
): void {
  try {
    console.error(
      JSON.stringify({
        event: "workspace_section_degraded",
        surface: labels.surface ?? null,
        section: labels.section ?? null,
        failureClass: failure.failureClass,
        digest: failure.digest,
      }),
    );
  } catch {
    // Observability must never be the reason a page fails to render.
  }
}

/**
 * Turns one read into a rendered value. Nothing under `/garden/**` awaits a
 * repository call outside this function: an exception escaping a Server
 * Component during a postponed resume is not a UI mechanism (ADR-0023).
 *
 * Next's own control-flow signals — `notFound()`, `redirect()`, `forbidden()` —
 * are re-thrown by the caller-supplied `rethrow`, because swallowing one would
 * turn a navigation into a blank section.
 */
export async function settleSection<T>(
  load: () => Promise<T>,
  options: {
    deadlineMs?: number;
    rethrow?: (reason: unknown) => void;
    /** Which screen and which block, for the log line. Never rendered. */
    surface?: string;
    section?: string;
    /** Off for a read whose failure is a designed absence rather than an
     * incident — a catalog preselection that could not be resolved. */
    record?: boolean;
  } = {},
): Promise<WorkspaceSection<T>> {
  try {
    const value = await withWorkspaceSectionDeadline(load, options.deadlineMs);
    return { status: "ready", value };
  } catch (reason) {
    options.rethrow?.(reason);
    const failure = describeWorkspaceFailure(reason);
    if (options.record !== false) {
      recordWorkspaceSectionFailure(failure, {
        surface: options.surface,
        section: options.section,
      });
    }
    return { status: "error", ...failure };
  }
}
