import { resolveCatalogAliasRoute } from "@/app/catalog-alias-route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params;
  return resolveCatalogAliasRoute({ scheme: "id", value: uuid, request });
}
