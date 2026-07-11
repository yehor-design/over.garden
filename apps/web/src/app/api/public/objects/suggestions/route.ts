import {
  listPublicObjectCatalogPage,
  normalizePublicObjectCatalogRequest,
} from "@/server/public-object-catalog-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const catalogRequest = normalizePublicObjectCatalogRequest({
    q: url.searchParams.get("q") ?? "",
    kind: url.searchParams.get("kind") ?? "",
    identity: url.searchParams.get("identity") ?? "",
    page: "1",
  });

  if (catalogRequest.query.length < 2) {
    return publicJson({ suggestions: [] });
  }

  const locale = await getRequestInterfaceLocale();
  const page = await listPublicObjectCatalogPage(catalogRequest, locale);
  const suggestions = page.cards.slice(0, 6).map((card) => ({
    key: card.key,
    label: card.identityName ?? card.representativeObject.displayName,
    href:
      card.catalogPath ??
      card.representativeObject.path ??
      card.latestJournal.path,
    objectKind: card.objectKind,
    identityState: card.identityState,
    journalCount: card.journalCount,
  }));

  return publicJson({ suggestions });
}

function publicJson(body: unknown) {
  return Response.json(body, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
