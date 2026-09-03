import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { JournalEntryEditShell } from "./edit-shell";

export default async function GardenEntryEditLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <JournalEntryEditShell locale={locale} state="loading">
      <WorkspaceSectionSkeleton locale={locale} rows={3} />
    </JournalEntryEditShell>
  );
}
