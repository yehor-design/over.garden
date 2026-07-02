export const GOOGLE_PROVIDER_ID = "google";

type QueryValue = string | string[] | undefined;

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  account_not_linked:
    "This Google account matches an existing OverGarden account that has not been linked yet. Sign in with email and password once, then use Link Google sign-in from your garden.",
  account_already_linked_to_different_user:
    "This Google account is already linked to a different OverGarden account. Use email sign-in for this garden or contact the operator before continuing.",
  email_doesn_t_match:
    "Google returned a different email than the current OverGarden account. Use the same email or keep signing in with email and password.",
  email_doesnt_match:
    "Google returned a different email than the current OverGarden account. Use the same email or keep signing in with email and password.",
  email_not_found:
    "Google did not return a verified email for this account. Use email sign-in for OverGarden.",
  oauth_provider_not_found:
    "Google sign-in is not configured for this environment yet. Use email sign-in for now.",
  unable_to_link_account:
    "Google sign-in could not be linked to this OverGarden account. Use email sign-in and retry from your garden.",
};

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

export function oauthErrorRecoveryMessage(error: QueryValue) {
  const code = normalizeQueryValue(error);
  if (!code) return null;

  const normalized = normalizeOAuthErrorCode(code);
  return (
    OAUTH_ERROR_MESSAGES[normalized] ??
    "Google sign-in did not finish. Try again or use email and password."
  );
}

function normalizeQueryValue(value: QueryValue) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeOAuthErrorCode(value: string) {
  return value.trim().toLowerCase().replaceAll("'", "").replaceAll("-", "_");
}
