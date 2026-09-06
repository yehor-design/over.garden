import { connection } from "next/server";

import type { CatalogAliasScheme } from "@/lib/catalog/addresses";
import { renderNotFoundPublicCatalogHtml } from "@/lib/public-catalog-lifecycle";
import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  resolvePublicCatalogAlias,
  resolvePublicCatalogPermalink,
} from "@/server/public-catalog-address-repository";

/**
 * The alias resolvers (ADR-0026 D8): `/id/{uuid}` is the permalink;
 * `/eppo/{code}`, `/col/{id}`, `/gbif/{key}` and `/wikidata/{qid}` resolve an
 * external identifier. Each answers 308 to the canonical page, in the locale
 * the request carried, or a real 404 document. Route handlers, so the status
 * is the response's own and no shell streams first.
 */
export async function resolveCatalogAliasRoute(input: {
  scheme: "id" | CatalogAliasScheme;
  value: string;
  request: Request;
  locale?: PublicLocale;
}): Promise<Response> {
  await connection();
  const locale = input.locale ?? DEFAULT_PUBLIC_LOCALE;
  const lookup =
    input.scheme === "id"
      ? await resolvePublicCatalogPermalink(input.value)
      : await resolvePublicCatalogAlias(input.scheme, input.value);

  if (lookup.status === "not_found") {
    const pathname = new URL(input.request.url).pathname;
    return new Response(renderNotFoundPublicCatalogHtml(locale, { pathname }), {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  const target = new URL(
    localizedPath(locale, lookup.canonicalPath),
    input.request.url,
  );
  return new Response(null, {
    status: 308,
    headers: {
      Location: target.toString(),
      "Cache-Control": "public, max-age=300",
    },
  });
}
