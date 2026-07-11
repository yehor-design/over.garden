import { PublicJournalDirectory } from "@/components/public/public-journal-directory";
import { getPublicJournalDirectoryCopy } from "@/lib/public-journal-directory-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  emptyPublicJournalDirectoryFacets,
  emptyPublicJournalDirectoryPage,
} from "./page";

export default async function LocalizedJournalsLoading() {
  const locale = await getRequestInterfaceLocale();
  const request = {
    query: "",
    kind: "all",
    catalog: null,
    topic: null,
    season: "all",
    region: null,
    sort: "recent",
    page: 1,
  } as const;

  return (
    <PublicJournalDirectory
      locale={locale}
      copy={getPublicJournalDirectoryCopy(locale)}
      page={emptyPublicJournalDirectoryPage(request)}
      facets={emptyPublicJournalDirectoryFacets()}
      state="loading"
    />
  );
}
