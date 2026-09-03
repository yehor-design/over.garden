import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getInterfaceCopy } from "@/lib/interface-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { ObjectShell } from "./object-shell";

export default async function PlantObjectLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <ObjectShell locale={locale} state="loading">
      <WorkspaceSectionSkeleton
        locale={locale}
        title={getInterfaceCopy(locale).object.livingObject}
        rows={3}
      />
    </ObjectShell>
  );
}
