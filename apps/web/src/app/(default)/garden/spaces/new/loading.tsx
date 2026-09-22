import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { SpaceSetupShell } from "./space-setup-shell";

export default async function GardenSpaceSetupLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <SpaceSetupShell locale={locale} state="loading">
      <WorkspaceSectionSkeleton locale={locale} rows={3} />
    </SpaceSetupShell>
  );
}
