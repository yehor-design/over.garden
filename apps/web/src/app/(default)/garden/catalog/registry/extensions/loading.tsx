import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { StableRegistryExtensionsShell } from "../registry-shell";

export default async function StableRegistryExtensionsLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <StableRegistryExtensionsShell locale={locale} state="loading">
      <WorkspaceSectionSkeleton locale={locale} rows={3} />
    </StableRegistryExtensionsShell>
  );
}
