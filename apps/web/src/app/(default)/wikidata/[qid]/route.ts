import { resolveCatalogAliasRoute } from "@/app/catalog-alias-route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ qid: string }> },
) {
  const { qid } = await params;
  return resolveCatalogAliasRoute({ scheme: "wikidata", value: qid, request });
}
