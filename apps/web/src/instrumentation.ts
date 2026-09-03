import {
  classifyWorkspaceFailure,
  workspaceFailureDigest,
  type WorkspaceFailureClass,
} from "@/server/workspace-failure";

/**
 * One line per server error, so a request that degrades gracefully still leaves
 * a trace.
 *
 * This exists because of a specific blind spot (ADR-0023, and `docs/PROJECT_STATE.md`
 * gap 3): a workspace page renders its failure state and answers `200`, so the
 * platform's own dashboards record a success for exactly the request that
 * failed. On 2026-09-01 the production workspace showed a degraded section
 * beside a runtime log that reported only successes for the same window.
 *
 * What is written is deliberately narrow. The digest and the bounded failure
 * class are the two things an operator needs to match a screen to a log, and
 * the route metadata says where it happened. No request body, no cookie, no
 * header, no query string, and never the error's own message: a driver error
 * carries the failing statement and its bound parameters, and those may hold
 * journal content.
 */

export interface WorkspaceErrorLogLine {
  event: "workspace_server_error";
  digest: string;
  path: string;
  method: string;
  routerKind: string;
  routePath: string;
  routeType: string;
  renderSource: string | null;
  renderType: string | null;
  revalidateReason: string | null;
  failureClass: WorkspaceFailureClass | null;
}

type RequestSummary = {
  path: string;
  method: string;
};

type ErrorContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
  renderSource?: string;
  renderType?: string;
  revalidateReason?: string;
};

/**
 * A path can carry a query string, and a query string can carry whatever a link
 * put there. Only the pathname is recorded.
 */
function safePath(path: string): string {
  const [pathname] = path.split("?");
  return pathname ?? path;
}

/**
 * Not every server error is a database error. A rejection the classifier does
 * not recognise reports `null` rather than `unknown`, so "we could not classify
 * this" stays distinguishable from "the closed set says unknown".
 *
 * Measured on 2026-09-03 against a production build: the error React hands to
 * `onRequestError` is a sanitized `Error` carrying only `digest` — no `code`,
 * no `cause` — so in production this is almost always `null`. That is not a
 * defect to work around here; it is the reason a *settled* failure records
 * itself where the code is still in hand, in `settleSection`. The two lines
 * share a shape so one grep finds both.
 */
function workspaceFailureClassOf(error: unknown): WorkspaceFailureClass | null {
  const failureClass = classifyWorkspaceFailure(error);
  return failureClass === "unknown" ? null : failureClass;
}

export function buildWorkspaceErrorLogLine(
  error: unknown,
  request: RequestSummary,
  context: ErrorContext,
): WorkspaceErrorLogLine {
  const failureClass = workspaceFailureClassOf(error);
  const digest =
    error !== null && typeof error === "object" && "digest" in error
      ? String((error as { digest: unknown }).digest)
      : workspaceFailureDigest(failureClass ?? "unknown", undefined);

  return {
    event: "workspace_server_error",
    digest,
    path: safePath(request.path),
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource ?? null,
    renderType: context.renderType ?? null,
    revalidateReason: context.revalidateReason ?? null,
    failureClass,
  };
}

export function onRequestError(
  error: unknown,
  request: RequestSummary,
  context: ErrorContext,
): void {
  const line = buildWorkspaceErrorLogLine(error, request, context);
  // One JSON object per line: the platform's log drain groups by `event`, and a
  // human can grep the digest straight off a failure panel.
  console.error(JSON.stringify(line));
}
