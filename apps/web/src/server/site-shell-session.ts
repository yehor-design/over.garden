import "server-only";

import { issueDocumentMutationGeneration } from "@/lib/auth/document-mutation-generation-contract";
import { deriveServerCurrentSessionBinding } from "@/lib/auth/sign-out-hardening";
import {
  getAuthoritativeCurrentSession,
  getSessionId,
} from "@/server/auth-session";
import { resolveAdminAccess } from "@/server/admin-access";
import { isDocumentMutationAdmissionEnabled } from "@/server/document-mutation-admission-config";

export interface SiteShellSessionState {
  isAuthenticated: boolean;
  documentMutationGeneration: string | null;
  currentSessionBinding: string | null;
  hasOperatorAccess: boolean;
}

export async function getSiteShellSessionState(): Promise<SiteShellSessionState> {
  let session: Awaited<ReturnType<typeof getAuthoritativeCurrentSession>>;
  try {
    session = await getAuthoritativeCurrentSession();
  } catch {
    return {
      isAuthenticated: false,
      documentMutationGeneration: null,
      currentSessionBinding: null,
      hasOperatorAccess: false,
    };
  }

  const ownerUserId = session?.user?.id;
  if (!ownerUserId) {
    return {
      isAuthenticated: false,
      documentMutationGeneration: null,
      currentSessionBinding: null,
      hasOperatorAccess: false,
    };
  }
  const sessionId = getSessionId(session);
  const hasOperatorAccess = await resolveShellOperatorAccess(
    ownerUserId,
    sessionId,
  );
  if (!sessionId) {
    return {
      isAuthenticated: true,
      documentMutationGeneration: null,
      currentSessionBinding: null,
      hasOperatorAccess,
    };
  }
  let currentSessionBinding: string | null = null;
  try {
    currentSessionBinding = deriveServerCurrentSessionBinding(sessionId);
  } catch {
    // UI exit remains local-first; a missing binding leaves reconciliation
    // unconfirmed without exposing or guessing session material.
  }
  if (!isDocumentMutationAdmissionEnabled()) {
    return {
      isAuthenticated: true,
      documentMutationGeneration: null,
      currentSessionBinding,
      hasOperatorAccess,
    };
  }

  try {
    const issuedAtSeconds = Math.floor(Date.now() / 1_000);
    const issued = issueDocumentMutationGeneration({
      ownerUserId,
      sessionId,
      issuedAtSeconds,
    });
    return {
      isAuthenticated: true,
      documentMutationGeneration: issued.transport,
      currentSessionBinding,
      hasOperatorAccess,
    };
  } catch {
    return {
      isAuthenticated: true,
      documentMutationGeneration: null,
      currentSessionBinding,
      hasOperatorAccess,
    };
  }
}

async function resolveShellOperatorAccess(
  userId: string,
  sessionId: string | null,
) {
  try {
    const access = await resolveAdminAccess({ userId, sessionId });
    return access.status === "allowed";
  } catch {
    return false;
  }
}
