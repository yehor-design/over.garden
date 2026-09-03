import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { ErasureRequestsShell } from "./erasure-shell";

export default async function ErasureRequestsLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <ErasureRequestsShell locale={locale} state="loading" accessState="allowed">
      <WorkspaceSectionSkeleton locale={locale} rows={2} />
    </ErasureRequestsShell>
  );
}
