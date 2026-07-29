export const LINEAGE_INVITATION_CLAIM_PATH =
  "/garden/lineage/invitations/claim";
export const LINEAGE_CLAIM_HANDOFF_PATH =
  "/garden/lineage/invitations/claim/handoff";
export const LINEAGE_CLAIM_COOKIE_NAME = "overgarden-lineage-claim";
export const LINEAGE_CLAIM_COOKIE_MAX_AGE_SECONDS = 30 * 60;

const LINEAGE_INVITE_TOKEN_PATTERN =
  /^(?:v1\.[A-Za-z0-9_-]{1,3072}\.[A-Za-z0-9_-]{1,512}|v2\.(?:0|[1-9]\d{0,14})\.[A-Za-z0-9_-]{1,3072}\.[A-Za-z0-9_-]{1,512})$/;

export function lineageClaimTokenFromHash(hash: string): string | null {
  if (!hash.startsWith("#") || hash.length > 4096) return null;

  const candidate = new URLSearchParams(hash.slice(1)).get("token")?.trim();
  return candidate && LINEAGE_INVITE_TOKEN_PATTERN.test(candidate)
    ? candidate
    : null;
}
