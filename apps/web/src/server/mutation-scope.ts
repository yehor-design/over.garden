import "server-only";

import {
  OWNER_USER_ID_FORM_FIELD,
  OWNER_USER_ID_HEADER,
  normalizeOwnerUserId,
  type MutationScopeCode,
} from "@/lib/auth/owner-scope-contract";
import {
  getAuthoritativeCurrentSession,
  getCurrentSession,
  getSessionId,
} from "@/server/auth-session";
import { scopedToUser, type RequestScope } from "@/server/request-scope";

export interface AdmittedMutationScope {
  status: "admitted";
  scope: RequestScope;
}

export interface RejectedMutationScope {
  status: "rejected";
  code: MutationScopeCode;
  statusCode: 401 | 409;
}

export type MutationScopeResolution =
  | AdmittedMutationScope
  | RejectedMutationScope;

export interface ResolveMutationScopeInput {
  /**
   * The owner id the page was rendered for. A different signed-in account
   * means another tab switched accounts meanwhile: the mutation is refused
   * with 409 so the stale tab can tell the person to reload (D6).
   */
  expectedOwnerUserId?: string | null;
  /** Bypass Better Auth's cookie cache for account-security mutations. */
  authoritative?: boolean;
}

/**
 * The only server-side session check a mutation needs (ADR-0022, D6). The
 * session cookie decides; the rendered owner id is a safety net, not a gate.
 */
export async function resolveMutationScope(
  input: ResolveMutationScopeInput = {},
): Promise<MutationScopeResolution> {
  let session: Awaited<ReturnType<typeof getCurrentSession>>;
  try {
    session = input.authoritative
      ? await getAuthoritativeCurrentSession()
      : await getCurrentSession();
  } catch {
    return rejected("session_required");
  }
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0) {
    return rejected("session_required");
  }
  const expected = normalizeOwnerUserId(input.expectedOwnerUserId);
  if (expected && expected !== userId) {
    return rejected("session_account_changed");
  }
  return {
    status: "admitted",
    scope: scopedToUser(userId, getSessionId(session)),
  };
}

export function ownerUserIdFromRequest(request: Request): string | null {
  return normalizeOwnerUserId(request.headers.get(OWNER_USER_ID_HEADER));
}

export function ownerUserIdFromFormData(formData: FormData): string | null {
  const value = formData.get(OWNER_USER_ID_FORM_FIELD);
  return normalizeOwnerUserId(typeof value === "string" ? value : null);
}

export function mutationScopeResponse(
  rejection: RejectedMutationScope,
): Response {
  return Response.json(
    { code: rejection.code },
    {
      status: rejection.statusCode,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

function rejected(code: MutationScopeCode): RejectedMutationScope {
  return {
    status: "rejected",
    code,
    statusCode: code === "session_required" ? 401 : 409,
  };
}
