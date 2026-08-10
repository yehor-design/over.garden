import "server-only";

import { issueDocumentMutationGeneration } from "@/lib/auth/document-mutation-generation-contract";
import {
  getAuthoritativeCurrentSession,
  getSessionId,
} from "@/server/auth-session";
import { isDocumentMutationAdmissionEnabled } from "@/server/document-mutation-admission-config";

export interface SiteShellSessionState {
  isAuthenticated: boolean;
  documentMutationGeneration: string | null;
}

export async function getSiteShellSessionState(): Promise<SiteShellSessionState> {
  let session: Awaited<ReturnType<typeof getAuthoritativeCurrentSession>>;
  try {
    session = await getAuthoritativeCurrentSession();
  } catch {
    return { isAuthenticated: false, documentMutationGeneration: null };
  }

  const ownerUserId = session?.user?.id;
  if (!ownerUserId) {
    return { isAuthenticated: false, documentMutationGeneration: null };
  }
  const sessionId = getSessionId(session);
  if (!sessionId) {
    return { isAuthenticated: true, documentMutationGeneration: null };
  }
  if (!isDocumentMutationAdmissionEnabled()) {
    return { isAuthenticated: true, documentMutationGeneration: null };
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
    };
  } catch {
    return { isAuthenticated: true, documentMutationGeneration: null };
  }
}
