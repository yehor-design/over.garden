import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { StableRegistryShell } from "../registry-shell";

export default async function StableRegistryLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <StableRegistryShell locale={locale} state="loading">
      <WorkspaceSectionSkeleton locale={locale} rows={3} />
    </StableRegistryShell>
  );
}
