import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { LineageUpdatesShell } from "./questions-shell";

export default async function LineageUpdatesLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <LineageUpdatesShell locale={locale} state="loading">
      <WorkspaceSectionSkeleton locale={locale} rows={2} />
    </LineageUpdatesShell>
  );
}
