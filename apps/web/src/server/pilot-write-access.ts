import "server-only";

import { cookies } from "next/headers";

import {
  REAL_SELF_SERVE_ACTOR_CLASS,
  type ActorClass,
} from "@/lib/garden/actor-class";
import {
  DEFAULT_PILOT_INVITE_COHORT,
  signPilotInviteToken,
  verifyPilotInviteToken,
  type PilotInviteCohort,
  type PilotInviteVerification,
} from "@/lib/garden/pilot-invite";
import { DEFAULT_PILOT_SEGMENT, type PilotSegment } from "@/lib/pilot/segments";
import { requireCurrentRequestScope } from "@/server/auth-session";
import { resolveDurableActorClass } from "@/server/learning-actor-attribution";
import {
  getPilotInviteGrant,
  grantPilotWriteAccess,
  hasPilotWriteAccess,
} from "@/server/pilot-invite-repository";
import type { RequestScope } from "@/server/request-scope";

// OVE-193: authentication + resource authorization is enough for normal
// self-serve writes. `pilot_invite_grants` remains optional closed-pilot /
// founder-rehearsal cohort attribution (cookie claim → durable row), never a
// public-MVP authorization dependency. Reads/writes never persist raw invite
// links, emails, or query strings; only enum cohort, enum segment, and user id.

export const PILOT_INVITE_COOKIE_NAME = "overgarden_pilot_invite";

// The eligibility cookie lives longer than a single invite link so an invited
// gardener can return after the link expires; the grant row is the durable
// cohort record once they authenticate.
const COOKIE_TTL_SECONDS = 180 * 24 * 60 * 60; // 180 days.

/** @deprecated OVE-193 removed invite authorization; kept for typed HTTP mapping. */
export class PilotWriteAccessError extends Error {
  constructor(
    message: string = "OverGarden write access requires a signed-in gardener.",
  ) {
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
  getGrant?: (
    userId: string,
  ) => Promise<{ cohort: PilotInviteCohort; segment: PilotSegment } | null>;
  resolveActorClass?: (input: {
    userId: string;
    grant: { cohort: PilotInviteCohort; segment: PilotSegment } | null;
  }) => Promise<ActorClass>;
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

/**
 * Optional cohort attribution: materialize a durable grant when a valid invite
 * cookie is present. Never blocks self-serve writes.
 */
export async function claimPilotCohortAttribution(
  scope: RequestScope,
  deps: PilotWriteAccessDeps = {},
): Promise<{ attributed: boolean; actorClass: ActorClass }> {
  const hasAccess = deps.hasAccess ?? hasPilotWriteAccess;
  const readCookieInvite = deps.readCookieInvite ?? readPilotInviteFromCookie;
  const grantAccess = deps.grantAccess ?? grantPilotWriteAccess;
  const getGrant = deps.getGrant ?? getPilotInviteGrant;
  const resolveActorClass =
    deps.resolveActorClass ??
    (async ({ userId, grant }) =>
      resolveDurableActorClass(userId, {
        getGrant: async () => grant,
      }));

  if (await hasAccess(scope.userId)) {
    const grant = await getGrant(scope.userId);
    const actorClass = await resolveActorClass({
      userId: scope.userId,
      grant,
    });
    return {
      attributed: true,
      actorClass,
    };
  }

  const invite = await readCookieInvite();
  if (!invite) {
    const actorClass = await resolveActorClass({
      userId: scope.userId,
      grant: null,
    });
    return { attributed: false, actorClass };
  }

  await grantAccess(scope.userId, invite.cohort, invite.segment);
  const actorClass = await resolveActorClass({
    userId: scope.userId,
    grant: {
      cohort: invite.cohort,
      segment: invite.segment,
    },
  });
  return {
    attributed: true,
    actorClass,
  };
}

/** @deprecated Prefer claimPilotCohortAttribution; always returns true after OVE-193. */
export async function claimOrCheckPilotWriteAccess(
  scope: RequestScope,
  deps: PilotWriteAccessDeps = {},
): Promise<boolean> {
  await claimPilotCohortAttribution(scope, deps);
  return true;
}

export interface PilotWriteAccessState {
  /** Authenticated gardeners may write; invite is not required after OVE-193. */
  canWrite: boolean;
  /** True when a closed-pilot / founder-rehearsal grant exists (cohort only). */
  invited: boolean;
  actorClass: ActorClass;
}

export async function resolvePilotWriteAccess(
  scope: RequestScope,
  deps: PilotWriteAccessDeps = {},
): Promise<PilotWriteAccessState> {
  try {
    const attribution = await claimPilotCohortAttribution(scope, deps);
    return {
      canWrite: true,
      invited: attribution.attributed,
      actorClass: attribution.actorClass,
    };
  } catch {
    // Fail closed for attribution only; authenticated scope still may write
    // once requireWriteEligibleRequestScope has succeeded.
    return {
      canWrite: true,
      invited: false,
      actorClass: REAL_SELF_SERVE_ACTOR_CLASS,
    };
  }
}

export async function resolveActorClassForScope(
  scope: RequestScope,
  deps: PilotWriteAccessDeps = {},
): Promise<ActorClass> {
  return (await resolvePilotWriteAccess(scope, deps)).actorClass;
}

/** @deprecated Invite no longer gates writes; attribution only. */
export async function ensurePilotWriteEligible(
  scope: RequestScope,
  deps: PilotWriteAccessDeps = {},
): Promise<void> {
  await claimPilotCohortAttribution(scope, deps);
}

/**
 * Boundary helper for every write path: require authentication. Optional invite
 * cookie still materializes cohort attribution without authorizing access.
 */
export async function requireWriteEligibleRequestScope(): Promise<RequestScope> {
  const scope = await requireCurrentRequestScope();
  // OVE-219: authenticated journal writes must not await attribution reads or
  // writes. Cookie verification is pure and only supplies bounded metadata for
  // the transactionally committed outbox intent.
  const invite = await readPilotInviteFromCookie();
  return {
    ...scope,
    learningAttributionHint: invite
      ? { cohort: invite.cohort, segment: invite.segment }
      : null,
  };
}
