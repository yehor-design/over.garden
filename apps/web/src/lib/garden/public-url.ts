const DEFAULT_PUBLIC_SITE_URL = "https://over.garden";

export function getPublicSiteUrl() {
  return normalizePublicSiteUrl(
    process.env.PUBLIC_SITE_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      DEFAULT_PUBLIC_SITE_URL,
  );
}

export function absolutePublicUrl(path: string, siteUrl = getPublicSiteUrl()) {
  return new URL(path, siteUrl).toString();
}

function normalizePublicSiteUrl(value: string) {
  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";

  return url.toString();
}
