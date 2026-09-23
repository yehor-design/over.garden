import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { LineageShell } from "../lineage-shell";

export default async function LineageClaimsLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <LineageShell locale={locale} section="claims" state="loading">
      <WorkspaceSectionSkeleton locale={locale} rows={2} />
    </LineageShell>
  );
}
