import "server-only";

import { headers } from "next/headers";

import { sql } from "kysely";

import { db } from "@/db";
import {
  settleSection,
  workspaceSectionDeadlineMs,
  type WorkspaceSection,
} from "@/server/workspace-failure";

/**
 * Whether "nobody is signed in" is a fact or a symptom (`OVE-457`).
 *
 * Better Auth swallows a failed session read and answers `null`. Measured on
 * 2026-09-03 against a local production build with `DATABASE_URL` on a closed
 * port: a signed-in gardener was shown a sign-in panel during a database
 * outage — a false statement that sends them to solve the wrong problem.
 *
 * The workspace has asked this question since ADR-0023. The **chrome** did
 * not: `getSiteShellSessionState` answered "guest" for the same `null`, so a
 * workspace page could say the store was unreachable while the header above it
 * offered "Sign in". One reader, two answers, from one request. This module is
 * the shared question, so the two cannot drift again.
 *
 * Someone carrying a session cookie who resolved to nobody is the one case
 * worth a second question, and it costs a round trip a genuine visitor — who
 * carries no such cookie — never pays.
 */

/**
 * Better Auth's cookie names under `advanced.cookiePrefix: "overgarden"`. The
 * `__Secure-` form is what a browser sends over HTTPS, and both are checked so
 * the answer does not depend on which environment is serving.
 */
export const SESSION_COOKIE_NAMES = [
  "overgarden.session_token",
  "__Secure-overgarden.session_token",
] as const;

/** The liveness probe costs one round trip. */
export const SESSION_STORE_LIVENESS_DEADLINE_MS = workspaceSectionDeadlineMs(1);

/**
 * The probe reads the **session store**, not the database in general.
 *
 * `select 1` answers "the connection is up", which is a different question and
 * the wrong one: measured in a browser on 2026-09-20 with `session` replaced by
 * a view that raises `08006`, Better Auth swallowed the read, answered `null`,
 * `select 1` said the database was fine, and a signed-in gardener was shown a
 * sign-in panel. So the probe touches the relation the session read touches.
 *
 * `limit 1`, not `where false`: a qualifier the planner can prove empty is
 * never executed, so the scan never happens and a broken relation still
 * answers "fine" — which is what the first spelling of this did, measured the
 * same way. The statement selects a literal, so it reads no session data.
 */
async function readSessionStore(): Promise<boolean> {
  await sql`select 1 from "session" limit 1`.execute(db);
  return true;
}

/**
 * Did the reader *arrive* carrying a session cookie?
 *
 * Read from the request's `cookie` header, not from `cookies()`. The cookie
 * store is mutable within a request and Better Auth clears a session cookie it
 * cannot resolve — so by the time this is asked, the evidence that the reader
 * had one is gone, and every unresolvable session looks like a first-time
 * visitor. Measured in a browser on 2026-09-20: with `session` raising `08006`
 * and an expired cookie cache, the page answered "sign in" and the probe was
 * never run.
 */
export async function hasSessionCookie(): Promise<boolean> {
  const header = (await headers()).get("cookie") ?? "";
  if (!header) return false;
  return header
    .split(";")
    .map((pair) => pair.trim().split("=", 1)[0])
    .some((name) =>
      (SESSION_COOKIE_NAMES as readonly string[]).includes(name ?? ""),
    );
}

/**
 * `ready: true` when nobody is signed in and the store said so; `error` when
 * the reader carries a session cookie and the store could not be reached.
 *
 * `ready` for a reader with no cookie without asking anything: a visitor who
 * never signed in is signed out whatever the database is doing.
 */
export async function settleSessionStoreLiveness(
  surface: string,
): Promise<WorkspaceSection<boolean>> {
  if (!(await hasSessionCookie())) return { status: "ready", value: true };
  return settleSection(() => readSessionStore(), {
    deadlineMs: SESSION_STORE_LIVENESS_DEADLINE_MS,
    surface,
    section: "session-store-liveness",
  }).then((settled) =>
    settled.status === "ready"
      ? ({ status: "ready", value: true } as const)
      : settled,
  );
}
