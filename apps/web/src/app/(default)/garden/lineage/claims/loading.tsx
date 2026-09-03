import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { LineageClaimsShell } from "./claims-shell";

export default async function LineageClaimsLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <LineageClaimsShell locale={locale} state="loading">
      <WorkspaceSectionSkeleton locale={locale} rows={2} />
    </LineageClaimsShell>
  );
}
