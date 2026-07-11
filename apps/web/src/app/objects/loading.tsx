import { PublicObjectCatalog } from "@/components/public/public-object-catalog";
import { getPublicObjectCatalogCopy } from "@/lib/public-object-catalog-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export default async function ObjectsLoading() {
  const locale = await getRequestInterfaceLocale();
  const request = { kind: "all", identity: "all", query: "", page: 1 } as const;

  return (
    <PublicObjectCatalog
      locale={locale}
      copy={getPublicObjectCatalogCopy(locale)}
      page={{
        request,
        cards: [],
        totalCount: 0,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      }}
      state="loading"
    />
  );
}
