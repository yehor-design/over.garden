import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import {
  normalizePublicJournalDirectoryRequest,
  type PublicJournalDirectoryRequest,
} from "@/server/public-journal-directory-repository";

const ALLOWED_DIRECTORY_PATHS = new Map<string, PublicLocale>([
  ["/journals", "uk"],
  ["/bg/journals", "bg"],
  ["/ru/journals", "ru"],
]);

export function buildPublicJournalDirectoryHref(
  locale: PublicLocale,
  request: PublicJournalDirectoryRequest,
) {
  const params = new URLSearchParams();
  if (request.query) params.set("q", request.query);
  if (request.kind !== "all") params.set("kind", request.kind);
  if (request.catalog) params.set("catalog", request.catalog);
  if (request.topic) params.set("topic", request.topic);
  if (request.season !== "all") params.set("season", request.season);
  if (request.region) params.set("region", request.region);
  const defaultSort = request.query ? "relevance" : "recent";
  if (request.sort !== defaultSort) params.set("sort", request.sort);
  if (request.page > 1) params.set("page", String(request.page));

  const path = localizedPath(locale, "/journals");
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function normalizePublicJournalDirectoryReturnTo(
  value: string | null | undefined,
  fallbackLocale: PublicLocale,
) {
  const fallback = localizedPath(fallbackLocale, "/journals");
  if (!value || value.length > 1_500 || !value.startsWith("/")) return fallback;

  try {
    const url = new URL(value, "https://over.garden");
    if (url.origin !== "https://over.garden" || url.hash) return fallback;
    const locale = ALLOWED_DIRECTORY_PATHS.get(url.pathname);
    if (!locale) return fallback;

    const request = normalizePublicJournalDirectoryRequest({
      q: url.searchParams.get("q") ?? undefined,
      kind: url.searchParams.get("kind") ?? undefined,
      catalog: url.searchParams.get("catalog") ?? undefined,
      topic: url.searchParams.get("topic") ?? undefined,
      season: url.searchParams.get("season") ?? undefined,
      region: url.searchParams.get("region") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
    });
    return buildPublicJournalDirectoryHref(locale, request);
  } catch {
    return fallback;
  }
}
