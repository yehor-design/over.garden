import { connection } from "next/server";

import { isEppoArchiveEnabled } from "@/lib/catalog-source/eppo-archive-gate";
import {
  isEppoArchiveDeadlineError,
  listPublicEppoSourcePage,
  parseEppoArchiveRequest,
} from "@/server/catalog-source/public-eppo-explorer-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export async function GET(request: Request) {
  // Suggestions depend on the query string: never a prerendered response.
  await connection();
  const startedAt = performance.now();
  if (!isEppoArchiveEnabled()) return notAvailable();

  const url = new URL(request.url);
  const parsed = parseEppoArchiveRequest({
    q: url.searchParams.get("q"),
    kind: url.searchParams.get("kind"),
    cursor: url.searchParams.get("cursor"),
  });
  if (parsed.error || parsed.request.query.length < 2) {
    return publicJson(
      { error: "invalid_query" },
      400,
      timingHeaders(startedAt),
    );
  }

  try {
    const locale = await getRequestInterfaceLocale();
    const page = await listPublicEppoSourcePage(parsed.request, locale);
    return publicJson(
      {
        suggestions: page.records.map((record) => ({
          eppoCode: record.eppoCode,
          displayName: record.displayName,
          objectKind: record.objectKind,
          evidenceState: record.evidenceState,
          href: record.href,
        })),
        nextCursor: page.nextCursor,
      },
      200,
      timingHeaders(startedAt),
    );
  } catch (error) {
    if (isEppoArchiveDeadlineError(error)) {
      return publicJson({ error: "temporarily_unavailable" }, 503, {
        "Retry-After": "1",
        ...timingHeaders(startedAt),
      });
    }
    return publicJson({ error: "temporarily_unavailable" }, 503, {
      "Retry-After": "1",
      ...timingHeaders(startedAt),
    });
  }
}

function notAvailable() {
  return publicJson({ error: "not_found" }, 404);
}

function timingHeaders(startedAt: number) {
  const duration = Math.max(0, performance.now() - startedAt).toFixed(2);
  return { "Server-Timing": `public_source_query_latency;dur=${duration}` };
}

function publicJson(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      ...extraHeaders,
    },
  });
}
