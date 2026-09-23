import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getOperatorCatalogCopy } from "@/lib/operator-catalog-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { CatalogOperatorShell } from "../catalog-operator-shell";

/**
 * The frame the owner's decisions arrive into (ADR-0023). Before `OVE-506`
 * the catalogue routes had none of their own, so a hard load stood on the
 * product's generic skeleton until the owner check answered.
 */
export default async function CatalogQueueLoading() {
  const locale = await getRequestInterfaceLocale();
  const copy = getOperatorCatalogCopy(locale);
  return (
    <CatalogOperatorShell
      locale={locale}
      surface="catalog-queue"
      state="loading"
      accessState="checking"
      title={copy.queue.title}
      description={copy.queue.description}
    >
      <WorkspaceSectionSkeleton
        locale={locale}
        title={copy.queue.decisionHeading}
        rows={3}
        media={false}
      />
    </CatalogOperatorShell>
  );
}
