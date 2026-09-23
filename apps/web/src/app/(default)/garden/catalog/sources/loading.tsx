import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getOperatorCatalogCopy } from "@/lib/operator-catalog-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { CatalogOperatorShell } from "../catalog-operator-shell";

/** The frame the sources and the catalogue's own numbers arrive into. */
export default async function CatalogSourcesLoading() {
  const locale = await getRequestInterfaceLocale();
  const copy = getOperatorCatalogCopy(locale);
  return (
    <CatalogOperatorShell
      locale={locale}
      surface="catalog-sources"
      state="loading"
      accessState="checking"
      title={copy.sources.title}
      description={copy.sources.description}
    >
      <WorkspaceSectionSkeleton
        locale={locale}
        title={copy.sources.heading}
        rows={3}
        media={false}
      />
    </CatalogOperatorShell>
  );
}
