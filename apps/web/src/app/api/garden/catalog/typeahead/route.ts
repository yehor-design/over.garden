import { CATALOG_TYPEAHEAD_PUBLIC_PATH } from "@/lib/garden/catalog-typeahead-contract";

/**
 * The picker moved to `/api/public/catalog/typeahead` (ADR-0026 D7). This
 * path answers a permanent redirect for one release so a stale client bundle
 * keeps working, then goes.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL(CATALOG_TYPEAHEAD_PUBLIC_PATH, url.origin);
  target.search = url.search;
  return Response.redirect(target.toString(), 308);
}
