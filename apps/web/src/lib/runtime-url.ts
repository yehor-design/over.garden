export const DEFAULT_PUBLIC_SITE_URL = "https://over.garden";
const DEFAULT_LOCAL_SITE_URL = "http://localhost:3000";

type EnvLike = Record<string, string | undefined>;

export function getPublicSiteUrl(env: EnvLike = process.env) {
  return normalizeSiteUrl(
    firstConfigured(
      env.PUBLIC_SITE_URL,
      env.NEXT_PUBLIC_SITE_URL,
      vercelUrl(env),
      DEFAULT_PUBLIC_SITE_URL,
    ),
  );
}

export function getAuthBaseUrl(env: EnvLike = process.env) {
  if (isVercelProductionRuntime(env)) {
    return normalizeSiteUrl(
      firstConfigured(
        env.BETTER_AUTH_URL,
        env.PUBLIC_SITE_URL,
        env.NEXT_PUBLIC_SITE_URL,
        DEFAULT_PUBLIC_SITE_URL,
      ),
    );
  }

  return normalizeSiteUrl(
    firstConfigured(
      env.BETTER_AUTH_URL,
      env.PUBLIC_SITE_URL,
      env.NEXT_PUBLIC_SITE_URL,
      vercelUrl(env),
      DEFAULT_LOCAL_SITE_URL,
    ),
  );
}

export function shouldForceInsecureRecoveryCookies(
  env: EnvLike = process.env,
): boolean {
  return (
    env.OVE230_RECOVERY_DRILL === "true" &&
    new URL(getAuthBaseUrl(env)).protocol === "http:"
  );
}

export function vercelUrl(env: EnvLike = process.env): string | undefined {
  const raw = env.VERCEL_URL?.trim();
  if (!raw) return undefined;

  return raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `https://${raw}`;
}

export function isVercelProductionRuntime(env: EnvLike = process.env): boolean {
  return env.VERCEL === "1" && env.VERCEL_ENV === "production";
}

function firstConfigured(...values: Array<string | undefined>) {
  const value = values.find((candidate) => candidate?.trim());
  if (!value) return DEFAULT_PUBLIC_SITE_URL;
  return value;
}

function normalizeSiteUrl(value: string) {
  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";

  return url.toString();
}
