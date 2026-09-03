import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { StableRegistryEditionsShell } from "../registry-shell";

export default async function StableRegistryEditionsLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <StableRegistryEditionsShell locale={locale} state="loading">
      <WorkspaceSectionSkeleton locale={locale} rows={3} />
    </StableRegistryEditionsShell>
  );
}
