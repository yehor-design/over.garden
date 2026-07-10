import "server-only";

import { getCurrentSession } from "@/server/auth-session";

export interface SiteShellSessionState {
  isAuthenticated: boolean;
}

export async function getSiteShellSessionState(): Promise<SiteShellSessionState> {
  try {
    const session = await getCurrentSession();

    return {
      isAuthenticated: Boolean(session?.user?.id),
    };
  } catch {
    return { isAuthenticated: false };
  }
}
