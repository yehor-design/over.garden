import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getSpacePageCopy } from "@/lib/space-page-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { SpaceShell } from "./space-shell";

export default async function SpacePageLoading() {
  const locale = await getRequestInterfaceLocale();
  const copy = getSpacePageCopy(locale);
  return (
    <SpaceShell locale={locale} state="loading">
      <div className="grid gap-8">
        <WorkspaceSectionSkeleton
          locale={locale}
          title={copy.objects.title}
          rows={2}
        />
        <WorkspaceSectionSkeleton
          locale={locale}
          title={copy.history.title}
          rows={3}
          media={false}
        />
      </div>
    </SpaceShell>
  );
}
