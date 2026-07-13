import "server-only";

import { createHmac } from "node:crypto";

import { resolveBetterAuthSecret } from "@/lib/auth-secret";

export type AuthIntentControlNamespace =
  | "reply"
  | "follow"
  | "report"
  | "block"
  | "publish"
  | "claim";

export function createAuthIntentControlRef(
  namespace: AuthIntentControlNamespace,
  source: string,
  options: { secret?: string } = {},
) {
  const normalizedSource = source.trim();
  if (normalizedSource.length === 0 || normalizedSource.length > 256) {
    throw new Error("Auth intent control source is invalid.");
  }

  const digest = createHmac(
    "sha256",
    options.secret ?? resolveBetterAuthSecret(),
  )
    .update(`overgarden.auth-intent-control.v1\0${namespace}\0`, "utf8")
    .update(normalizedSource, "utf8")
    .digest("hex")
    .slice(0, 16);

  return `${namespace}-${digest}`;
}
