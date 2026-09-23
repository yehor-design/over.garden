import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getSpacePageCopy } from "@/lib/space-page-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { SpaceSettingsShell } from "../space-shell";

export default async function SpaceSettingsLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <SpaceSettingsShell locale={locale} state="loading">
      <div>
        <WorkspaceSectionSkeleton
          locale={locale}
          title={getSpacePageCopy(locale).settings.detailsTitle}
          rows={2}
          media={false}
        />
      </div>
    </SpaceSettingsShell>
  );
}
