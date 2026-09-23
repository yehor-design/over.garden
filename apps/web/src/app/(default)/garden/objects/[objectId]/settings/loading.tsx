import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getOwnerObjectCopy } from "@/lib/owner-object-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { ObjectSubpageShell } from "../object-shell";

export default async function ObjectSettingsLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <ObjectSubpageShell locale={locale} section="settings" state="loading">
      <WorkspaceSectionSkeleton
        locale={locale}
        title={getOwnerObjectCopy(locale).settingsPage.title}
        rows={3}
        media={false}
      />
    </ObjectSubpageShell>
  );
}
