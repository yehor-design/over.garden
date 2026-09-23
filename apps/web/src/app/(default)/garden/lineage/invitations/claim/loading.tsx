import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { LineageShell } from "../../lineage-shell";

export default async function LineageInvitationClaimLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <LineageShell locale={locale} section="invitation" state="loading">
      <WorkspaceSectionSkeleton locale={locale} rows={1} />
    </LineageShell>
  );
}
