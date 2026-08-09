const RETIRED_SOCIAL_PROVIDER_ID = "facebook";
const RETIRED_SOCIAL_PROVIDER_INITIATION_PATHS = new Set([
  "/api/auth/sign-in/social",
  "/api/auth/link-social",
]);

const RETIREMENT_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Length": "0",
  "X-Content-Type-Options": "nosniff",
} as const;

/**
 * Canonical, deliberately non-effectful denial for the one retired social
 * provider. It runs before Better Auth so stale clients cannot reach provider
 * handlers, provider network calls, account writes, sessions, or cookies.
 */
export async function denyRetiredSocialProviderRequest(
  request: Request,
): Promise<Response | null> {
  const pathname = normalizePathname(new URL(request.url).pathname);
  if (isRetiredProviderCallback(pathname)) return retirementResponse();

  if (
    request.method !== "POST" ||
    !RETIRED_SOCIAL_PROVIDER_INITIATION_PATHS.has(pathname)
  ) {
    return null;
  }

  const body = await request
    .clone()
    .json()
    .catch(() => null);
  const provider = readProvider(body);
  return provider === RETIRED_SOCIAL_PROVIDER_ID ? retirementResponse() : null;
}

function isRetiredProviderCallback(pathname: string): boolean {
  const callbackPrefix = "/api/auth/callback/";
  if (!pathname.startsWith(callbackPrefix)) return false;

  const encodedProvider = pathname.slice(callbackPrefix.length);
  if (!encodedProvider || encodedProvider.includes("/")) return false;

  try {
    return (
      decodeURIComponent(encodedProvider).trim().toLowerCase() ===
      RETIRED_SOCIAL_PROVIDER_ID
    );
  } catch {
    return false;
  }
}

function readProvider(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("provider" in body)) return null;
  const provider = (body as { provider?: unknown }).provider;
  return typeof provider === "string" ? provider.trim().toLowerCase() : null;
}

function normalizePathname(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

function retirementResponse(): Response {
  return new Response(null, {
    status: 404,
    headers: RETIREMENT_RESPONSE_HEADERS,
  });
}
