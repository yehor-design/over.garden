import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { ObjectSetupShell } from "./object-setup-shell";

export default async function GardenObjectSetupLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <ObjectSetupShell locale={locale} state="loading">
      <WorkspaceSectionSkeleton locale={locale} rows={4} />
    </ObjectSetupShell>
  );
}
