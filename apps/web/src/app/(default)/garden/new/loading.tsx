import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { EntryComposerShell } from "./entry-composer-shell";

export default async function GardenEntryComposerLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <EntryComposerShell locale={locale} state="loading">
      <WorkspaceSectionSkeleton locale={locale} rows={4} />
    </EntryComposerShell>
  );
}
