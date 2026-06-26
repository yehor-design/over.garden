import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";

export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireCurrentUserId(): Promise<string> {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error("Authentication is required for this action.");
  }

  return userId;
}
