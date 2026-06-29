import "server-only";

import { cookies } from "next/headers";

import {
  DEFAULT_PILOT_INVITE_COHORT,
  signPilotInviteToken,
  verifyPilotInviteToken,
  type PilotInviteCohort,
  type PilotInviteVerification,
} from "@/lib/garden/pilot-invite";
import { DEFAULT_PILOT_SEGMENT, type PilotSegment } from "@/lib/pilot/segments";
import { requireCurrentRequestScope } from "@/server/auth-session";
import {
  grantPilotWriteAccess,
  hasPilotWriteAccess,
} from "@/server/pilot-invite-repository";
import type { RequestScope } from "@/server/request-scope";

// Closed-pilot write gate (OVE-42). Eligibility is carried as a signed,
// HTTP-only cookie (so it survives client navigation and the Better Auth round
// trip without leaking the raw invite into analytics) and is materialized into a
// persistent `pilot_invite_grants` row the first time an invited visitor is
// authenticated. Reads/writes never persist raw invite links, emails, or query
// strings; only the enum cohort, enum segment, and user id.

export const PILOT_INVITE_COOKIE_NAME = "overgarden_pilot_invite";

// The eligibility cookie lives longer than a single invite link so an invited
// gardener can return after the link expires; the grant row is the durable
// record once they authenticate.
const COOKIE_TTL_SECONDS = 180 * 24 * 60 * 60; // 180 days.

const PILOT_WRITE_ACCESS_MESSAGE =
  "OverGarden is invite-only right now. Open your invitation link to start writing in your garden.";

export class PilotWriteAccessError extends Error {
  constructor(message: string = PILOT_WRITE_ACCESS_MESSAGE) {
    super(message);
    this.name = "PilotWriteAccessError";
  }
}

export interface PilotWriteAccessDeps {
  hasAccess?: (userId: string) => Promise<boolean>;
  readCookieInvite?: () => Promise<PilotInviteVerification | null>;
  grantAccess?: (
    userId: string,
    cohort: PilotInviteCohort,
    segment: PilotSegment,
  ) => Promise<void>;
}

export async function setPilotInviteCookie(
  cohort: PilotInviteCohort = DEFAULT_PILOT_INVITE_COHORT,
  segment: PilotSegment = DEFAULT_PILOT_SEGMENT,
): Promise<void> {
  const token = signPilotInviteToken({
    cohort,
    segment,
    ttlSeconds: COOKIE_TTL_SECONDS,
  });
  const cookieStore = await cookies();

  cookieStore.set(PILOT_INVITE_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_TTL_SECONDS,
  });
}

export async function readPilotInviteCohortFromCookie(): Promise<PilotInviteCohort | null> {
  return (await readPilotInviteFromCookie())?.cohort ?? null;
}

export async function readPilotInviteFromCookie(): Promise<PilotInviteVerification | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PILOT_INVITE_COOKIE_NAME)?.value ?? null;
  return verifyPilotInviteToken(token);
}

// Resolves whether the authenticated scope may write. If a valid eligibility
// cookie is present but no grant exists yet, this materializes the durable
// grant. Returns true when the user is (now) write-eligible.
export async function claimOrCheckPilotWriteAccess(
  scope: RequestScope,
  deps: PilotWriteAccessDeps = {},
): Promise<boolean> {
  const hasAccess = deps.hasAccess ?? hasPilotWriteAccess;
  const readCookieInvite = deps.readCookieInvite ?? readPilotInviteFromCookie;
  const grantAccess = deps.grantAccess ?? grantPilotWriteAccess;

  if (await hasAccess(scope.userId)) return true;

  const invite = await readCookieInvite();
  if (!invite) return false;

  await grantAccess(scope.userId, invite.cohort, invite.segment);
  return true;
}

export interface PilotWriteAccessState {
  invited: boolean;
}

// UI-friendly resolver: never throws, so a non-invited gardener sees the safe
// closed-pilot state instead of a broken page.
export async function resolvePilotWriteAccess(
  scope: RequestScope,
  deps: PilotWriteAccessDeps = {},
): Promise<PilotWriteAccessState> {
  try {
    return { invited: await claimOrCheckPilotWriteAccess(scope, deps) };
  } catch {
    return { invited: false };
  }
}

export async function ensurePilotWriteEligible(
  scope: RequestScope,
  deps: PilotWriteAccessDeps = {},
): Promise<void> {
  if (!(await claimOrCheckPilotWriteAccess(scope, deps))) {
    throw new PilotWriteAccessError();
  }
}

// Boundary helper for every write path: require authentication AND invited
// write eligibility before any pilot data is created.
export async function requireWriteEligibleRequestScope(): Promise<RequestScope> {
  const scope = await requireCurrentRequestScope();
  await ensurePilotWriteEligible(scope);
  return scope;
}
