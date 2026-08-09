export const GOOGLE_PROVIDER_ID = "google";
export type SocialProviderId = typeof GOOGLE_PROVIDER_ID;

type QueryValue = string | string[] | undefined;

const OAUTH_AUTHORIZATION_HOSTS: Record<SocialProviderId, string> = {
  [GOOGLE_PROVIDER_ID]: "accounts.google.com",
};

export const OAUTH_ERROR_CODES = [
  "account_not_linked",
  "account_already_linked_to_different_user",
  "email_doesn_t_match",
  "email_doesnt_match",
  "email_not_found",
  "oauth_provider_not_found",
  "unable_to_link_account",
  "oauth_error",
] as const;

export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

const KNOWN_OAUTH_ERROR_CODES = new Set<OAuthErrorCode>(OAUTH_ERROR_CODES);

export function oauthCallbackPath(
  location: Pick<Location, "pathname" | "search">,
) {
  const pathname = location.pathname.startsWith("/")
    ? location.pathname
    : "/garden";
  const params = new URLSearchParams(location.search);
  params.delete("error");
  params.delete("error_description");
  const query = params.toString();

  return query ? `${pathname}?${query}` : pathname;
}

export function oauthErrorCodeForRedirect(
  error: QueryValue,
): OAuthErrorCode | null {
  const code = normalizeQueryValue(error);
  if (!code) return null;

  const normalized = normalizeOAuthErrorCode(code);
  return KNOWN_OAUTH_ERROR_CODES.has(normalized as OAuthErrorCode)
    ? (normalized as OAuthErrorCode)
    : "oauth_error";
}

export function getSafeOAuthAuthorizationUrl(
  provider: SocialProviderId,
  value: unknown,
): string | null {
  if (typeof value !== "string" || value.length === 0) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== OAUTH_AUTHORIZATION_HOSTS[provider]
  ) {
    return null;
  }

  return url.toString();
}

export function navigateToOAuthAuthorization(
  provider: SocialProviderId,
  value: unknown,
  navigate: (url: string) => void = (url) => window.location.assign(url),
) {
  const authorizationUrl = getSafeOAuthAuthorizationUrl(provider, value);
  if (!authorizationUrl) return false;

  navigate(authorizationUrl);
  return true;
}

function normalizeQueryValue(value: QueryValue) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeOAuthErrorCode(value: string) {
  return value.trim().toLowerCase().replaceAll("'", "").replaceAll("-", "_");
}
